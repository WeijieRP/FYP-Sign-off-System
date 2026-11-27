// Owner: shared (lead: Role 3, Jun Kai).
// Writes one audit_logs row; a copy of the helper in features/admin/routes.js so feature routers can use it too.
// <Jun Kai start>
const db = require('./db');

function logAudit(action, adminUsername, targetType = null, targetId = null, req = null) {
    // target_id is an INT column: text ids go into target_type instead
    let targetIdValue = null;
    let targetTypeValue = targetType;
    if (targetId !== null && targetId !== undefined && /^\d+$/.test(String(targetId))) targetIdValue = Number(targetId);
    else if (targetId) targetTypeValue = String(targetType ? `${targetType}:${targetId}` : targetId).slice(0, 50);

    const ip = req ? req.ip || req.headers['x-forwarded-for'] || (req.connection && req.connection.remoteAddress) : 'unknown';
    const userAgent = req ? req.headers['user-agent'] : 'unknown';

    // fire and forget, like the original
    db.run('INSERT INTO audit_logs (action, admin_username, target_type, target_id, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
        [action, adminUsername, targetTypeValue, targetIdValue, ip, userAgent], (err) => {
            if (err) console.error('Audit log failed:', err.message);
        });
}

module.exports = { logAudit };
// <Jun Kai end>
