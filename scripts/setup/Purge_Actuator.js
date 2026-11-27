// Owner: Role 3, Jun Kai (install and setup scripts). Previous team: Preti (17).
// WHOLE FILE DONE BY PRETI

// ============================================================
// PURGE_ACTUATOR.JS - TABLE OF CONTENTS 
// ============================================================
// 
// 1. IMPORTS & CONFIGURATION
//    require('dotenv')                - Environment variables (DONE BY PRETI)
//    const mysql                      - MySQL database library (DONE BY PRETI)
//    const readline                   - Terminal input interface (DONE BY PRETI)
//    const db                         - Database connection instance (DONE BY PRETI)
//    const rl                         - Readline interface instance (DONE BY PRETI)
//
// 2. DATABASE CONNECTION & DATA PURGE
//    db.connect()                     - Connect to database and show counts (DONE BY PRETI)
//    Query user count                 - Get current user count (DONE BY PRETI)
//    Query feedback count             - Get current feedback count (DONE BY PRETI)
//    Query audit_logs count           - Get current audit log count (DONE BY PRETI)
//    Query pledge_likes count         - Get current pledge likes count (DONE BY PRETI)
//    Confirmation prompt              - Ask user to confirm deletion (DONE BY PRETI)
//    DELETE pledge_likes              - Delete all pledge likes (DONE BY PRETI)
//    DELETE audit_logs                - Delete all audit log entries (DONE BY PRETI)
//    DELETE feedback                  - Delete all feedback entries (DONE BY PRETI)
//    DELETE users                     - Delete all user entries (DONE BY PRETI)
//    Reset auto-increment             - Reset table auto-increment counters (DONE BY PRETI)
//
// ============================================================
// Utility script to completely purge all test data from the database.
// Deletes all users, feedback, pledge likes, and audit logs.
// Resets auto-increment counters for clean state.
// 
// USAGE: node Purge_Actuator.js
// WARNING: This action CANNOT be undone! All data will be lost.
//
// NOTE: pledge_likes has CASCADE DELETE from feedback table, so they will
// be automatically deleted when feedback is deleted. However, we explicitly
// delete them first for clarity and to show the count to the user.
// ============================================================

// ==================== 1. IMPORTS & CONFIGURATION ====================

// Load environment variables from .env file
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', 'backend', '.env'), quiet: true });

// MySQL database library for database operations
const mysql = require('mysql2');

// Terminal input interface for confirmation prompts
const readline = require('readline');

// Database connection instance using environment variables
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'kiosk_user',
    password: process.env.DB_PASSWORD || 'kiosk123',
    database: process.env.DB_NAME || 'dp_kiosk_db'
});

// Readline interface instance for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('='.repeat(60));
console.log('⚠️  CLEAR ALL TEST DATA');
console.log('='.repeat(60));
console.log('');
console.log('This will DELETE ALL feedback, user, pledge likes, and audit log data!');
console.log('');

// ==================== 2. DATABASE CONNECTION & DATA PURGE ====================

// Connect to database and display current data counts
db.connect((err) => {
    if (err) {
        console.log('❌ Database connection failed:', err.message);
        process.exit(1);
    }
    
    // Get current count of users in database
    db.query('SELECT COUNT(*) as users FROM users', (err, userResult) => {
        if (err) {
            console.log('❌ Query failed:', err.message);
            db.end();
            process.exit(1);
        }
        
        // Get current count of feedback entries in database
        db.query('SELECT COUNT(*) as feedback FROM feedback', (err, feedbackResult) => {
            if (err) {
                console.log('❌ Query failed:', err.message);
                db.end();
                process.exit(1);
            }
            
            // Get current count of audit logs in database
            db.query('SELECT COUNT(*) as audit_logs FROM audit_logs', (err, auditResult) => {
                if (err) {
                    console.log('❌ Query failed:', err.message);
                    db.end();
                    process.exit(1);
                }
                
                // Get current count of pledge likes in database
                db.query('SELECT COUNT(*) as pledge_likes FROM pledge_likes', (err, pledgeLikesResult) => {
                    if (err) {
                        console.log('❌ Query failed:', err.message);
                        db.end();
                        process.exit(1);
                    }
                    
                    const userCount = userResult[0].users;
                    const feedbackCount = feedbackResult[0].feedback;
                    const auditLogCount = auditResult[0].audit_logs;
                    const pledgeLikesCount = pledgeLikesResult[0].pledge_likes;
                    
                    console.log('📊 Current Database Contents:');
                    console.log(`   Users: ${userCount}`);
                    console.log(`   Feedback: ${feedbackCount}`);
                    console.log(`   Pledge Likes: ${pledgeLikesCount}`);
                    console.log(`   Audit Logs: ${auditLogCount}`);
                    console.log('');
                    console.log('⚠️  WARNING: This action CANNOT be undone!');
                    console.log('');
                    
                    // Prompt user to confirm data deletion
                    rl.question('Are you sure you want to delete ALL data? (yes/no): ', (answer) => {
                        if (answer.toLowerCase() !== 'yes') {
                            console.log('');
                            console.log('✅ Cancelled. No data was deleted.');
                            rl.close();
                            db.end();
                            return;
                        }
                        
                        console.log('');
                        console.log('🗑️  Deleting all data...');
                        
                        // Delete pledge likes explicitly for clarity
                        db.query('DELETE FROM pledge_likes', (err, result) => {
                            if (err) {
                                console.log('❌ Failed to delete pledge likes:', err.message);
                                rl.close();
                                db.end();
                                return;
                            }
                            
                            console.log(`   ✅ Deleted ${result.affectedRows} pledge likes`);
                            
                            // Delete all audit log entries
                            db.query('DELETE FROM audit_logs', (err, result) => {
                                if (err) {
                                    console.log('❌ Failed to delete audit logs:', err.message);
                                    rl.close();
                                    db.end();
                                    return;
                                }
                                
                                console.log(`   ✅ Deleted ${result.affectedRows} audit log entries`);
                                
                                // Delete all feedback entries
                                db.query('DELETE FROM feedback', (err, result) => {
                                    if (err) {
                                        console.log('❌ Failed to delete feedback:', err.message);
                                        rl.close();
                                        db.end();
                                        return;
                                    }
                                    
                                    console.log(`   ✅ Deleted ${result.affectedRows} feedback entries`);
                                    
                                    // Delete all user entries
                                    db.query('DELETE FROM users', (err, result) => {
                                        if (err) {
                                            console.log('❌ Failed to delete users:', err.message);
                                            rl.close();
                                            db.end();
                                            return;
                                        }
                                        
                                        console.log(`   ✅ Deleted ${result.affectedRows} users`);
                                        // <Jun Kai start>
                                        // counts of deleted visitor records and the kiosk save gate belong to the rows just
                                        // cleared, so they go too (a table that is not there yet has nothing to clear)
                                        db.query('DELETE FROM deleted_record_counts', () => {});
                                        db.query('DELETE FROM visitor_save_gate', () => {});
                                        // leaves kept on the tree for archived visitors go with the feedback they came from
                                        db.query('DELETE FROM archived_leaves', () => {});
                                        // the anomaly detection's incidents and health history belong to this data too
                                        db.query('DELETE FROM incident_events', () => {});
                                        db.query('DELETE FROM incidents', () => {});
                                        db.query('DELETE FROM health_check_results', () => {});
                                        // <Jun Kai end>

                                        // Reset auto-increment counter for pledge_likes table
                                        db.query('ALTER TABLE pledge_likes AUTO_INCREMENT = 1', (err) => {
                                            if (!err) console.log('   ✅ Reset pledge_likes auto-increment');
                                            
                                            // Reset auto-increment counter for audit_logs table
                                            db.query('ALTER TABLE audit_logs AUTO_INCREMENT = 1', (err) => {
                                                if (!err) console.log('   ✅ Reset audit_logs auto-increment');
                                                
                                                // Reset auto-increment counter for feedback table
                                                db.query('ALTER TABLE feedback AUTO_INCREMENT = 1', (err) => {
                                                    if (!err) console.log('   ✅ Reset feedback auto-increment');
                                                    
                                                    // Reset auto-increment counter for users table
                                                    db.query('ALTER TABLE users AUTO_INCREMENT = 1', (err) => {
                                                        if (!err) console.log('   ✅ Reset users auto-increment');
                                                        
                                                        console.log('');
                                                        console.log('='.repeat(60));
                                                        console.log('✅ ALL DATA CLEARED SUCCESSFULLY!');
                                                        console.log('='.repeat(60));
                                                        console.log('');
                                                        console.log('📊 Database is now empty and ready for fresh data.');
                                                        console.log('');
                                                        console.log('Next steps:');
                                                        console.log('   1. Run: node generate_test_data.js');
                                                        console.log('   2. Generate new test entries');
                                                        console.log('   3. Test your admin panel and leaderboard!');
                                                        console.log('');
                                                        
                                                        rl.close();
                                                        db.end();
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});