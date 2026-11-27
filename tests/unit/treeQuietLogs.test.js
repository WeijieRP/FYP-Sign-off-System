// Owner: Role 3, Jun Kai (a change in Role 2's tree routes, asked for by the user).
// The tree routes print nothing when they work, and a problem at most 3 short lines in 10 minutes.
// Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');

test('a tree problem prints one short line, at most 3 in 10 minutes, then again after that', () => {
    const { treeProblem } = require('../../backend/features/tree/routes');
    const printed = [];
    const real = console.error;
    console.error = (...args) => printed.push(args.join(' '));
    try {
        const start = 1000000000000;
        const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3307\n    at stack line'), { code: 'ECONNREFUSED' });
        for (let i = 0; i < 20; i++) treeProblem('the leaves could not be read', err, start + i * 1000);
        assert.equal(printed.length, 3, 'twenty failures in twenty seconds print three lines');
        assert.ok(printed.every((line) => !line.includes('\n')), 'each problem is one line, no stack trace');
        assert.match(printed[0], /^Tree: the leaves could not be read: ECONNREFUSED connect ECONNREFUSED 127\.0\.0\.1:3307 at stack line$/);
        assert.match(printed[2], /further tree problems are not shown for 10 minutes/);
        treeProblem('the database is not ready', null, start + 9 * 60 * 1000);
        assert.equal(printed.length, 3, 'still quiet inside the 10 minutes');
        treeProblem('the database is not ready', null, start + 10 * 60 * 1000);
        assert.equal(printed.length, 4, 'after 10 minutes a problem is shown again');
        assert.equal(printed[3], 'Tree: the database is not ready');
    } finally {
        console.error = real;
    }
});
// <Jun Kai end>
