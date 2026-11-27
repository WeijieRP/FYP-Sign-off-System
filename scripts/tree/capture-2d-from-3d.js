// Owner: Role 2, Wei Jie.
// Makes the 2D tree's Natural and Digital pictures (checklist item 12) from the 3D tree, without the admin page:
// opens the 3D page in capture mode (frontend/3dTree/capture-2d.js) in Chrome for each style and stage, and
// saves the pictures to assets/Tree/2d-from-3d/ (backend/features/parameters/tree2dStyle.js).
// The admin's "Capture from the 3D tree" button (2D Tree Display) does the same from the admin page.
//
// Usage (with the server running):
//   node scripts/tree/capture-2d-from-3d.js [--origin https://localhost:3000] [--style natural|digital] [--stage 0-4]
// Chrome is found in its usual place; set CHROME_PATH to use another browser binary.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const paths = require('../../backend/core/paths');
const { CAPTURED_STYLES, CAPTURE_LOOKS, saveTreeCapture } = require('../../backend/features/parameters/tree2dStyle');

const READY_TIMEOUT_MS = 120000;
const option = name => {
    const at = process.argv.indexOf(`--${name}`);
    return at > -1 ? process.argv[at + 1] : undefined;
};
const origin = (option('origin') || 'https://localhost:3000').replace(/\/$/, '');
const styles = option('style') ? [option('style')] : [...CAPTURED_STYLES];
const stages = option('stage') !== undefined ? [Number(option('stage'))] : [0, 1, 2, 3, 4];
if (styles.some(style => !CAPTURED_STYLES.includes(style)) || stages.some(stage => !Number.isInteger(stage) || stage < 0 || stage > 4)) {
    console.error('Style must be natural or digital, and stage 0 to 4.');
    process.exit(1);
}

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
    ].filter(Boolean);
    const found = candidates.find(candidate => fs.existsSync(candidate));
    if (!found) throw new Error('Chrome was not found; set CHROME_PATH.');
    return found;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const port = 9600 + Math.floor(Math.random() * 300);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-capture-'));
    const chrome = spawn(findChrome(), [
        '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
        '--window-size=1920,1080', '--hide-scrollbars', '--ignore-certificate-errors',
        '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default', '--mute-audio', 'about:blank',
    ], { stdio: 'ignore' });
    try {
        let target;
        for (let i = 0; i < 100 && !target; i++) {
            await wait(200);
            try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* starting */ }
        }
        if (!target) throw new Error('Chrome did not start.');
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
        let id = 0;
        const pending = new Map();
        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
        });
        const send = (method, params = {}) => new Promise(resolve => { id += 1; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
        const evaluate = async expression => {
            const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description || 'Page error');
            return reply.result?.result?.value;
        };
        await send('Page.enable');
        await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

        for (const style of styles) {
            for (const stage of stages) {
                const url = `${origin}/3dTree/3dTree.html?capture2d=1&look=${CAPTURE_LOOKS[style]}&stage=${stage}&growth=1&orbit=off`;
                process.stdout.write(`${style} stage ${stage}: `);
                await send('Page.navigate', { url });
                const started = Date.now();
                while (!(await evaluate('window.tree2dCaptureReady === true').catch(() => false))) {
                    if (Date.now() - started > READY_TIMEOUT_MS) throw new Error(`The 3D page did not get ready: ${url}`);
                    await wait(500);
                }
                const capture = await evaluate('window.tree2dCapture()');
                const saved = saveTreeCapture(paths.ASSETS, { style, stage, ...capture });
                console.log(`saved ${saved.urls.scene} (canopy ${saved.canopy ? `${saved.canopy.width} x ${saved.canopy.height}` : 'none'})`);
            }
        }
        socket.close();
    } finally {
        chrome.kill();
        await wait(1500);
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still closing */ }
    }
}

main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
});
