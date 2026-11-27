// Owner: Role 3, Jun Kai.
// File helpers for the Visitor Data Archive: archive folder rules, upload paths, photo lists, entry names and CSV text (no database).
// <Jun Kai start>
const fs = require('fs');
const path = require('path');
const paths = require('../../core/paths');
const schedule = require('./visitorSchedule');

const DEFAULT_FOLDER = path.join(paths.DATA, 'archives');
const IS_WINDOWS = process.platform === 'win32';
const TEMPORARY_RETENTION = new Set(['temporary', '7days', '7day']);

const isTemporary = (value) => TEMPORARY_RETENTION.has(String(value || '').toLowerCase());

// 'photos/x.png', '/uploads/lost-found/x.png' -> absolute path inside uploads/, or null when it points anywhere else
function resolveUploadPath(dbPath) {
    if (typeof dbPath !== 'string' || !dbPath.trim()) return null;
    let relative = dbPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (relative.toLowerCase().startsWith('uploads/')) relative = relative.slice('uploads/'.length);
    const full = path.resolve(paths.UPLOADS, relative);
    const rel = path.relative(paths.UPLOADS, full);
    if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
    return full;
}

// The disk checks below use fs.promises, so a slow or missing drive never blocks the server
const pathExists = (target) => fs.promises.stat(target).then(() => true, () => false);

async function nearestExisting(target) {
    let current = path.resolve(target);
    while (!(await pathExists(current))) {
        const parent = path.dirname(current);
        if (parent === current) return null;
        current = parent;
    }
    return current;
}

// Real path even when the last folders do not exist yet (8.3 short names and links are resolved on the part that exists)
async function realPath(target) {
    const resolved = path.resolve(target);
    const existing = await nearestExisting(resolved);
    if (!existing) return resolved;
    const real = await fs.promises.realpath(existing).catch(() => existing);
    return path.join(real, path.relative(existing, resolved));
}

function isInside(child, parent) {
    const rel = path.relative(IS_WINDOWS ? parent.toLowerCase() : parent, IS_WINDOWS ? child.toLowerCase() : child);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

// Read when called (the unit tests point paths.UPLOADS at a temp folder)
const servedFolders = () => [paths.FRONTEND, paths.ASSETS, paths.UPLOADS];

// Where an archive folder may not be: anywhere the web server serves without a login, or inside the app
function placeProblem(target, served, root, data) {
    if (served.some((dir) => isInside(target, dir))) return 'This folder is served by the web server without a login. Choose a folder outside the app.';
    if (isInside(target, root) && !isInside(target, data)) return 'Choose a folder outside the app folder, or use the default folder.';
    return null;
}

// The path text only (no disk access): returns a plain-English problem or null. '' means the default folder.
function folderTextProblem(folder) {
    if (typeof folder !== 'string') return 'Enter the folder as text.';
    const value = folder.trim();
    if (!value) return null;
    if (value.length > 400) return 'The folder path is too long (400 characters at most).';
    // \\server\share, \\?\ and \\.\ paths (and //server): the archive goes to a disk of this PC
    if (/^[\\/]{2}/.test(value)) return 'Choose a folder on this PC or on a drive plugged into it. Network folders are not supported.';
    if (!path.isAbsolute(value) || (IS_WINDOWS && !/^[a-zA-Z]:[\\/]/.test(value))) return 'Enter a full folder path, for example D:\\Visitor archives.';
    const rest = value.slice(path.parse(value).root.length);
    if (/[\u0000-\u001f]/.test(value) || (IS_WINDOWS && /[<>:"|?*]/.test(rest))) return 'The folder path contains characters that are not allowed.';
    return null;
}

// Path rules without touching the disk (settings validation): the text, then the place of the folder as written
function folderProblem(folder) {
    const problem = folderTextProblem(folder);
    if (problem || !folder.trim()) return problem;
    return placeProblem(path.resolve(folder.trim()), servedFolders().map((dir) => path.resolve(dir)), path.resolve(paths.ROOT), path.resolve(paths.DATA));
}

// All the rules, with the place checked again on real paths (links, junctions and short names resolved)
async function folderRealProblem(folder) {
    const problem = folderProblem(folder);
    if (problem || !folder.trim()) return problem;
    const [target, root, data, ...served] = await Promise.all([folder.trim(), paths.ROOT, paths.DATA, ...servedFolders()].map(realPath));
    return placeProblem(target, served, root, data);
}

// What the Storage card shows about a folder; no side effects
async function checkFolder(folder) {
    const value = typeof folder === 'string' ? folder.trim() : '';
    const isDefault = value === '';
    const target = isDefault ? DEFAULT_FOLDER : value;
    const report = { path: target, isDefault, exists: false, writable: false, willCreate: false, freeBytes: null, totalBytes: null, problem: isDefault ? null : await folderRealProblem(folder) };
    if (report.problem) return report;
    const resolved = path.resolve(target);
    const existing = await nearestExisting(resolved);
    if (!existing) return { ...report, problem: 'This drive or folder does not exist.' };
    try {
        if (!(await fs.promises.stat(existing)).isDirectory()) {
            return { ...report, problem: existing === resolved ? 'This path is a file, not a folder.' : 'Part of this path is a file, not a folder.' };
        }
        const canWrite = await fs.promises.access(existing, fs.constants.W_OK).then(() => true, () => false);
        report.exists = existing === resolved;
        if (report.exists) report.writable = canWrite;
        else report.willCreate = canWrite;
        const stats = await fs.promises.statfs(existing);
        report.freeBytes = stats.bavail * stats.bsize;
        report.totalBytes = stats.blocks * stats.bsize;
    } catch (error) {
        return { ...report, problem: `The folder could not be checked (${error.code || error.message}).` };
    }
    if (report.exists && !report.writable) report.problem = 'The server cannot write to this folder.';
    else if (!report.exists && !report.willCreate) report.problem = 'The folder does not exist and cannot be created there.';
    return report;
}

// Before a run: create the folder, prove a file can be written and removed, return the free bytes
async function prepareFolder(dir) {
    await fs.promises.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}-${Date.now()}.tmp`);
    await fs.promises.writeFile(probe, 'ok');
    await fs.promises.rm(probe, { force: true, maxRetries: 5 });
    const stats = await fs.promises.statfs(dir);
    return stats.bavail * stats.bsize;
}

function photoEntryName(table, id, column, dbPath) {
    const ext = path.extname(String(dbPath || '')).slice(1).toLowerCase();
    const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin';
    if (table === 'lost_found_reports') return `photos/lost-found/${id}.${safeExt}`;
    return `photos/feedback/${id}-${column === 'processed_photo_path' ? 'processed' : 'raw'}.${safeExt}`;
}

// Every photo path of the selected rows: which files exist, which go into the zip, which are missing
async function planPhotos(feedbackRows, lostFoundRows, includePhotos) {
    const wanted = [];
    for (const row of feedbackRows) {
        for (const column of ['photo_path', 'processed_photo_path']) {
            if (row[column]) wanted.push({ table: 'feedback', id: row.id, column, path: row[column], temporary: isTemporary(row.data_retention) });
        }
    }
    for (const row of lostFoundRows) {
        if (row.item_photo_path) wanted.push({ table: 'lost_found_reports', id: row.id, column: 'item_photo_path', path: row.item_photo_path, temporary: false });
    }
    const plan = { sources: [], photos: [], missing: [], onDisk: 0, onDiskBytes: 0, includedBytes: 0, temporaryTrimmed: 0 };
    for (const item of wanted) {
        const file = resolveUploadPath(item.path);
        const stat = file ? await fs.promises.stat(file).catch(() => null) : null;
        let entry = null;
        if (!stat || !stat.isFile()) {
            plan.missing.push({ table: item.table, id: item.id, column: item.column, path: item.path });
        } else {
            plan.onDisk++;
            plan.onDiskBytes += stat.size;
            if (includePhotos && !item.temporary) {
                entry = photoEntryName(item.table, item.id, item.column, item.path);
                plan.photos.push({ entry, file, size: stat.size });
                plan.includedBytes += stat.size;
            } else if (includePhotos) {
                plan.temporaryTrimmed++;
            }
        }
        plan.sources.push({ entry, table: item.table, id: item.id, column: item.column, path: item.path });
    }
    return plan;
}

function archiveBaseName(now) {
    const stamp = schedule.toSgtDateTime(now);
    return `visitor-archive-${stamp.slice(0, 10)}-${stamp.slice(11, 13)}${stamp.slice(14, 16)}`;
}

// visitor-archive-YYYY-MM-DD-HHmm.zip, then -2, -3... when that name is on disk or already used by a history row.
// onDisk: the folder's file names when the caller has already read them (a run reads them with fs.promises)
function pickArchiveName(folder, now, taken = [], onDisk = null) {
    const used = new Set(taken.map((name) => String(name).toLowerCase()));
    const present = onDisk ? new Set(onDisk.map((name) => String(name).toLowerCase())) : null;
    const isOnDisk = (name) => (present ? present.has(name.toLowerCase()) : fs.existsSync(path.join(folder, name)));
    const base = archiveBaseName(now);
    for (let n = 1; n <= 500; n++) {
        const name = `${base}${n === 1 ? '' : `-${n}`}.zip`;
        if (used.has(name.toLowerCase())) continue;
        if ([name, `${name}.partial`, `${name}.sha256`].some(isOnDisk)) continue;
        return name;
    }
    throw new Error('Could not find a free archive file name.');
}

// Quoted cell; text that a spreadsheet would run as a formula gets a leading apostrophe
function csvCell(value) {
    if (value === null || value === undefined) return '""';
    let text = value instanceof Date ? value.toISOString() : String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(header, rows) {
    return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

module.exports = {
    DEFAULT_FOLDER, isTemporary, resolveUploadPath, folderTextProblem, folderProblem, folderRealProblem, checkFolder, prepareFolder,
    pathExists, photoEntryName, planPhotos, pickArchiveName, csvCell, toCsv
};
// <Jun Kai end>
