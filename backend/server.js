// Owner: shared (lead: Role 3, Jun Kai). Previous team: Preti (52), XY (Xuanyang) (10), Yu Kang (1).
//
//=============================================================
// Yu Kang Change Summary:
//=============================================================
//
// Bluetooth proximity code lives in backend/bluetooth.js (used by auth.js and adminRoutes.js), not here.
// The QR phone-pairing design once described in this header (JWT tokens, /connect, Socket.IO heartbeats,
// kiosks / qr_sessions / device_pairings tables) was never implemented. The kiosk QR comes from
// GET /api/generate-qr below and simply encodes the HTTPS feedback URL.
//
// ============================================================
// XY CHANGE SUMMARY (DONE BY XY)
// ============================================================
//
//changes
// 1. LIVE PULSE ROUTING
//    const pulseRoutes                - Live Pulse API routes for dashboard data (DONE BY XY)
//    app.use('/api/pulse')            - Public Pulse API route wiring (DONE BY XY)
//    app.get('/pulse')                - Public Pulse dashboard page route (DONE BY XY)
//
// 2. ACCESS CONTROL
//    Pulse dashboard                  - Public live-display route; no admin login required (DONE BY XY)
//
// 3. PUBLIC PARAMETER CONFIG ROUTE
//    parametersConfigStore            - Reads shared kiosk parameter settings for public pages (DONE BY XY)
//    GET /api/parameters              - Exposes retention text, pledge examples, tree settings and assets to frontend (DONE BY XY)
//
// 4. KIOSK PHOTO UPLOAD BODY LIMIT
//    const JSON_BODY_LIMIT            - Raises standalone server upload payload limit for base64 kiosk photos (DONE BY XY)
//    upload error middleware          - Returns JSON for oversized uploads instead of an HTML error page (DONE BY XY)
//
//=============================================================
// FIND COMMAND
//    rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
// ============================================================

// ============================================================
// SERVER.JS - TABLE OF CONTENTS (CTRL+F SEARCHABLE)
// ============================================================
// 
// 1. DEPENDENCIES & CONFIGURATION
//    require('dotenv').config()       - Load environment variables (DONE BY PRETI)
//    const express                    - Express framework import (DONE BY PRETI)
//    const https                      - HTTPS server module (DONE BY PRETI)
//    const fs                         - File system operations (DONE BY PRETI)
//    const path                       - Path utilities (DONE BY PRETI)
//    const session                    - Express session middleware (DONE BY PRETI)
//    const db                         - Database connection (DONE BY PRETI)
//    const feedbackRoutes             - Feedback routes module (DONE BY PRETI)
//    const adminRoutes                - Admin routes module (DONE BY PRETI)
//    const dataExportRoutes           - Data export routes module (DONE BY PRETI)
//    const pledgeboardRoutes          - Pledgeboard routes module (DONE BY PRETI)
//    const os                         - Operating system utilities (DONE BY PRETI)
//    const emailService               - Email service utilities (DONE BY PRETI)
//    const treeRoutes                 - Tree routes module (DONE BY PRETI)
//    const dataRetentionCleanup       - Data retention cleanup module (DONE BY PRETI)
//    const QRCode                     - QR code generation library (DONE BY PRETI)
//    const app                        - Express application instance (DONE BY PRETI)
//    const PORT                       - Server port number (3000) (DONE BY PRETI)
//
// 2. NETWORK INTERFACE FUNCTIONS
//    function getAllNetworkIPs()      - Get all available network IP addresses (DONE BY PRETI)
//    function getSelectedIP()         - Determine which IP address to use for server (DONE BY PRETI)
//    function getInterfaceForIP()     - Get network interface name for given IP (DONE BY PRETI)
//    const localIP                    - Selected local IP address (DONE BY PRETI)
//    const interfaceName              - Network interface name (DONE BY PRETI)
//
// 3. SSL CERTIFICATE CONFIGURATION
//    const certsDir                   - SSL certificates directory path (DONE BY PRETI)
//    const certPath                   - SSL certificate file path (DONE BY PRETI)
//    const keyPath                    - SSL private key file path (DONE BY PRETI)
//    let sslOptions                   - SSL configuration options (DONE BY PRETI)
//
// 4. MIDDLEWARE CONFIGURATION
//    app.use(express.json())          - JSON body parser middleware (DONE BY PRETI)
//    app.use(express.urlencoded())    - URL-encoded body parser middleware (DONE BY PRETI)
//    app.use(session())               - Session middleware configuration (DONE BY PRETI)
//    app.use(express.static())        - Static file serving for frontend (DONE BY PRETI)
//    app.use('/uploads'               - Static file serving for uploads (DONE BY PRETI)
//    app.use('/assets'                - Static file serving for assets (DONE BY PRETI)
//
// 5. API ROUTES (COMBINED - KIOSK + ADMIN)
//    app.use('/api/feedback'          - Feedback submission and management routes (DONE BY PRETI)
//    app.use('/api/admin'             - Admin API routes (DONE BY PRETI)
//    app.use('/api/admin/data-export' - Data export API routes (DONE BY PRETI)
//    app.use('/api/pledgeboard'       - Pledgeboard data routes (DONE BY PRETI)
//    app.use('/api/tree'              - Tree data fetching routes (DONE BY PRETI)
//    app.get('/api/network-interfaces' - Get network interface information (DONE BY PRETI)
//    app.get('/api/server-info'       - Get server configuration information (DONE BY PRETI)
//    app.get('/api/generate-qr'       - Generate QR code for feedback URL (DONE BY PRETI)
//    app.get('/api/test-db'           - Test database connection endpoint (DONE BY PRETI)
//    app.get('/api/status'            - Server status for kiosk monitor (DONE BY PRETI)
//    app.get('/api/test-email-service' - Test email service endpoint (DONE BY PRETI)
//
// 6. PAGE ROUTES (COMBINED - KIOSK + ADMIN)
//    app.get('/feedback'              - Serve feedback HTML page (DONE BY PRETI)
//    app.get('/admin'                 - Serve admin HTML page (DONE BY PRETI)
//    app.get('/pledgeboard'           - Serve pledgeboard HTML page (DONE BY PRETI)
//    app.get('/tree'                  - Serve tree HTML page (DONE BY PRETI)
//    app.get('/3dTree'                - Serve 3D tree HTML page (DONE BY Yu Kang)
//    app.get('/'                      - Redirect root to /feedback (DONE BY PRETI)
//
// 7. SERVER STARTUP FUNCTIONS
//    function printServerInfo()       - Display server information on startup (DONE BY PRETI)
//    function startServer()           - Start HTTPS or HTTP server (DONE BY PRETI)
//    const emailInitialized           - Email service initialization status (DONE BY PRETI)


// ==================== 1. IMPORTS & INITIALIZATION ====================

require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true }); // backend/.env regardless of the working directory
// <Jun Kai start>
require('./core/log').setupLogging(); // request chatter only with LOG_LEVEL=debug
// <Jun Kai end>
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const paths = require('./core/paths');
const session = require('express-session');
const db = require('./core/db');
const feedbackRoutes = require('./features/feedback/routes');
const adminRoutes = require('./features/admin/routes');
const dataExportRoutes = require('./features/archive/exportRoutes');
const pledgeboardRoutes = require('./features/pledgeboard/routes');
const pulseRoutes = require('./features/pulse/routes');
const os = require('os');
const emailService = require('./features/email/service');
const auth = require('./core/auth');
const parametersConfigStore = require('./features/parameters/store');

function isMobileUserAgent(userAgent) {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent || '');
}

function requireMobileTokenForPledgeboard(req, res, next) {
    if (!isMobileUserAgent(req.get('user-agent'))) {
        return next();
    }

    if (req.session && req.session.mobileAccessGranted) {
        return next();
    }

    return res.redirect('/feedback');
}

// Import tree routes and wire them to the shared DB
const { router: treeRoutes, setDatabase: setTreeDatabase, countLiveTreeLeaves } = require('./features/tree/routes');
const { withAutoTreeStage } = require('./features/parameters/treeStage');

// Import cleanup module
const dataRetentionCleanup = require('./features/archive/retention');
const kioskScheduler = require('./features/serverControl/scheduler');
const healthRoutes = require('./features/health/routes');
const healthPublicRoutes = require('./features/health/publicRoutes');
// <Jun Kai start>
const hardwareRoutes = require('./features/hardware/routes');
const hardwareSampler = require('./features/hardware/sampler');
// <Jun Kai end>

// Import QR code generation
const QRCode = require('qrcode');

const app = express();
// <Jun Kai start>
const PORT = Number(process.env.PORT) || 3000;
// <Jun Kai end>
const JSON_BODY_LIMIT = '50mb';


// Bind host controls what network interfaces the server listens on. (Done By Yu Kang)
// Default to 0.0.0.0 so phones on the same LAN can connect reliably. (Done By Yu Kang)
function getBindHost() {
    let bindHost = null;
    const args = process.argv.slice(2);

    for (const arg of args) {
        if (arg.startsWith('--bind=')) {
            bindHost = arg.split('=')[1];
            break;
        }
    }

    if (!bindHost && process.env.BIND_HOST) {
        bindHost = process.env.BIND_HOST;
    }

    return bindHost || '0.0.0.0';
}

function getActiveTreeDisplayMode() {
    const config = parametersConfigStore.readParametersConfig();
    const mode = String(config.treeParameters?.treeDisplayMode || '2d').trim().toLowerCase();
    return mode === '3d' ? '3d' : '2d';
}

function sendBlockedTreeRoute(res, activeMode) {
    const activeRoute = activeMode === '3d' ? '/3dtree' : '/tree';
    return res.status(403).send(`<p>Tree display is currently set to <a href="${activeRoute}">${activeRoute}</a>.</p>`);
}

// ==================== 2. NETWORK INTERFACE FUNCTIONS ====================
// CROSS-PLATFORM: os.networkInterfaces() works on Windows, Linux, and macOS
// Automatically detects WiFi, Ethernet, and other network adapters
// Perfect for QR code generation and mobile device access

// Get all available network interfaces and their IPs
function getAllNetworkIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    
    for (const ifaceName in interfaces) {
        for (const iface of interfaces[ifaceName]) {
            // Skip internal and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push({
                    interface: ifaceName,
                    address: iface.address,
                    mac: iface.mac,
                    cidr: iface.cidr
                });
            }
        }
    }
    return ips;
}

// Get selected IP address
function getSelectedIP() {
    // Priority: Command line argument > Environment variable > First available IP
    let selectedIP = null;
    const preferredInterface = process.env.PREFERRED_INTERFACE || 'Wi-Fi 2';
    
    // Check command line arguments (e.g., node server.js --ip=192.168.1.100)
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg.startsWith('--ip=')) {
            selectedIP = arg.split('=')[1];
            break;
        }
    }
    
    // Check environment variable
    if (!selectedIP && process.env.SERVER_IP) {
        selectedIP = process.env.SERVER_IP;
    }
    
    // Validate the selected IP is available
    if (selectedIP) {
        const availableIPs = getAllNetworkIPs();
        const isValidIP = availableIPs.some(ip => ip.address === selectedIP);
        
        if (!isValidIP) {
            console.warn(`⚠️  Selected IP "${selectedIP}" is not available on any network interface`);
            console.log('   Available IPs:');
            availableIPs.forEach(ip => {
                console.log(`   - ${ip.address} (${ip.interface})`);
            });
            console.log('   Using first available IP instead');
            selectedIP = null;
        }
    }
    
    // Use first available IP if none selected
    if (!selectedIP) {
        const availableIPs = getAllNetworkIPs();

        // Prefer the configured interface (default: Wi-Fi 2) for mobile/QR access. (Done By Yu Kang)
        const preferredIP = availableIPs.find(
            ip => ip.interface.toLowerCase() === preferredInterface.toLowerCase()
        );

        if (preferredIP) {
            selectedIP = preferredIP.address;
            console.log(`📡 Using preferred interface IP: ${selectedIP} (${preferredIP.interface})`);
            return selectedIP;
        }

        // Skip virtual adapters (VMware, Hyper-V, WSL...) so the QR code gets the Wi-Fi or Ethernet address
        const virtualAdapter = /vmware|vethernet|wsl|hyper-v|virtualbox|vbox|docker|loopback|bluetooth|tailscale|zerotier|npcap|tap-/i;
        const physical = availableIPs.filter((ip) => !virtualAdapter.test(ip.interface));
        const physicalPreferred = physical.find((ip) => /wi-?fi|wlan|ethernet/i.test(ip.interface)) || physical[0];
        if (physicalPreferred) {
            selectedIP = physicalPreferred.address;
            console.log(`📡 Using ${physicalPreferred.interface}: ${selectedIP} (virtual adapters skipped)`);
            return selectedIP;
        }

        if (availableIPs.length > 0) {
            selectedIP = availableIPs[0].address;
            console.log(`📡 Using first available IP: ${selectedIP} (${availableIPs[0].interface})`);
        } else {
            selectedIP = 'localhost';
            console.log('⚠️  No network interfaces found. Using localhost');
        }
    }
    
    return selectedIP;
}

// Get interface name for the selected IP
function getInterfaceForIP(ipAddress) {
    const interfaces = os.networkInterfaces();
    
    for (const ifaceName in interfaces) {
        for (const iface of interfaces[ifaceName]) {
            if (iface.family === 'IPv4' && iface.address === ipAddress) {
                return ifaceName;
            }
        }
    }
    return 'Unknown';
}

const localIP = getSelectedIP();
const interfaceName = getInterfaceForIP(localIP);
const bindHost = getBindHost();

// ==================== 3. SSL CERTIFICATE CONFIGURATION ====================

// Check for existing SSL certificate or generate new one
// Updated paths to use certs/ folder
const certsDir = paths.CERTS;
const certPath = path.join(certsDir, 'selfsigned.pem');
const keyPath = path.join(certsDir, 'selfsigned.key');

let sslOptions = null;

// Try to load existing certificates
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log('🔒 Using existing SSL certificates from certs/ folder');
    sslOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
    };
} else {
    // Auto-generate if missing
    console.log('🔒 Generating new SSL certificates...');
    try {
        const selfsigned = require('selfsigned');
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const pems = selfsigned.generate(attrs, { 
            days: 365,  // Valid for 1 year
            keySize: 2048 
        });
        
        // Create certs directory if it doesn't exist
        if (!fs.existsSync(certsDir)) {
            fs.mkdirSync(certsDir, { recursive: true });
            console.log('✅ Created certs/ directory');
        }
        
        fs.writeFileSync(certPath, pems.cert);
        fs.writeFileSync(keyPath, pems.private);
        
        sslOptions = {
            key: pems.private,
            cert: pems.cert
        };
        
        console.log('✅ SSL certificates generated in certs/ folder');
    } catch (error) {
        console.warn('⚠️  Could not generate SSL certificates');
        console.log('   Install: npm install selfsigned');
        console.log('   Running in HTTP mode instead');
    }
}

// ==================== 4. MIDDLEWARE CONFIGURATION ====================

app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        return res.status(413).json({
            success: false,
            error: `Upload is too large. Please retake the photo or use a smaller image. Limit: ${JSON_BODY_LIMIT}.`
        });
    }

    return next(err);
});

// Session middleware - set secure based on HTTPS availability
// app.use(session({
//     secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
//     resave: false,
//     saveUninitialized: false,
//     cookie: { 
//         secure: sslOptions !== null,
//         httpOnly: true,
//         maxAge: 1800000 // 30 minutes
//     }
// }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: true,  
    saveUninitialized: false,
    rolling: true,  
    cookie: { 
        secure: sslOptions !== null,
        httpOnly: true,
        maxAge: 1800000,
        sameSite: 'lax'  
    }
}));

// Pulse screen is public so it can be shown without an admin session.

// Serve the admin page before static directory handling so /admin and /admin/
// both load the same HTML and use the same absolute asset paths.
app.get(['/admin', '/admin/'], (req, res) => {
    res.sendFile(path.join(paths.FRONTEND, 'admin', 'admin.html'));
});

// Serve static files
app.use(express.static(paths.FRONTEND));
app.use('/uploads', express.static(paths.UPLOADS));
app.use('/assets', express.static(paths.ASSETS));

// Wire the shared DB into the tree routes
setTreeDatabase(db);

// ==================== 5. API ROUTES ====================

app.use('/api/feedback', feedbackRoutes);
app.use('/api/admin/health', healthRoutes);
app.use('/api/health', healthPublicRoutes);
// <Jun Kai start>
app.use('/api/admin/hardware', hardwareRoutes);
// <Jun Kai end>
app.use('/api/admin', adminRoutes);
app.use('/api/admin/data-export', dataExportRoutes);
app.use('/api/pledgeboard', pledgeboardRoutes);
app.use('/api/pulse', pulseRoutes);

// Tree API for the leaves (names from feedback.db)
app.use('/api/tree', treeRoutes);

app.get('/api/parameters', async (req, res) => {
    try {
        // In Auto, the tree's growth stage follows its leaf count (features/parameters/treeStage.js).
        const parameters = await withAutoTreeStage(parametersConfigStore.readParametersConfig(), countLiveTreeLeaves);
        res.json({ success: true, parameters });
    } catch (error) {
        console.error('Error loading public parameters:', error);
        res.status(500).json({ success: false, error: 'Failed to load parameters' });
    }
});

// API endpoint to get all network interfaces
app.get('/api/network-interfaces', (req, res) => {
    const interfaces = getAllNetworkIPs();
    res.json({
        interfaces: interfaces,
        current: {
            ip: localIP,
            interface: interfaceName,
            port: PORT
        }
    });
});

// API endpoint to get server info (IP, protocol, QR code)
app.get('/api/server-info', (req, res) => {
    const protocol = sslOptions ? 'https' : 'http';
    const url = `${protocol}://${localIP}:${PORT}/feedback`;
    
    res.json({
        ip: localIP,
        bindHost: bindHost,
        interface: interfaceName,
        port: PORT,
        protocol: protocol,
        url: url,
        httpsAvailable: sslOptions !== null,
        networkInterfaces: getAllNetworkIPs(),
        certsPath: sslOptions ? certsDir : null
    });
});

// Generate QR code endpoint
app.get('/api/generate-qr', async (req, res) => {
    try {
        const protocol = sslOptions ? 'https' : 'http';
        const url = `${protocol}://${localIP}:${PORT}/feedback`;
        
        
        const qrSvg = await QRCode.toString(url, {
            type: 'svg',
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 200,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        
        res.json({
            success: true,
            qrSvg: qrSvg,
            url: url,
            ip: localIP,
            interface: interfaceName,
            port: PORT
        });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate QR code' 
        });
    }
});

// Test route
app.get('/api/test-db', (req, res) => {
    db.query(
        "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = ?",
        [process.env.DB_NAME || 'dp_kiosk_db'],
        (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            res.json({
                message: 'MySQL database is working!',
                tables: results.length > 0 ? results.map(r => r.TABLE_NAME) : 'No tables found',
                database: process.env.DB_NAME || 'dp_kiosk_db'
            });
        }
    );
});

// Status endpoint for kiosk status monitor
// Returns online: true for standalone mode (Windows/testing without gateway)
// In production with gateway, the gateway handles this endpoint
app.get('/api/status', (req, res) => {
    res.json({
        online: true,
        mode: 'standalone',
        server: 'kiosk',
        message: 'Server is running (standalone mode)',
        timestamp: new Date().toISOString()
    });
});

// ==================== 6. PAGE ROUTES ====================

app.get('/feedback', (req, res) => {
    res.sendFile(path.join(paths.FRONTEND, 'feedback', 'feedback.html'));
});

app.get('/pledgeboard', requireMobileTokenForPledgeboard, (req, res) => {
    res.sendFile(path.join(paths.FRONTEND, 'Pledgeboard', 'Pledgeboard.html'));
});

app.get(['/admin', '/admin/'], (req, res) => {
    res.sendFile(path.join(paths.FRONTEND, 'admin', 'admin.html'));
});

app.get(['/tree-demo', '/tree-demo/'], auth.requireAuth, (req, res) => {
    res.sendFile(path.join(paths.FRONTEND, 'tree', 'tree.html'));
});

// Tree page is selected from admin settings; inactive route returns 403.
app.get('/tree', (req, res) => {
    const activeMode = getActiveTreeDisplayMode();
    if (activeMode !== '2d') {
        return sendBlockedTreeRoute(res, activeMode);
    }
    res.sendFile(path.join(paths.FRONTEND, 'tree', 'tree.html'));
});

// 3D Tree page is selected from admin settings; inactive route returns 403.
app.get(['/3dTree', '/3dtree'], (req, res) => {
    const activeMode = getActiveTreeDisplayMode();
    if (activeMode !== '3d') {
        return sendBlockedTreeRoute(res, activeMode);
    }
    res.sendFile(path.join(paths.FRONTEND, '3dTree', '3dTree.html'));
});

app.get('/pulse', (req, res) => {
    res.sendFile(path.join(paths.FRONTEND, 'pulse', 'pulse.html'));
});

// Default redirect
app.get('/', (req, res) => {
    res.redirect('/feedback');
});

// ==================== 7. CERTIFICATE & SERVER FUNCTIONS ====================

// Function to generate self-signed certificate if needed
function generateSelfSignedCertificate() {
    try {
        const selfsigned = require('selfsigned');
        console.log('🔐 Generating self-signed SSL certificate...');
        
        const attrs = [{ name: 'commonName', value: localIP }];
        const pems = selfsigned.generate(attrs, { 
            days: 365,
            keySize: 2048
        });
        
        // Create certs directory if it doesn't exist
        if (!fs.existsSync(certsDir)) {
            fs.mkdirSync(certsDir, { recursive: true });
        }
        
        // Update paths to write to certs folder
        fs.writeFileSync(certPath, pems.cert);
        fs.writeFileSync(keyPath, pems.private);
        
        console.log('✅ Self-signed certificate generated in certs/ folder');
        return {
            key: pems.private,
            cert: pems.cert
        };
    } catch (error) {
        console.error('❌ Failed to generate SSL certificate:', error.message);
        console.log('💡 Install selfsigned package: npm install selfsigned');
        return null;
    }
}

// Start server
function startServer() {
    // DB schema is provided in database/schema.sql; run manually or via migration (Done By Yu Kang)

    let server;
    if (sslOptions) {
        server = https.createServer(sslOptions, app);
    } else {
        server = http.createServer(app);
    }

    server.on('error', (err) => {
        console.error(err.code === 'EADDRINUSE' ? `❌ Port ${PORT} is already in use (another server.js running?)` : `❌ Server failed to start: ${err.message}`);
        process.exit(1);
    });
    server.listen(PORT, bindHost, () => {
        printServerInfo(!!sslOptions);
    });
}

function printServerInfo(isHttps) {
    const protocol = isHttps ? 'HTTPS' : 'HTTP';
    const availableIPs = getAllNetworkIPs();
    const platform = os.platform();
    const platformNames = {
        'win32': 'Windows',
        'linux': 'Linux',
        'darwin': 'macOS',
        'freebsd': 'FreeBSD'
    };
    
    console.log('\n🌐 ============================================');
    console.log('   FEEDBACK KIOSK SERVER');
    console.log('============================================');
    console.log(`💻 Platform: ${platformNames[platform] || platform}`);
    console.log(`🔌 Bind Host: ${bindHost}`);
    console.log(`📡 Selected Interface: ${interfaceName}`);
    console.log(`📡 Selected IP: ${localIP}`);
    console.log(`🚀 ${protocol}: ${isHttps ? 'https' : 'http'}://${localIP}:${PORT}`);
    console.log(`📊 Feedback: ${isHttps ? 'https' : 'http'}://${localIP}:${PORT}/feedback`);
    console.log(`🏆 Pledgeboard: ${isHttps ? 'https' : 'http'}://${localIP}:${PORT}/pledgeboard`);
    console.log(`🌳 Tree: ${isHttps ? 'https' : 'http'}://${localIP}:${PORT}/tree`);
    console.log(`🌳 3D Tree: ${isHttps ? 'https' : 'http'}://${localIP}:${PORT}/3dTree`);
    console.log(`⚙️  Admin: ${isHttps ? 'https' : 'http'}://${localIP}:${PORT}/admin`);
    console.log(`📦 Data Export: ${isHttps ? 'https' : 'http'}://${localIP}:${PORT}/api/admin/data-export`); 
    console.log(`📅 Started: ${new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}`);
    console.log('🌏 Timezone: Singapore (UTC+8)');
    console.log(`🗄️  Database: MySQL (${process.env.DB_NAME || 'dp_kiosk_db'})`);
    console.log(`🔐 SSL Certificates: ${certsDir}/`);
    console.log('============================================');
    
    console.log('\n🌐 Available Network Interfaces:');
    if (availableIPs.length > 0) {
        availableIPs.forEach(ip => {
            const indicator = ip.address === localIP ? '→ ' : '  ';
            console.log(`   ${indicator}${ip.address} (${ip.interface}) ${ip.cidr ? `[${ip.cidr}]` : ''}`);
        });
    } else {
        console.log('   No network interfaces found');
    }
    
    console.debug('\n📱 Mobile Access (QR Code URLs):');
    console.debug(`   Feedback: ${isHttps ? 'https' : 'http'}://${localIP}:${PORT}/feedback`);
    console.debug(`   Pledgeboard: ${isHttps ? 'https' : 'http'}://${localIP}:${PORT}/pledgeboard`);
    console.debug(`   QR API: ${isHttps ? 'https' : 'http'}://${localIP}:${PORT}/api/generate-qr`);
    
    // Platform-specific tips
    if (platform === 'win32') {
        console.debug('\n💡 Windows Tips:');
        console.debug('   • Use start-simple.bat for easy testing');
        console.debug('   • Check firewall for ports 3000-3002');
        console.debug('   • For production, use Linux with systemd');
    } else if (platform === 'linux') {
        console.debug('\n💡 Linux Tips:');
        console.debug('   • Use systemctl for service management');
        console.debug('   • Check firewall: sudo ufw status');
        console.debug('   • For scheduling: Use kiosk-schedules.json');
    }
    
    console.log('============================================\n');

    // Initialize data retention cleanup system
    dataRetentionCleanup.initializeCleanup();
    // Schedules (hibernate at stop time, start the kiosk in the morning); off with KIOSK_AUTOMATION=off
    kioskScheduler.start();
    // <Jun Kai start>
    hardwareSampler.start();
    // <Jun Kai end>
}

// Try to enable HTTPS if selfsigned package is available
try {
    require.resolve('selfsigned');
    
    if (!sslOptions) {
        // Generate certificate if selfsigned is available
        sslOptions = generateSelfSignedCertificate();
    }
} catch (error) {
    console.log('⚠️  "selfsigned" package not installed. Running in HTTP mode.');
    console.log('💡 For HTTPS, run: npm install selfsigned');
}

// ==================== 8. SERVER STARTUP & INITIALIZATION ====================

// Email test endpoint
app.get('/api/test-email-service', (req, res) => {
    const emailInitialized = emailService.initEmailService();
    if (emailInitialized) {
        res.json({ 
            success: true, 
            message: 'Email service initialized',
            smtpUser: process.env.SMTP_USER || 'Using default'
        });
    } else {
        res.json({ 
            success: false, 
            message: 'Email service failed to initialize',
            error: 'Check SMTP credentials'
        });
    }
});

// Initialize email service
const emailInitialized = emailService.initEmailService();
if (emailInitialized) {
    console.log('📧 Email service initialized successfully');
} else {
    console.log('⚠️ Email service not initialized - check SMTP credentials');
}

// Display help if requested
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log('\nUsage:');
    console.log('  node server.js [options]');
    console.log('\nOptions:');
    console.log('  --ip=<IP_ADDRESS>    Specify the IP address to bind to');
    console.log('  --bind=<HOST>        Specify bind host (default: 0.0.0.0)');
    console.log('  --help, -h           Show this help message');
    console.log('\nExamples:');
    console.log('  node server.js --ip=192.168.1.100');
    console.log('  node server.js --ip=10.0.0.5');
    console.log('\nEnvironment Variables:');
    console.log('  SERVER_IP=<IP_ADDRESS>  Specify IP via environment variable');
    console.log('  PREFERRED_INTERFACE=<NAME> Prefer adapter when auto-selecting IP (default: Wi-Fi 2)');
    console.log('  BIND_HOST=<HOST>        Specify bind host (default: 0.0.0.0)');
    console.log('  PORT=<PORT_NUMBER>      Change port (default: 3000)');
    console.log('\nAvailable IPs:');
    const availableIPs = getAllNetworkIPs();
    if (availableIPs.length > 0) {
        availableIPs.forEach(ip => {
            console.log(`  - ${ip.address} (${ip.interface})`);
        });
    } else {
        console.log('  No network interfaces found');
    }
    console.log('');
    process.exit(0);
}

// Start the server
startServer();

// ==================== PLATFORM-SPECIFIC NOTES ====================
// 
// WINDOWS (Testing/Development):
// - Use start-simple.bat to start all servers
// - Run node find-ip.js to get network IP for QR codes
// - Mobile devices must be on same WiFi network
// - Accept self-signed certificate warning in browsers
// - For firewall: netsh advfirewall firewall add rule name="Kiosk" dir=in action=allow protocol=TCP localport=3000-3002
//
// LINUX (previous team's design, see legacy/README.md; not used by the current Windows deployment):
// - systemd services (gateway.service, admin.service, kiosk.service)
// - scheduleRunner.js with cron for automated scheduling
// - For firewall: sudo ufw allow 3000:3002/tcp
// - SSL certificates in /certs/ directory
//
// BOTH PLATFORMS:
// - Network IP detection works automatically
// - QR codes use detected network IP
// - Self-signed SSL certificates auto-generated
// - Database connection via db.js (MySQL)
// - Environment variables in .env file
//
// ============================================================
