// Owner: Role 3, Jun Kai.
// Names the admin gives the tablets on the System Health page, such as "Tablet 1" or "Entrance". Kept apart from
// the heartbeat rows so a kiosk can never overwrite them; a tablet without a name keeps showing its device name.
// Saved in backend/data/tablet-names.json, seeded from backend/config/defaults/tablet-names.json.
// <Jun Kai start>
const paths = require('../../core/paths');
const { readJson, writeJsonAtomic } = require('../../core/jsonFile');

const DEVICE_ID = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_LENGTH = 40;
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const file = () => paths.dataFile('tablet-names.json');
const isDeviceId = (id) => DEVICE_ID.test(String(id || '')) && !['__proto__', 'constructor', 'prototype'].includes(String(id)); // never a built-in key of the names object

function all() {
    const data = readJson(file(), null);
    return data && data.names && typeof data.names === 'object' ? data.names : {};
}

// What the admin typed, tidied: { name } (null = show the device name again) or { error }
function clean(input) {
    if (input !== null && input !== undefined && typeof input !== 'string') return { error: 'The name must be text' };
    const name = String(input || '').replace(/\s+/g, ' ').trim();
    if ([...name].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return { error: 'The name has a character that cannot be shown' };
    if (name.length > MAX_LENGTH) return { error: `Use ${MAX_LENGTH} characters or fewer` };
    return { name: name || null };
}

// The device that already uses this name (case does not matter), or null
function takenBy(names, deviceId, name) {
    return Object.keys(names).find((id) => id !== deviceId && collator.compare(names[id], name) === 0) || null;
}

// Named tablets first in number order ("Tablet 2" before "Tablet 10"), the rest after them as they came
function sortDevices(devices) {
    return devices.slice().sort((a, b) => {
        if (!a.name || !b.name) return (a.name ? 0 : 1) - (b.name ? 0 : 1);
        return collator.compare(a.name, b.name);
    });
}

// Saves or clears one name: { name } or { error, status }
function setName(deviceId, input) {
    if (!isDeviceId(deviceId)) return { error: 'Not a device id', status: 400 };
    const result = clean(input);
    if (result.error) return { error: result.error, status: 400 };
    const names = all();
    if (result.name) {
        const other = takenBy(names, deviceId, result.name);
        if (other) return { error: `Another tablet is already called "${names[other]}"`, status: 409 };
        names[deviceId] = result.name;
    } else {
        delete names[deviceId];
    }
    writeJsonAtomic(file(), { names });
    return { name: result.name };
}

module.exports = { all, clean, takenBy, sortDevices, setName, isDeviceId, MAX_LENGTH };
// <Jun Kai end>
