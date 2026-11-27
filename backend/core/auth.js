// Owner: shared (lead: Role 3, Jun Kai). Previous team: Preti (16), Yu Kang (2), Caeden (1).
// ============================================================
// AUTH.JS - TABLE OF CONTENTS
// ============================================================
// 
// 1. CONFIGURATION
//    const SALT_ROUNDS                - bcrypt salt rounds configuration (DONE BY PRETI)
//    const ENCRYPTION_KEY             - Email encryption key from environment (DONE BY PRETI)
//    const ENCRYPTION_ALGORITHM       - AES-256-GCM algorithm constant (DONE BY PRETI)
// 
// 2. PASSWORD HASHING FUNCTIONS
//    async function hashPassword()    - Hash password using bcrypt (DONE BY PRETI)
//    function hashPasswordSync()      - Synchronous password hash (DONE BY PRETI)
//    async function verifyPassword()  - Verify password against hash (DONE BY PRETI)
// 
// 3. EMAIL ENCRYPTION FUNCTIONS
//    function encryptEmail()          - Encrypt email using AES-256-GCM (DONE BY PRETI)
//    function decryptEmail()          - Decrypt email address (DONE BY PRETI)
// 
// 4. AUTHENTICATION MIDDLEWARE
//    function requireAuth()           - Check if user is authenticated (DONE BY PRETI)
//    function requireAdmin()          - Check if user has admin role (DONE BY PRETI)
// 
// 5. USER AUTHENTICATION FUNCTIONS
//    function loginUser()             - Login with bcrypt verification (DONE BY PRETI)
// 
// 6. ADMIN USER MANAGEMENT FUNCTIONS
//    function getAdminUsers()         - Get all admin users (DONE BY PRETI)
//    async function addAdminUser()    - Add new admin user (DONE BY PRETI)
//    async function updateAdminUser() - Update admin user (DONE BY PRETI)
//    function deleteAdminUser()       - Delete admin user permanently (DONE BY PRETI)
// 
// 7. BLUETOOTH PROXIMITY CHECK
//    bluetoothAccessControl          - Blocks access unless an allowed device is physically nearby (Done by Yu Kang)
//    isDeviceNearby                  - Checks the live nearby-device list maintained by bluetooth scanning (Done by Yu Kang)
// 
// 8. EXPORTS
//    module.exports                   - Export all functions (DONE BY PRETI)
//
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('./db');
const { forLog } = require('./log'); // <Jun Kai/> request values are printed without line breaks
const { isDeviceNearby } = require('../features/assets/bluetooth');

// ==================== 1. CONFIGURATION ====================
const SALT_ROUNDS = 12; // bcrypt salt rounds (higher = more secure but slower)

// Email encryption key - IN PRODUCTION, LOAD FROM SECURE ENVIRONMENT VARIABLE.
// Use a stable development fallback so returning-visitor features still work after restarts.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto
    .createHash('sha256')
    .update('rp-esg-kiosk-development-email-key')
    .digest('hex');
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// ==================== 2. PASSWORD HASHING FUNCTIONS ====================

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */

async function hashPassword(password) {
    try {
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        return hash;
    } catch (error) {
        console.error('❌ Error hashing password:', error);
        throw new Error('Password hashing failed');
    }
}

/**
 * Synchronous password hash (use only when absolutely necessary)
 * @param {string} password - Plain text password
 * @returns {string} - Hashed password
 */

function hashPasswordSync(password) {
    try {
        return bcrypt.hashSync(password, SALT_ROUNDS);
    } catch (error) {
        console.error('❌ Error hashing password:', error);
        throw new Error('Password hashing failed');
    }
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - True if password matches
 */

async function verifyPassword(password, hash) {
    try {
        if (!isBcryptHash(hash)) {
            return false;
        }

        return await bcrypt.compare(password, hash);
    } catch (error) {
        console.error('❌ Error verifying password:', error);
        return false;
    }
}

function isBcryptHash(value) {
    return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
}

// ==================== 3. EMAIL ENCRYPTION FUNCTIONS ====================

/**
 * Encrypt an email address using AES-256-GCM
 * @param {string} email - Plain text email
 * @returns {string} - Encrypted email (format: iv:authTag:encryptedData)
 */

function encryptEmail(email) {
    if (!email || email.trim() === '') {
        return null;
    }
    
    try {
        // Generate a random initialization vector
        const iv = crypto.randomBytes(16);
        
        // Create cipher
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
        
        // Encrypt the email
        let encrypted = cipher.update(email, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Get authentication tag
        const authTag = cipher.getAuthTag();
        
        // Return as iv:authTag:encryptedData
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error('❌ Error encrypting email:', error);
        throw new Error('Email encryption failed');
    }
}

/**
 * Decrypt an email address
 * @param {string} encryptedEmail - Encrypted email (format: iv:authTag:encryptedData)
 * @returns {string} - Decrypted email
 */

function decryptEmail(encryptedEmail) {
    if (!encryptedEmail || encryptedEmail.trim() === '') {
        return null;
    }
    
    try {
        // Split the encrypted data
        const parts = encryptedEmail.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted email format');
        }
        
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        
        // Create decipher
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        // Decrypt the email
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('❌ Error decrypting email:', error);
        throw new Error('Email decryption failed');
    }
}

// Quiet decrypt helper for duplicate-email lookup so old bad records do not spam crash-like errors. (DONE BY CAEDEN)
function tryDecryptEmail(encryptedEmail) {
    if (!encryptedEmail || encryptedEmail.trim() === '') {
        return null;
    }

    try {
        const parts = encryptedEmail.split(':');
        if (parts.length !== 3) {
            return null;
        }

        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return null;
    }
}

// ==================== 4. AUTHENTICATION MIDDLEWARE ====================


// Middleware to check if user is authenticated

function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
}

// Middleware to check if user has admin role

function requireAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'system_admin') {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
}

// ==================== 5. USER AUTHENTICATION FUNCTIONS ====================

/**
 * Login user with bcrypt password verification
 * Properly handles async/await with callback pattern
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @param {function} callback - Callback function (err, user)
 */

function loginUser(username, password, callback) {
    // Validate inputs
    if (!username || !password) {
        return callback(new Error('Username and password are required'), null);
    }

    // <Jun Kai start> an account moved to Deleted Users no longer signs in. A row with no value there was never deleted
    const query = 'SELECT * FROM admin_users WHERE username = ? AND is_active = 1 AND (is_deleted = 0 OR is_deleted IS NULL)';
    // <Jun Kai end>
    
    db.get(query, [username], async (err, row) => {
        if (err) {
            console.error('❌ Database error during login:', err);
            return callback(err, null);
        }
        
        if (!row) {
            console.log('❌ Login failed: User not found or inactive:', forLog(username));
            return callback(new Error('Invalid username or password'), null);
        }
        
        try {
            // Verify password using bcrypt. Fresh schema imports store the seed
            // admin password in plain text until the migration script runs, so
            // accept that once and immediately upgrade it to bcrypt.
            let passwordMatch = await verifyPassword(password, row.password_hash);
            let upgradedPlainTextPassword = false;

            if (!passwordMatch && !isBcryptHash(row.password_hash) && password === row.password_hash) {
                const hashedPassword = await hashPassword(password);
                upgradedPlainTextPassword = true;

                await new Promise((resolve, reject) => {
                    db.run('UPDATE admin_users SET password_hash = ? WHERE id = ?', [hashedPassword, row.id], (updateErr) => {
                        if (updateErr) {
                            return reject(updateErr);
                        }
                        resolve();
                    });
                });

                passwordMatch = true;
            }
            
            if (passwordMatch) {
                console.debug('✅ Login successful:', forLog(username));
                if (upgradedPlainTextPassword) {
                    console.debug('✅ Upgraded plain-text password hash for:', forLog(username));
                }
                
                // Update last login time
                db.run('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [row.id], (updateErr) => {
                    if (updateErr) {
                        console.error('⚠️ Warning: Failed to update last_login:', updateErr);
                        // Don't fail the login for this
                    }
                });
                
                // Return user data without password
                const user = {
                    id: row.id,
                    username: row.username,
                    role: row.role
                };
                
                callback(null, user);
            } else {
                console.log('❌ Login failed: Invalid password for user:', forLog(username));
                callback(new Error('Invalid username or password'), null);
            }
        } catch (verifyError) {
            console.error('❌ Error verifying password:', verifyError);
            callback(new Error('Authentication failed'), null);
        }
    });
}

// ==================== 6. ADMIN USER MANAGEMENT FUNCTIONS ====================

// Get all admin users
function getAdminUsers(callback) {
    const query = 'SELECT id, username, role, last_login, created_at, is_active FROM admin_users ORDER BY id';
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('❌ Database error fetching admin users:', err);
            return callback(err, null);
        }
        callback(null, rows);
    });
}

// Add new admin user with hashed password
async function addAdminUser(username, password, role, callback) {
    try {
        // Validate inputs
        if (!username || !password || !role) {
            return callback(new Error('Username, password, and role are required'), null);
        }

        // Hash password
        const hashedPassword = await hashPassword(password);
        
        const query = 'INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)';
        
        db.run(query, [username, hashedPassword, role], function(err) {
            if (err) {
                console.error('❌ Database error adding admin user:', err);
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return callback(new Error('Username already exists'), null);
                }
                return callback(err, null);
            }
            console.debug('✅ Admin user added successfully:', username);
            callback(null, { id: this.lastID, username, role });
        });
    } catch (error) {
        console.error('❌ Error in addAdminUser:', error);
        callback(error, null);
    }
}

// Update admin user
async function updateAdminUser(id, username, password, role, callback) {
    try {
        // Validate inputs
        if (!id || !username || !role) {
            return callback(new Error('ID, username, and role are required'), null);
        }

        let query, params;
        
        if (password && password.trim() !== '') {
            // Hash new password
            const hashedPassword = await hashPassword(password);
            query = 'UPDATE admin_users SET username = ?, password_hash = ?, role = ? WHERE id = ?';
            params = [username, hashedPassword, role, id];
        } else {
            query = 'UPDATE admin_users SET username = ?, role = ? WHERE id = ?';
            params = [username, role, id];
        }
        
        db.run(query, params, function(err) {
            if (err) {
                console.error('❌ Database error updating admin user:', err);
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return callback(new Error('Username already exists'), null);
                }
                return callback(err, null);
            }
            
            if (this.changes === 0) {
                console.debug('⚠️ No user found with ID:', id);
                return callback(new Error('User not found'), null);
            }
            
            console.debug('✅ Admin user updated successfully:', username);
            callback(null, { changes: this.changes });
        });
    } catch (error) {
        console.error('❌ Error in updateAdminUser:', error);
        callback(error, null);
    }
}

// Delete admin user (hard delete - permanently removes from database)
function deleteAdminUser(id, callback) {
    if (!id) {
        return callback(new Error('User ID is required'), null);
    }

    const query = 'DELETE FROM admin_users WHERE id = ?';
    
    db.run(query, [id], function(err) {
        if (err) {
            console.error('❌ Database error deleting admin user:', err);
            return callback(err, null);
        }
        
        if (this.changes === 0) {
            console.debug('⚠️ No user found with ID:', id);
            return callback(new Error('User not found'), null);
        }
        
        console.debug('✅ Admin user deleted successfully, ID:', id);
        callback(null, { changes: this.changes });
    });
}

// ==================== 7. BLUETOOTH PROXIMITY CHECK ====================

function bluetoothAccessControl(req, res, next) {
    // Accept either x-device-mac (legacy) or x-device-id (Web Bluetooth client)
    const deviceMac = req.headers['x-device-mac'];
    const deviceId = req.headers['x-device-id'];

    if (!deviceMac && !deviceId) {
        return res.status(401).json({
            success: false,
            message: 'Missing device identifier (x-device-mac or x-device-id)'
        });
    }

    const identifier = deviceMac || deviceId;
    const nearby = isDeviceNearby(identifier);

    if(!nearby) {
        return res.status(403).json({
            success: false,
            message: 'Device not nearby'
        });
    }

    next();
}

// ==================== 8. EXPORTS ====================

module.exports = {
    // Password functions
    hashPassword,
    hashPasswordSync,
    verifyPassword,
    
    // Email encryption functions
    encryptEmail,
    decryptEmail,
    tryDecryptEmail,
    
    // Middleware
    requireAuth,
    requireAdmin,
    
    // User management
    loginUser,
    getAdminUsers,
    addAdminUser,
    updateAdminUser,
    deleteAdminUser, 

    // Bluetooth proximity check
    bluetoothAccessControl
};

// <Jun Kai start>
// A short fingerprint of the email key (never the key): tells the Visitor Data Archive page whether an archive
// was written with the key this server has now
function keyFingerprint() {
    return crypto.createHash('sha256').update(Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex')).digest('hex').slice(0, 16);
}

// True when backend/.env has no ENCRYPTION_KEY, so the public development key above is in use
function usesDevelopmentKey() {
    return !process.env.ENCRYPTION_KEY;
}

module.exports.keyFingerprint = keyFingerprint;
module.exports.usesDevelopmentKey = usesDevelopmentKey;
// <Jun Kai end>
