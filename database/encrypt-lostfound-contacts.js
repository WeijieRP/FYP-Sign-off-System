#!/usr/bin/env node
// Owner: Role 3, Jun Kai.
// <Jun Kai start>
// Encrypts the contact of Lost & Found reports saved before migration 010, with the same key as visitor emails.
// Only rows that still have a plain contact and nothing encrypted are touched, so it can run twice.
// Each row: encrypt, decrypt again and compare, write the encrypted value, read it back and decrypt it, and only
// then empty the plain column (in the same UPDATE, guarded so a row that changed meanwhile is left alone).
//
//   node database/encrypt-lostfound-contacts.js            dry run: says which database and how many rows, writes nothing
//   node database/encrypt-lostfound-contacts.js --apply    does it
//
// Make a backup of the database first, and run "npm run db:migrate" before (it adds the column).
// It reads backend/.env like the server (ENCRYPTION_KEY and the DB_ settings); a variable already set wins.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env'), quiet: true });
const mysql = require('mysql2/promise');
const auth = require('../backend/core/auth');
const contact = require('../backend/features/lostFound/contact');

const apply = process.argv.includes('--apply');

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'kiosk_user',
        password: process.env.DB_PASSWORD || 'kiosk123',
        database: process.env.DB_NAME || 'dp_kiosk_db',
    });
    try {
        const [[where]] = await conn.query('SELECT DATABASE() AS db, @@hostname AS host, @@port AS port');
        console.log(`Database: ${where.db} on ${where.host}:${where.port}${apply ? '' : '  (dry run, nothing is written)'}`);
        if (auth.usesDevelopmentKey()) console.log('Warning: backend/.env has no ENCRYPTION_KEY, so the public development key is used (the same as for the emails).');

        const [columns] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lost_found_reports' AND COLUMN_NAME = 'contact_info_encrypted'");
        if (!columns[0].n) {
            console.log('The column contact_info_encrypted is missing: run "npm run db:migrate" first.');
            process.exitCode = 1;
            return;
        }

        const [rows] = await conn.query("SELECT id, contact_info, contact_info_encrypted FROM lost_found_reports WHERE contact_info_encrypted IS NULL AND TRIM(contact_info) <> '' ORDER BY id");
        const todo = rows.filter(contact.needsEncrypting);
        console.log(`${todo.length} report(s) still have a plain contact.`);
        if (!apply || !todo.length) return;

        let done = 0;
        for (const row of todo) {
            const plain = String(row.contact_info).trim();
            const encrypted = auth.encryptEmail(plain);
            if (auth.decryptEmail(encrypted) !== plain) throw new Error(`report ${row.id}: the encrypted value does not decrypt to the same contact, stopped before writing`);
            const [result] = await conn.query(
                "UPDATE lost_found_reports SET contact_info_encrypted = ?, contact_info = '' WHERE id = ? AND contact_info_encrypted IS NULL AND contact_info = ?",
                [encrypted, row.id, row.contact_info]
            );
            if (!result.affectedRows) { console.log(`report ${row.id}: changed meanwhile, left alone`); continue; }
            const [[back]] = await conn.query('SELECT contact_info, contact_info_encrypted FROM lost_found_reports WHERE id = ?', [row.id]);
            if (contact.revealContact(back, auth.decryptEmail) !== plain) {
                // put the plain value back: the row must never end up with a contact nobody can read
                await conn.query('UPDATE lost_found_reports SET contact_info = ?, contact_info_encrypted = NULL WHERE id = ?', [row.contact_info, row.id]);
                throw new Error(`report ${row.id}: read back did not match, the plain contact was put back and the script stopped`);
            }
            done++;
        }
        console.log(`Encrypted ${done} contact(s).`);
    } finally {
        await conn.end();
    }
})().then(() => process.exit(process.exitCode || 0)).catch((error) => {
    console.error('Stopped:', error.message);
    process.exit(1);
});
// <Jun Kai end>
