//=====================================================
// File: startAll.js (Done by Yu Kang)
// Description: This script starts both the backend server and the kiosk server concurrently.
// Usage: Run this script using Node.js to start both servers.
// Note: Ensure that you have the necessary permissions to run child processes and that the required scripts exist in the specified paths.
//=====================================================

const { spawn } = require('child_process');
const path = require('path');

const scripts = ['backend/server.js', 'backend/kioskServer.js'];
const children = [];
// <Jun Kai start>
// Why the programs stop is left in a small note for the next start (backend/core/stopNote.js), and why they started
// is passed on to the servers: the logon shortcut that install.cmd makes runs "startAll.js --logon".
const stopNote = require('./backend/core/stopNote');
const passedOn = process.argv.includes('--logon') ? ['--logon'] : [];
let stopping = false;
// <Jun Kai end>

function startScript(scriptName) {
	const child = spawn(process.execPath, [path.join(__dirname, scriptName), ...passedOn], { // <Jun Kai/> passedOn
		cwd: __dirname,
		stdio: 'inherit',
		env: process.env,
	});

	child.on('exit', (code, signal) => {
		console.log(`Process ended: ${scriptName} ${signal ? `(${signal})` : `(code ${code})`}`);
		// <Jun Kai start> a server that ends by itself takes the other one with it: say which one it was
		if (!stopping) stopNote.write('child-exit', `${scriptName} ended ${signal ? `(${signal})` : `(code ${code})`}, so startAll.js stopped the other server too.`);
		stopping = true;
		// <Jun Kai end>

		for (const otherChild of children) {
			if (otherChild !== child && !otherChild.killed) {
				otherChild.kill();
			}
		}

		if (!process.exitCode) {
			process.exitCode = code ?? 1;
		}
	});

	child.on('error', (error) => {
		console.error(`Failed to start ${scriptName}:`, error.message);
		process.exitCode = 1;
	});

	children.push(child);
}

for (const scriptName of scripts) {
	startScript(scriptName);
}

function shutdown(reason) {
	// <Jun Kai start>
	if (!stopping && typeof reason === 'string') stopNote.write(reason);
	stopping = true;
	// <Jun Kai end>
	for (const child of children) {
		if (!child.killed) {
			child.kill();
		}
	}
}

// <Jun Kai start> each way of stopping leaves its own reason; SIGHUP is what Windows sends when the window is closed
process.on('SIGINT', () => shutdown('ctrl-c'));
process.on('SIGTERM', () => shutdown('terminated'));
process.on('SIGHUP', () => shutdown('window-closed'));
// <Jun Kai end>
