// Owner: Role 3, Jun Kai.
// Unit tests for one cell of a CSV download (backend/core/csv.js). Run: npm run test:unit
// <Jun Kai start>
const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCell } = require('../../backend/core/csv');

test('0 and false are kept, no value is an empty cell', () => {
    assert.equal(csvCell(0), '"0"');
    assert.equal(csvCell(false), '"false"');
    assert.equal(csvCell(''), '""');
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell(undefined), '""');
    assert.equal(csvCell(12.5), '"12.5"');
});

test('quotes are doubled and commas and line breaks stay inside the cell', () => {
    assert.equal(csvCell('He said "hi", twice'), '"He said ""hi"", twice"');
    assert.equal(csvCell('line 1\nline 2'), '"line 1\nline 2"');
});

test('a date is written in Singapore time as YYYY-MM-DD HH:mm:ss', () => {
    assert.equal(csvCell(new Date(Date.UTC(2026, 10, 18, 16, 30, 5))), '"2026-11-19 00:30:05"');
    assert.equal(csvCell(new Date('nonsense')), '""');
});

test('text that a spreadsheet would run as a formula gets a quote mark in front', () => {
    assert.equal(csvCell('=HYPERLINK("http://x","click")'), '"\'=HYPERLINK(""http://x"",""click"")"');
    assert.equal(csvCell('+65 1234'), '"\'+65 1234"');
    assert.equal(csvCell('@name'), '"\'@name"');
    assert.equal(csvCell('-cmd'), '"\'-cmd"');
    assert.equal(csvCell('\tcell'), '"\'\tcell"');
});

test('a plain number stays a number, also as text and when negative', () => {
    assert.equal(csvCell(-5), '"-5"');
    assert.equal(csvCell('-5'), '"-5"');
    assert.equal(csvCell('+3.5'), '"+3.5"');
    assert.equal(csvCell('I pledge to recycle - every day'), '"I pledge to recycle - every day"');
});
// <Jun Kai end>
