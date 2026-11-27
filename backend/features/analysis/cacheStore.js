// Owner: Role 3, Jun Kai. Previous team: Yu Kang (1).
//==============================================================
// feedbackAnalysisCacheStore.js (Done by Yu Kang)
// This module provides a caching mechanism for feedback analysis results.
// It supports both JSON file storage and MySQL database storage, allowing for flexible caching strategies.
// - The cache is keyed by a combination of analysis mode, model name, and normalized text, ensuring that identical analyses are reused.
// - The cache entries include sentiment results, hit counts, and timestamps for when the analysis was performed and last used.
// - The module provides functions to retrieve and save multiple cache entries, as well as to manage the storage mode (JSON, database, or both).
// - The cache is automatically hydrated from the chosen storage medium upon initialization, ensuring that previously cached results are available for reuse.
// - The module also includes functions to normalize text and model names, ensuring consistent cache key generation.
// - The cache settings are persisted in a JSON file, allowing for easy configuration of the storage mode.
//==============================================================


const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const paths = require('../../core/paths');

const db = require('../../core/db');

const CACHE_SCHEMA_VERSION = 1;
const CACHE_DIR = paths.CACHE;
const CACHE_FILE = path.join(CACHE_DIR, 'feedback-analysis-cache.json');
const CACHE_SETTINGS_FILE = path.join(CACHE_DIR, 'feedback-analysis-cache-settings.json');
const CACHE_TABLE = 'feedback_analysis_cache';

const MODE_MODEL_NAMES = {
    'rule-based': 'rule-based',
    xenova: 'Xenova/bert-base-multilingual-uncased-sentiment',
    localgpt: 'phi3',
    qwen: 'qwen2.5:3b',
    gemma: 'gemma2:2b'
};

const cacheMap = new Map();
let readyPromise = null;
let storageMode = 'both';

function toCustomDateString(value) {
    if (value === undefined || value === null) {
        return mysqlDate();
    }
    let date;
    if (value instanceof Date) {
        date = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!isNaN(parsed)) {
            date = parsed;
        } else {
            date = new Date();
        }
    } else {
        date = new Date();
    }
    return mysqlDate(date);
}

function mysqlDate(date = new Date()) {
        const pad = (n) => String(n).padStart(2, '0');
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

function ensureSettingsDir() {
    const settingsDir = path.dirname(CACHE_SETTINGS_FILE);
    if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
    }
}

function normalizeStorageMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'json' || mode === 'database' || mode === 'both') {
        return mode;
    }
    return 'both';
}

function readStorageMode() {
    try {
        if (!fs.existsSync(CACHE_SETTINGS_FILE)) {
            return 'both';
        }

        const raw = fs.readFileSync(CACHE_SETTINGS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return normalizeStorageMode(parsed.storageMode);
    } catch (error) {
        console.warn('⚠️ Feedback analysis cache settings load skipped:', error.message);
        return 'both';
    }
}



function writeCacheToFile() {
    ensureCacheDir();

    const filePayload = {
        version: CACHE_SCHEMA_VERSION,
        updatedAt: mysqlDate(),
        entries: Object.fromEntries(cacheMap.entries())
    };

    fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify(filePayload, null, 2),
        'utf8'
    );

    console.debug(`✅ JSON cache synced (${cacheMap.size} entries)`);
}

async function writeCacheToDatabase() {
    if (cacheMap.size === 0) {
        return;
    }

    const values = Array.from(cacheMap.values()).map(entry => [
        entry.cacheKey,
        entry.mode,
        entry.modelName,
        entry.normalizedText,
        entry.sourceText,
        entry.sentiment,
        entry.hitCount,
        entry.analyzedAt,
        entry.lastUsedAt
    ]);

    const sql = `
        INSERT INTO ${CACHE_TABLE}
        (
            cache_key,
            analysis_mode,
            model_name,
            normalized_text,
            source_text,
            sentiment,
            hit_count,
            analyzed_at,
            last_used_at
        )
        VALUES ?
        ON DUPLICATE KEY UPDATE
            analysis_mode = VALUES(analysis_mode),
            model_name = VALUES(model_name),
            normalized_text = VALUES(normalized_text),
            source_text = VALUES(source_text),
            sentiment = VALUES(sentiment),
            hit_count = VALUES(hit_count),
            analyzed_at = VALUES(analyzed_at),
            last_used_at = VALUES(last_used_at)
    `;

    await db.pool.promise().query(sql, [values]);

    console.debug(`✅ Database cache synced (${cacheMap.size} entries)`);
}


function writeStorageMode(mode) {
    try {
        ensureSettingsDir();
        const payload = {
            storageMode: normalizeStorageMode(mode),
            updatedAt: mysqlDate()
        };

        fs.writeFileSync(CACHE_SETTINGS_FILE, JSON.stringify(payload, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('❌ Failed to save feedback analysis cache settings:', error.message);
        return false;
    }
}

function normalizeAnalysisText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getModelName(mode) {
    return MODE_MODEL_NAMES[mode] || mode || 'unknown';
}

function buildCacheKey(mode, modelName, text) {
    const normalizedText = normalizeAnalysisText(text);
    return crypto
        .createHash('sha256')
        .update([CACHE_SCHEMA_VERSION, mode || '', modelName || '', normalizedText].join('|'))
        .digest('hex');
}

function createCacheEntry({ mode, modelName, text, sentiment, hitCount = 1, analyzedAt, lastUsedAt}) {
    const normalizedText = normalizeAnalysisText(text);
    const cacheKey = buildCacheKey(mode, modelName, normalizedText);

    return {
        cacheKey,
        mode,
        modelName,
        normalizedText,
        sourceText: String(text || '').trim(),
        sentiment,
        hitCount,
        analyzedAt: toCustomDateString(analyzedAt),
        lastUsedAt: toCustomDateString(lastUsedAt)
    };
}

function upsertCacheEntry(entry) {
    if (!entry || !entry.cacheKey) {
        return null;
    }

    const existing = cacheMap.get(entry.cacheKey);
    const merged = {
        ...existing,
        ...entry,
        hitCount: Number(entry.hitCount ?? existing?.hitCount ?? 1) || 1,
        analyzedAt: toCustomDateString(entry.analyzedAt ?? existing?.analyzedAt),
        lastUsedAt: toCustomDateString(entry.lastUsedAt ?? existing?.lastUsedAt)
    };

    cacheMap.set(entry.cacheKey, merged);
    return merged;
}

function hydrateFromFile() {
    ensureCacheDir();

    if (!fs.existsSync(CACHE_FILE)) {
        return;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const entries = Array.isArray(parsed.entries)
            ? parsed.entries
            : Object.values(parsed.entries || {});

        entries.forEach(entry => {
            // Normalise dates if they exist in the file
            if (entry.analyzedAt) entry.analyzedAt = toCustomDateString(entry.analyzedAt);
            if (entry.lastUsedAt) entry.lastUsedAt = toCustomDateString(entry.lastUsedAt);
            upsertCacheEntry(entry)
        });
        console.log(`✅ Loaded ${cacheMap.size} feedback analysis cache entr${cacheMap.size === 1 ? 'y' : 'ies'} from file`);
    } catch (error) {
        console.error('❌ Failed to read feedback analysis cache file:', error.message);
    }
}

async function hydrateFromDatabase() {
    try {
        const [rows] = await db.pool.promise().query(
            `SELECT cache_key, analysis_mode, model_name, normalized_text, source_text, sentiment, hit_count, analyzed_at, last_used_at
             FROM ${CACHE_TABLE}
             ORDER BY last_used_at DESC, analyzed_at DESC`
        );

        (rows || []).forEach(row => {
            // Convert any Date objects to our string format
            let analyzedAt = row.analyzed_at;
            let lastUsedAt = row.last_used_at;
            if (analyzedAt instanceof Date) {
                analyzedAt = mysqlDate(analyzedAt);
            }
            if (lastUsedAt instanceof Date) {
                lastUsedAt = mysqlDate(lastUsedAt);
            }

            upsertCacheEntry({
                cacheKey: row.cache_key,
                mode: row.analysis_mode,
                modelName: row.model_name,
                normalizedText: row.normalized_text,
                sourceText: row.source_text,
                sentiment: row.sentiment,
                hitCount: row.hit_count,
                analyzedAt: row.analyzed_at,
                lastUsedAt: row.last_used_at
            });
        });

        console.log(`✅ Loaded feedback analysis cache from database (${rows.length} row${rows.length === 1 ? '' : 's'})`);
    } catch (error) {
        console.warn('⚠️ Feedback analysis cache database load skipped:', error.message);
    }
}

async function ensureCacheTable() {
    await db.pool.promise().query(
        `CREATE TABLE IF NOT EXISTS ${CACHE_TABLE} (
            cache_key VARCHAR(255) PRIMARY KEY,
            analysis_mode VARCHAR(50) NOT NULL,
            model_name VARCHAR(100) NOT NULL,
            normalized_text TEXT NOT NULL,
            source_text TEXT NOT NULL,
            sentiment ENUM('positive', 'neutral', 'negative') NOT NULL,
            hit_count INT NOT NULL DEFAULT 1,
            analyzed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_analysis_mode (analysis_mode),
            INDEX idx_model_name (model_name),
            INDEX idx_last_used_at (last_used_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
}

async function saveEntryToDatabase(entry) {
    if (!entry) return;

    try {
        const sql = `
            INSERT INTO ${CACHE_TABLE}
            (
                cache_key,
                analysis_mode,
                model_name,
                normalized_text,
                source_text,
                sentiment,
                hit_count,
                analyzed_at,
                last_used_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
                sentiment = VALUES(sentiment),
                hit_count = hit_count + 1,
                last_used_at = NOW()
        `;

        await db.pool.promise().execute(sql, [
            entry.cacheKey,
            entry.mode,
            entry.modelName,
            entry.normalizedText,
            entry.sourceText,
            entry.sentiment,
            entry.hitCount
        ]);

    } catch (err) {
        console.error('❌ Failed to save cache entry to database:', err.message);
    }
}

async function ensureReady() {
    if (!readyPromise) {
        readyPromise = (async () => {
            storageMode = readStorageMode();

            try {
                if (storageMode === 'database' || storageMode === 'both') {
                    await ensureCacheTable();
                }
            } catch (error) {
                console.warn('⚠️ Feedback analysis cache table could not be ensured:', error.message);
            }

            if (storageMode === 'json') {
                hydrateFromFile();
            }

            if (storageMode === 'database') {
                await hydrateFromDatabase();
            }

            if (storageMode === 'both') {
                hydrateFromFile();
                await hydrateFromDatabase();

                // Make both storage locations identical
                writeCacheToFile();
                await writeCacheToDatabase();
            }
            return true;
        })();
    }

    return readyPromise;
}

async function getMany(mode, modelName, texts) {
    await ensureReady();

    const lookup = new Map();
    const resolvedModelName = modelName || getModelName(mode);

    (texts || []).forEach(text => {
        const normalizedText = normalizeAnalysisText(text);
        if (!normalizedText) {
            return;
        }

        const cacheKey = buildCacheKey(mode, resolvedModelName, normalizedText);
        const entry = cacheMap.get(cacheKey);

        if (entry) {
            lookup.set(normalizedText, entry);

            // Update statistics
            entry.hitCount++;
            entry.lastUsedAt = mysqlDate();
        }
    });

    return lookup;
}

async function saveMany(entries) {
    console.debug(`Saving ${entries.length} cache entries`);
    await ensureReady();

    const preparedEntries = [];
    const seenKeys = new Set();

    (entries || []).forEach(entry => {
        const mode = entry?.mode || 'unknown';
        const modelName = entry?.modelName || getModelName(mode);
        const normalizedText = normalizeAnalysisText(entry?.text);

        if (!normalizedText) {
            return;
        }

        const cacheEntry = createCacheEntry({
            mode,
            modelName,
            text: entry.text,
            sentiment: entry.sentiment || 'neutral'
        });

        if (seenKeys.has(cacheEntry.cacheKey)) {
            return;
        }

        seenKeys.add(cacheEntry.cacheKey);
        preparedEntries.push(cacheEntry);
        upsertCacheEntry(cacheEntry);
    });

    if (preparedEntries.length === 0) {
        return;
    }

    if (storageMode === 'json' || storageMode === 'both') {
        ensureCacheDir();

        const filePayload = {
            version: CACHE_SCHEMA_VERSION,
            updatedAt: mysqlDate(),
            entries: Object.fromEntries(cacheMap.entries())
        };

        console.debug(`Writing ${cacheMap.size} entries to ${CACHE_FILE}`);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(filePayload, null, 2), 'utf8');
    }

    if (storageMode === 'database' || storageMode === 'both') {
        try {
            const sql = `
                INSERT INTO ${CACHE_TABLE}
                    (cache_key, analysis_mode, model_name, normalized_text, source_text, sentiment, hit_count, analyzed_at, last_used_at)
                VALUES ?
                ON DUPLICATE KEY UPDATE
                    analysis_mode = VALUES(analysis_mode),
                    model_name = VALUES(model_name),
                    normalized_text = VALUES(normalized_text),
                    source_text = VALUES(source_text),
                    sentiment = VALUES(sentiment),
                    hit_count = VALUES(hit_count),
                    analyzed_at = VALUES(analyzed_at),
                    last_used_at = VALUES(last_used_at)
            `;

            const values = preparedEntries.map(entry => [
                entry.cacheKey,
                entry.mode,
                entry.modelName,
                entry.normalizedText,
                entry.sourceText,
                entry.sentiment,
                entry.hitCount,
                entry.analyzedAt,
                entry.lastUsedAt
            ]);

            await db.pool.promise().query(sql, [values]);
        } catch (error) {
            console.warn('⚠️ Feedback analysis cache database write skipped:', error.message);
        }
    }
}

function getStorageMode() {
    return storageMode;
}

function setStorageMode(mode) {
    const normalized = normalizeStorageMode(mode);
    const persisted = writeStorageMode(normalized);
    if (persisted) {
        storageMode = normalized;
        readyPromise = null;
    }
    return persisted ? storageMode : null;
}

async function reloadCache() {
    cacheMap.clear();
    readyPromise = null;
    await ensureReady();
    return storageMode;
}

module.exports = {
    ensureReady,
    getMany,
    saveMany,
    normalizeAnalysisText,
    getModelName,
    buildCacheKey,
    getStorageMode,
    setStorageMode,
    reloadCache,
    normalizeStorageMode
};

// <Jun Kai start>
// Removes every cached analysis of these texts (Visitor Data Archive, after the records were deleted) from memory,
// the JSON file and the table, whatever the storage mode is now: a store the admin switched away from still holds
// old entries, and switching back to "both" copies them into the other store. Returns how many entries left memory.
async function purgeTexts(texts) {
    const wanted = new Set([...(texts || [])].map(normalizeAnalysisText).filter(Boolean));
    if (wanted.size === 0) return 0;
    // load first: in "both" mode loading rewrites the table from memory, which would bring purged rows back
    await ensureReady();
    const isWanted = (entry) => wanted.has(normalizeAnalysisText(entry && (entry.normalizedText || entry.sourceText)));
    let removed = 0;
    for (const [key, entry] of cacheMap) {
        if (isWanted(entry)) {
            cacheMap.delete(key);
            removed++;
        }
    }
    try {
        if (storageMode === 'json' || storageMode === 'both') {
            writeCacheToFile();
        } else if (fs.existsSync(CACHE_FILE)) {
            // database mode: memory came from the table, so filter the file itself (read and write with no await between)
            const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            const isList = Array.isArray(parsed.entries);
            const list = isList ? parsed.entries : Object.entries(parsed.entries || {});
            const kept = isList ? list.filter((entry) => !isWanted(entry)) : list.filter(([, entry]) => !isWanted(entry));
            if (kept.length !== list.length) {
                parsed.entries = isList ? kept : Object.fromEntries(kept);
                fs.writeFileSync(CACHE_FILE, JSON.stringify(parsed, null, 2), 'utf8');
            }
        }
    } catch (error) {
        console.debug(`Analysis cache file purge skipped (${error.message})`);
    }
    try {
        const list = [...wanted];
        for (let i = 0; i < list.length; i += 500) {
            await db.pool.promise().query(`DELETE FROM ${CACHE_TABLE} WHERE normalized_text IN (?)`, [list.slice(i, i + 500)]);
        }
    } catch (error) {
        // json mode never creates the table
        if (error.code !== 'ER_NO_SUCH_TABLE') console.debug(`Analysis cache table purge skipped (${error.message})`);
    }
    return removed;
}

module.exports.purgeTexts = purgeTexts;
// <Jun Kai end>
