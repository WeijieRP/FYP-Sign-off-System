// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// One cell of a CSV file, in quotes. Used by the CSV files the server builds for the admin page: the feedback, audit
// log and school impact exports (features/archive/exportRoutes.js) and the lost-and-found and two older downloads
// (features/admin/routes.js). The archive zip has its own cell with the same rules (features/archive/visitorFiles.js),
// and so has the audit page's own download (frontend/admin/js/lostFound.js).
//  - no value is an empty cell, but 0 and false are kept (0 used to come out blank);
//  - a date is written as YYYY-MM-DD HH:mm:ss in Singapore time, not the way JavaScript prints a Date;
//  - text that a spreadsheet would run as a formula (it starts with = + - @, a tab or a return) gets a ' in front, so
//    a visitor cannot put a formula into the file through a name or a pledge. A plain number such as -5 is left alone.
const SGT = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function csvCell(value) {
    if (value === null || value === undefined) return '""';
    let text;
    if (value instanceof Date) text = Number.isNaN(value.getTime()) ? '' : SGT.format(value);
    else text = String(value);
    if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

module.exports = { csvCell };
// <Jun Kai end>
