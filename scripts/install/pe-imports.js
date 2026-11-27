// Owner: Role 3, Jun Kai.
// Reads which DLLs a Windows program or library needs (the import table of a PE file), so the package build can
// prove that a fresh Windows PC has everything: each DLL must be in the package, next to the file, or a part of
// Windows itself. The Visual C++ runtime is NOT counted as part of Windows (the build machine has it, a fresh PC
// may not), so MySQL must bring its own copy.
// <Jun Kai start>
const fs = require('fs');
const path = require('path');

const MACHINE_X64 = 0x8664;
// DLLs that come with Visual Studio or its redistributable, never with Windows itself
const REDIST = /^(vcruntime\d+(_\d+)?|msvcp\d+(_\w+)?|concrt\d+|vccorlib\d+|vcomp\d+|vcamp\d+|mfc\d+\w*|msvcr\d+|ucrtbased|atl\d+)\.dll$/i;

// { machine, imports: [names], delayed: [names] } of a PE file, or null when it is not one
function readImports(buf) {
    if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) return null; // "MZ"
    const pe = buf.readUInt32LE(0x3c);
    if (pe + 24 > buf.length || buf.readUInt32LE(pe) !== 0x4550) return null; // "PE\0\0"
    const coff = pe + 4;
    const machine = buf.readUInt16LE(coff);
    const sections = buf.readUInt16LE(coff + 2);
    const optSize = buf.readUInt16LE(coff + 16);
    const opt = coff + 20;
    const magic = buf.readUInt16LE(opt);
    const plus = magic === 0x20b;
    const imageBase = plus ? Number(buf.readBigUInt64LE(opt + 24)) : buf.readUInt32LE(opt + 28);
    const dirs = opt + (plus ? 112 : 96);
    const dirCount = buf.readUInt32LE(opt + (plus ? 108 : 92));
    const table = [];
    const secStart = opt + optSize;
    for (let i = 0; i < sections; i++) {
        const s = secStart + i * 40;
        table.push({ va: buf.readUInt32LE(s + 12), vsize: buf.readUInt32LE(s + 8), raw: buf.readUInt32LE(s + 20), rawSize: buf.readUInt32LE(s + 16) });
    }
    const toOffset = (rva) => {
        for (const s of table) {
            if (rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize)) return rva - s.va + s.raw;
        }
        return -1;
    };
    const cstr = (off) => {
        if (off < 0 || off >= buf.length) return '';
        let end = off;
        while (end < buf.length && buf[end] !== 0) end++;
        return buf.toString('latin1', off, end);
    };
    const names = (dirIndex, size, nameAt, isDelayed) => {
        const out = [];
        if (dirCount <= dirIndex) return out;
        const rva = buf.readUInt32LE(dirs + dirIndex * 8);
        if (!rva) return out;
        let off = toOffset(rva);
        if (off < 0) return out;
        for (let n = 0; n < 4096 && off + size <= buf.length; n++, off += size) {
            if (buf.subarray(off, off + size).every((b) => b === 0)) break;
            let nameRva = buf.readUInt32LE(off + nameAt);
            // old style delay descriptors (attribute bit 0 clear) hold addresses, not RVAs
            if (isDelayed && (buf.readUInt32LE(off) & 1) === 0 && nameRva >= imageBase) nameRva -= imageBase;
            const name = cstr(toOffset(nameRva));
            if (name) out.push(name);
        }
        return out;
    };
    return { machine, imports: names(1, 20, 12, false), delayed: names(13, 32, 4, true) };
}

function isWindowsDll(name, system32) {
    const lower = name.toLowerCase();
    if (lower.startsWith('api-ms-win-') || lower.startsWith('ext-ms-')) return true;
    if (REDIST.test(lower)) return false;
    return fs.existsSync(path.join(system32, lower));
}

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(exe|dll|node)$/i.test(entry.name)) out.push(full);
    }
    return out;
}

// Every x64 .exe, .dll and .node under each root, with the DLLs it needs that are nowhere to be found.
// nodeDir: where node.exe is (an addon may load DLLs from there and links against node.exe itself).
// hosts: libraries that a program loads into itself, e.g. MySQL's plugins: { root, dir, programs }. Windows looks
// for their DLLs in the program's folder (dir) too, and they may use the program's own exports (programs).
function checkTree(roots, { system32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'), nodeDir, hosts = [] } = {}) {
    const files = roots.flatMap((r) => walk(r));
    const inPackage = new Set(files.map((f) => path.basename(f).toLowerCase()));
    const problems = [];
    const warnings = [];
    let checked = 0;
    for (const file of files) {
        let info;
        try { info = readImports(fs.readFileSync(file)); } catch { info = null; }
        if (!info || info.machine !== MACHINE_X64) continue;
        checked++;
        const dir = path.dirname(file);
        const found = (dll) => {
            const lower = dll.toLowerCase();
            if (fs.existsSync(path.join(dir, lower))) return true;
            if (/\.node$/i.test(file) && (lower === 'node.exe' || (nodeDir && fs.existsSync(path.join(nodeDir, lower))))) return true;
            for (const h of hosts) {
                if (!(file.toLowerCase() + '').startsWith(path.resolve(h.root).toLowerCase() + path.sep)) continue;
                if ((h.programs || []).map((p) => p.toLowerCase()).includes(lower)) return true;
                if (fs.existsSync(path.join(h.dir, lower))) return true;
            }
            return isWindowsDll(lower, system32);
        };
        for (const dll of info.imports) if (!found(dll)) problems.push(`${file} needs ${dll}${inPackage.has(dll.toLowerCase()) ? ' (it is in the package, but not next to this file)' : ''}`);
        for (const dll of info.delayed) if (!found(dll)) warnings.push(`${file} may load ${dll} later (delay load)`);
    }
    return { checked, problems, warnings };
}

module.exports = { readImports, isWindowsDll, checkTree, REDIST, MACHINE_X64 };
// <Jun Kai end>
