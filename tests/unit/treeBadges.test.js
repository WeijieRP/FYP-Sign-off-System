// Owner: Role 2, Wei Jie.
// Unit tests for the tree leaves' badges (GET /api/tree, backend/features/tree/routes.js): a visitor who chose
// several pledge topics in the pledge form gets one "Multiple pledges" leaf, brown by default. The route runs with
// a stand-in database (no real database is used). Run: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
// The route reports each request on the console; quiet here, as that output upsets the test runner's own messages.
console.log = () => {};
console.debug = () => {};
const tree = require('../../backend/features/tree/routes');

const year = new Date().getFullYear();
const row = (id, name, metadata) => ({
    feedback_id: id, name, visit_count: 1, user_created_at: `${year}-03-01T00:00:00.000Z`, created_at: `${year}-03-01T00:00:00.000Z`,
    comment: 'I will bring my own bottle.', data_retention: 'longterm', metadata: JSON.stringify(metadata), answer_values: null
});
const ROWS = [
    row(1, 'Several', { pledgeTopic: 'climate-change', pledgeTopics: ['climate-change', 'ocean-conservation', 'community-impact'] }),
    row(2, 'One', { pledgeTopic: 'ocean-conservation', pledgeTopics: ['ocean-conservation'] }),
    row(3, 'Older', { pledgeTopic: 'renewable-energy' }), // saved before several topics could be chosen
    row(4, 'None', {}),
    row(5, 'Twice the same', { pledgeTopics: ['climate-change', 'climate-change'] })
];

async function leaves() {
    tree.setDatabase({
        all: (sql, params, callback) => (typeof params === 'function' ? params : callback)(null, /vip/i.test(sql) ? [] : ROWS),
        get: (sql, params, callback) => (typeof params === 'function' ? params : callback)(null, {})
    });
    const app = express();
    app.use('/api/tree', tree.router);
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tree`);
        assert.equal(response.status, 200);
        return Object.fromEntries((await response.json()).map(leaf => [leaf.name, leaf]));
    } finally {
        server.close();
    }
}

test('several pledge topics: one "Multiple pledges" leaf, brown, naming every badge', async () => {
    const leaf = (await leaves()).Several;
    assert.equal(leaf.badgeKey, 'multi-pledge');
    assert.equal(leaf.badgeColor, '#8b5a2b');
    assert.deepEqual(leaf.badgeKeys, ['climate-champion', 'ocean-guardian', 'social-champion']);
    assert.match(leaf.badgeName, /^Multiple pledges: Climate Champion, Ocean Guardian, Social Champion$/);
    assert.deepEqual(leaf.pledgeTopics, ['climate-change', 'ocean-conservation', 'community-impact']);
});

test('one pledge topic (or none, or the same one twice): its own badge, as before', async () => {
    const all = await leaves();
    assert.equal(all.One.badgeKey, 'ocean-guardian');
    assert.equal(all.Older.badgeKey, 'renewable-innovator');
    assert.equal(all.None.badgeKey, 'feedback-completer');
    assert.equal(all['Twice the same'].badgeKey, 'climate-champion');
    assert.deepEqual(all.One.badgeKeys, ['ocean-guardian']);
});
