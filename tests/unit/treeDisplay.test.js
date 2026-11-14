// Owner: Role 2, Wei Jie.
// Unit tests for choosing the tree on the wall (2D /tree or 3D /3dTree). Run: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const { serveChosenTree } = require('../../backend/features/parameters/treeDisplay');

function call(handler, originalUrl) {
    const outcome = {};
    handler({ originalUrl }, { redirect: (status, url) => Object.assign(outcome, { status, url }) });
    return outcome;
}

test('the chosen tree\'s page is sent as it is', () => {
    let sent = false;
    const handler = serveChosenTree('3d', () => { sent = true; }, () => '3d');
    assert.deepEqual(call(handler, '/3dTree'), {});
    assert.equal(sent, true);
});

test('the other tree\'s address goes straight to the chosen tree, keeping its options', () => {
    const page = () => assert.fail('the page of the tree not chosen is not sent');
    assert.deepEqual(call(serveChosenTree('2d', page, () => '3d'), '/tree'), { status: 302, url: '/3dTree' });
    assert.deepEqual(call(serveChosenTree('3d', page, () => '2d'), '/3dTree?clean=1&stage=2'), { status: 302, url: '/tree?clean=1&stage=2' });
});

test('anything other than 3d counts as the 2D tree', () => {
    assert.deepEqual(call(serveChosenTree('3d', () => {}, () => undefined), '/3dTree'), { status: 302, url: '/tree' });
});
