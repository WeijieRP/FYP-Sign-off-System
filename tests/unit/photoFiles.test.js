// Owner: Role 3, Jun Kai.
// Unit tests for the photo name and stored photo path checks (backend/core/photoFiles.js). Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { plainName, insideUploads } = require('../../backend/core/photoFiles');

test('plainName keeps the names the kiosk really saves', () => {
    for (const name of [
        'ASDFGHJ_desktop_2026-01-29T08-14-47-838Z.png',
        'asdfghjkl__desktop_cute_processed_2026-01-29T09-22-22-037Z.png',
        '____desktop_2026-05-12T08-45-46-978Z.jpg', // a name in another script becomes underscores
        'anonymous_kiosk-1_ocean_processed_2026-11-25T10-00-00-000Z.gif'
    ]) assert.equal(plainName(name), name);
    assert.equal(plainName('  photo.png  '), 'photo.png', 'spaces around the name are dropped');
});

test('plainName refuses anything that could point outside the folder', () => {
    for (const name of [
        '../../backend/.env', '..\\..\\backend\\.env', 'photos/x.png', 'photos\\x.png', '/etc/passwd',
        'C:\\Windows\\win.ini', 'C:photo.png', '..', 'a..b.png', 'photo.png\0.txt', '', '   ', 'x'.repeat(256)
    ]) assert.equal(plainName(name), null, name);
    for (const value of [null, undefined, 42, {}, ['photo.png']]) assert.equal(plainName(value), null);
});

test('insideUploads gives the same file as before for stored paths, and null when they leave the folder', () => {
    const root = path.resolve('/kiosk/uploads');
    assert.equal(insideUploads('photos/a.png', root), path.join(root, 'photos', 'a.png'));
    assert.equal(insideUploads('processed/b.png', root), path.join(root, 'processed', 'b.png'));
    assert.equal(insideUploads('/photos/c.png', root), path.join(root, 'photos', 'c.png'), 'a leading slash still joins under uploads');
    assert.equal(insideUploads('photos/../photos/d.png', root), path.join(root, 'photos', 'd.png'));
    for (const stored of ['photos/../../backend/.env', '../x.png', 'photos/../..', '.', '', '   ', null, 7]) {
        assert.equal(insideUploads(stored, root), null, String(stored));
    }
});
// <Jun Kai end>
