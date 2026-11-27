// Owner: Role 2, Wei Jie.
// Event-driven refresh for the 3D tree page (Task 2), the same as the 2D tree's (frontend/tree/tree.js
// connectTreeLiveUpdates): one Server-Sent Events connection to GET /api/tree/events
// (backend/features/tree/liveEvents.js), shared by the visitors' leaves (feedback-leaves.js) and the admin's
// settings (tree3d-settings.js). "tree" comes the moment the tree's data changes (a new feedback or pledge, one
// deleted or archived, a VIP change), "settings" when the admin saves settings, "ready" on (re)connecting. While
// connected, the page's timed checks are only a safety net (LIVE_FALLBACK_MS); when the connection drops the
// browser reconnects by itself and the timed checks run as before meanwhile. Not in the capture mode for the 2D
// tree's pictures (?capture2d=1), which stands still.

export const LIVE_FALLBACK_MS = 120000;

const listeners = { tree: new Set(), settings: new Set(), ready: new Set() };
let source = null;
let connected = false;

const capturing = new URLSearchParams(location.search).get('capture2d') === '1';

function emit(type) {
  for (const listener of listeners[type]) {
    try { listener(); } catch (error) { console.warn(`A live "${type}" listener failed.`, error); }
  }
}

function connect() {
  if (source || capturing || typeof EventSource !== 'function') return;
  source = new EventSource('/api/tree/events');
  source.addEventListener('ready', () => { connected = true; emit('ready'); });
  source.addEventListener('tree', () => emit('tree'));
  source.addEventListener('settings', () => emit('settings'));
  source.addEventListener('error', () => { connected = false; }); // the browser reconnects by itself
}

// Calls listener on each "tree", "settings" or "ready" message; returns a function that stops it.
export function onLiveUpdate(type, listener) {
  listeners[type].add(listener);
  connect();
  return () => listeners[type].delete(listener);
}

// Whether the live connection is open now (the timed checks can then be slow).
export const liveConnected = () => connected;
