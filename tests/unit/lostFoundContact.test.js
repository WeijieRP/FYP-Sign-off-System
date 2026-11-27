// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The encrypted Lost & Found contact (backend/features/lostFound/contact.js), with a fake encrypt and decrypt, so
// no database and no encryption key are needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const contact = require('../../backend/features/lostFound/contact');

const encrypt = (text) => `enc:${Buffer.from(text).toString('hex')}`;
const decrypt = (value) => {
    if (!String(value).startsWith('enc:')) throw new Error('broken value');
    return Buffer.from(String(value).slice(4), 'hex').toString();
};

test('a new report stores the contact encrypted and leaves the plain column empty', () => {
    assert.deepEqual(contact.encryptedColumns('  owner@example.com ', encrypt), { contact_info: '', contact_info_encrypted: encrypt('owner@example.com') });
    assert.deepEqual(contact.encryptedColumns('', encrypt), { contact_info: '', contact_info_encrypted: null });
});

test('revealContact decrypts a new row and returns the plain value of a row from before', () => {
    assert.equal(contact.revealContact({ contact_info: '', contact_info_encrypted: encrypt('9123 4567') }, decrypt), '9123 4567');
    assert.equal(contact.revealContact({ contact_info: 'old@example.com', contact_info_encrypted: null }, decrypt), 'old@example.com');
    assert.equal(contact.revealContact({ contact_info: '', contact_info_encrypted: null }, decrypt), null);
    assert.throws(() => contact.revealContact({ contact_info_encrypted: 'not-encrypted' }, decrypt), /broken value/);
});

test('needsEncrypting is true only for a plain row with nothing encrypted yet, so the conversion can run twice', () => {
    assert.equal(contact.needsEncrypting({ contact_info: 'old@example.com', contact_info_encrypted: null }), true);
    assert.equal(contact.needsEncrypting({ contact_info: '', contact_info_encrypted: encrypt('x') }), false);
    assert.equal(contact.needsEncrypting({ contact_info: 'old@example.com', contact_info_encrypted: encrypt('old@example.com') }), false);
    assert.equal(contact.needsEncrypting({ contact_info: '   ', contact_info_encrypted: null }), false);
});

test('withoutContact sends everything but the contact, and says whether there is one', () => {
    const row = { id: 3, item_description: 'Umbrella', contact_info: '', contact_info_encrypted: encrypt('a@b.c') };
    assert.deepEqual(contact.withoutContact(row), { id: 3, item_description: 'Umbrella', has_contact: true });
    assert.deepEqual(contact.withoutContact({ id: 4, contact_info: 'plain', contact_info_encrypted: null }), { id: 4, has_contact: true });
    assert.deepEqual(contact.withoutContact({ id: 5, contact_info: '', contact_info_encrypted: null }), { id: 5, has_contact: false });
});
// <Jun Kai end>
