// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The contact a visitor types on a Lost & Found report (email or phone) is stored encrypted, the same way and with
// the same key as visitor emails (auth.encryptEmail: AES-256-GCM, "iv:authTag:data"). The plain column contact_info
// stays empty for new reports. Rows saved before this change still hold the contact in contact_info until
// database/encrypt-lostfound-contacts.js has converted them; until then they are revealed through the same password
// check. No database access here, so the unit tests can use it with a fake encrypt and decrypt.

// the values for the two contact columns of a new report
function encryptedColumns(contact, encrypt) {
    const value = String(contact || '').trim();
    return { contact_info: '', contact_info_encrypted: value ? encrypt(value) : null };
}

// true when a report has a contact at all (encrypted, or plain from before the change)
function hasContact(row) {
    return !!(row && (row.contact_info_encrypted || String(row.contact_info || '').trim()));
}

// the plain contact of a report, or null; decrypt throws on a broken value, which the caller reports
function revealContact(row, decrypt) {
    if (!row) return null;
    if (row.contact_info_encrypted) return decrypt(row.contact_info_encrypted);
    const plain = String(row.contact_info || '').trim();
    return plain || null;
}

// a row from before the change: a plain contact and nothing encrypted yet
function needsEncrypting(row) {
    return !!(row && !row.contact_info_encrypted && String(row.contact_info || '').trim());
}

// a report as the admin list sends it: everything except the contact itself
function withoutContact(row) {
    const { contact_info: plain, contact_info_encrypted: encrypted, ...rest } = row || {};
    return { ...rest, has_contact: hasContact({ contact_info: plain, contact_info_encrypted: encrypted }) };
}

module.exports = { encryptedColumns, hasContact, revealContact, needsEncrypting, withoutContact };
// <Jun Kai end>
