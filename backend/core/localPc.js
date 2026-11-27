// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// "Is this request made on the PC itself?" The answer comes from the address of the connection, never from a header
// such as X-Forwarded-For, which the sender can set.
const os = require('os');

// the loopback address: a connection that never left the PC
function isThisPc(address) {
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(address || ''));
}

// every address this PC has right now: [{ address, family, internal }]
function addressesNow(interfaces = os.networkInterfaces()) {
    return Object.values(interfaces || {}).flat().filter(Boolean);
}

// A connection whose sender is the PC itself: the loopback address, or one of the PC's own addresses. A browser on the
// PC that opens https://<the PC's address>:3000 connects from that address, not from 127.0.0.1. Another machine cannot
// use the PC's address as its own: the answers would go to the PC, so its connection is never set up.
function isOwnAddress(address, interfaces) {
    const text = String(address || '').replace(/%.*$/, ''); // an IPv6 address may carry a zone (fe80::1%12)
    if (!text) return false;
    if (isThisPc(text)) return true;
    const plain = text.startsWith('::ffff:') ? text.slice(7) : text; // IPv4 written the IPv6 way
    return addressesNow(interfaces).some((a) => a.address === plain || a.address === text);
}

// For the routes that tell about the server itself (its addresses, its table names, the sender address of the emails):
// a signed-in admin, or a request made on the PC. The tests and the wall browser run on the PC; a tablet does not.
function signedInOrThisPc(req, res, next) {
    if ((req.session && req.session.user) || isThisPc(req.socket.remoteAddress)) return next();
    // not the text of the sign-in check: the admin page signs out on that one, and this is only a line on a status card
    res.status(401).json({ error: 'Only for a signed-in admin or a request made on the PC itself' });
}

module.exports = { isThisPc, isOwnAddress, addressesNow, signedInOrThisPc };
// <Jun Kai end>
