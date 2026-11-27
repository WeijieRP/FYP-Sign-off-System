// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// The secrets of a password reset: a 6 digit code and a link token, both random, and their keyed hashes. Only the
// hashes are stored, keyed with a secret of this server, so a copy of the database alone cannot be used to test codes.
// No database here, so the unit tests can call everything directly.
const crypto = require('crypto');

const CODE_DIGITS = 6;
const LINK_BYTES = 32;

// the key for the hashes: from SESSION_SECRET (set by the installer), else ENCRYPTION_KEY, else a fixed development
// value; derived, so the hashes never equal a value used elsewhere
function hashKey(env = process.env) {
    const secret = env.SESSION_SECRET || env.ENCRYPTION_KEY || 'rp-xperience-password-reset-development-key';
    return crypto.createHash('sha256').update(`password-reset:${secret}`).digest();
}

function makeSecrets(random = crypto) {
    const code = String(random.randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
    const link = random.randomBytes(LINK_BYTES).toString('base64url');
    return { code, link };
}

// kind is 'code' or 'link', so a code can never stand in for a link token or the other way round
function hashSecret(kind, value, key = hashKey()) {
    return crypto.createHmac('sha256', key).update(`${kind}:${String(value)}`).digest('hex');
}

// compares two hex hashes in constant time
function sameHash(a, b) {
    const one = Buffer.from(String(a || ''), 'hex');
    const two = Buffer.from(String(b || ''), 'hex');
    return one.length === 32 && two.length === 32 && crypto.timingSafeEqual(one, two);
}

// what a person types: spaces and dashes are allowed between the digits ("123 456")
function cleanCode(value) {
    const digits = String(value || '').replace(/[\s-]/g, '');
    return new RegExp(`^\\d{${CODE_DIGITS}}$`).test(digits) ? digits : null;
}

// a link token as it comes back from the page: base64url, the length makeSecrets gives
function cleanLink(value) {
    const text = String(value || '').trim();
    return /^[A-Za-z0-9_-]{43}$/.test(text) ? text : null;
}

module.exports = { hashKey, makeSecrets, hashSecret, sameHash, cleanCode, cleanLink, CODE_DIGITS };
// <Jun Kai end>
