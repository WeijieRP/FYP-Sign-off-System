// Owner: shared (lead: Role 3, Jun Kai).
// One place to create ZIP archives (archiver 7 exports a function, archiver 8 exports classes) and to read them back (yauzl).
const archiverLib = require('archiver');

function createZipArchive(options = { zlib: { level: 9 } }) {
    if (typeof archiverLib === 'function') return archiverLib('zip', options); // archiver 7
    return new archiverLib.ZipArchive(options); // archiver 8+
}

// <Jun Kai start>
const crypto = require('crypto');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const yauzl = require('yauzl');

// Always close() the handle in a finally block: Windows keeps the file locked while it is open
function openZip(file) {
    return yauzl.openPromise(file, { autoClose: false, strictFileNames: true });
}

// name -> entry. Two entries with the same name leave entries.size below zip.entryCount.
async function listEntries(zip) {
    const entries = new Map();
    for await (const entry of zip.eachEntry()) entries.set(entry.fileName, entry);
    return entries;
}

// Streams one entry through sha256 and checks its CRC (yauzl does not)
async function hashEntry(zip, entry) {
    const hash = crypto.createHash('sha256');
    let crc = 0;
    let size = 0;
    for await (const chunk of await zip.openReadStreamPromise(entry)) {
        hash.update(chunk);
        crc = zlib.crc32(chunk, crc);
        size += chunk.length;
    }
    if ((crc >>> 0) !== entry.crc32) throw new Error(`CRC mismatch in ${entry.fileName}`);
    return { sha256: hash.digest('hex'), size };
}

async function readEntry(zip, entry) {
    const parts = [];
    let crc = 0;
    for await (const chunk of await zip.openReadStreamPromise(entry)) {
        parts.push(chunk);
        crc = zlib.crc32(chunk, crc);
    }
    if ((crc >>> 0) !== entry.crc32) throw new Error(`CRC mismatch in ${entry.fileName}`);
    return Buffer.concat(parts);
}

const MAX_JSON_BYTES = 256 * 1024 * 1024;

// A damaged or huge archive is refused before anything is read into memory (yauzl also checks the real size)
async function readJsonEntry(zip, entry) {
    if (entry.uncompressedSize > MAX_JSON_BYTES) throw new Error(`${entry.fileName} is too large to open (over 256 MB).`);
    return JSON.parse((await readEntry(zip, entry)).toString('utf8'));
}

function pipeEntry(zip, entry, writable) {
    return zip.openReadStreamPromise(entry).then((stream) => pipeline(stream, writable));
}

module.exports = { createZipArchive, openZip, listEntries, hashEntry, readEntry, readJsonEntry, pipeEntry };
// <Jun Kai end>
