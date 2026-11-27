// Owner: Role 1, Zihan. Previous team: XY (Xuanyang) (5).
// ============================================================
// XY CHANGE SUMMARY (DONE BY XY)
// ============================================================
//
// 1. LOCAL AI PLEDGE SENTIMENT
//    detectPledgeSentimentRule      - Fast rule-based pledge sentiment fallback (DONE BY XY)
//    analyzeWithLocalAI             - Use local @xenova/transformers AI when rules are unclear (DONE BY XY)
//    analyzePledgeSentiment         - Approve positive/neutral pledges and queue negative/needs_review pledges (DONE BY XY)
//
// FIND COMMAND
//    rg -n "XY CHANGE SUMMARY|DONE BY XY" frontend backend
// ============================================================

const https = require('https');
const aiSettings = require('../aiSettings/store'); // <Jun Kai/> the AI Settings page

let localClassifier = null;

const POSITIVE_KEYWORDS = [
    'good', 'great', 'love', 'happy', 'help', 'improve', 'reduce',
    'recycle', 'save', 'support', 'protect', 'commit',
    'better', 'clean', 'sustainable', 'eco',
    'conserve', 'conservation', 'water', 'electricity', 'energy',
    'reuse', 'reusable', 'less', 'lower', 'cut down', 'avoid',
    'environment', 'green', 'responsible'
];

const NEGATIVE_KEYWORDS = [
    'bad', 'hate', 'angry', 'stupid', 'useless', 'terrible', 'awful',
    'worst', 'rubbish', 'trash', 'annoying', 'annoyed', 'dislike',
    'disappointed', 'disappointing', 'problem', 'broken', 'boring',
    'give up', 'cannot', "can't", 'never', 'not going', 'waste'
];

function countKeywordHits(text, keywords) {
    return keywords.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
}

function getModerationStatus(sentiment) {
    return sentiment === 'negative' || sentiment === 'needs_review' ? 'pending' : 'approved';
}

function detectPledgeSentimentRule(pledgeText) {
    const text = String(pledgeText || '').toLowerCase();
    if (!text.trim()) {
        return { sentiment: 'neutral', confidence: 1, source: 'rules' };
    }

    const negativeScore = countKeywordHits(text, NEGATIVE_KEYWORDS);
    const positiveScore = countKeywordHits(text, POSITIVE_KEYWORDS);

    if (negativeScore > positiveScore) {
        return { sentiment: 'negative', confidence: 0.8, source: 'rules' };
    }
    if (/\bi pledge to\b/.test(text) && negativeScore === 0) {
        return { sentiment: 'positive', confidence: 0.8, source: 'rules' };
    }
    if (positiveScore > 0) {
        return { sentiment: 'positive', confidence: 0.75, source: 'rules' };
    }
    return { sentiment: 'neutral', confidence: 0.45, source: 'rules' };
}

async function getLocalClassifier() {
    if (!localClassifier) {
        console.log('Loading local pledge sentiment model...');
        const { pipeline } = require('@xenova/transformers');
        localClassifier = await pipeline(
            'sentiment-analysis',
            'Xenova/bert-base-multilingual-uncased-sentiment'
        );
        console.log('Local pledge sentiment model loaded');
    }
    return localClassifier;
}

function mapLocalLabelToSentiment(label) {
    const normalized = String(label || '').toUpperCase();
    if (normalized.includes('1') || normalized.includes('2') || normalized === 'NEGATIVE') return 'negative';
    if (normalized.includes('4') || normalized.includes('5') || normalized === 'POSITIVE') return 'positive';
    return 'neutral';
}

async function analyzeWithLocalAI(pledgeText) {
    const model = await getLocalClassifier();
    const result = await model(String(pledgeText || '').slice(0, 512));
    const first = Array.isArray(result) ? result[0] : result;
    const sentiment = mapLocalLabelToSentiment(first?.label);
    return {
        sentiment,
        confidence: Number(first?.score || 0.65),
        source: 'local-ai'
    };
}

function requestJson(url, apiKey, payload) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const body = JSON.stringify(payload);
        const req = https.request({
            hostname: parsed.hostname,
            path: `${parsed.pathname}${parsed.search}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
            }
        }, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`Online AI returned HTTP ${res.statusCode}`));
                }
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(6000, () => req.destroy(new Error('Online AI request timed out')));
        req.write(body);
        req.end();
    });
}

function getOnlineAiConfig() {
    const provider = String(process.env.AI_SENTIMENT_PROVIDER || 'openai').toLowerCase();

    if (provider === 'groq') {
        return {
            provider,
            apiKey: process.env.GROQ_API_KEY || process.env.AI_SENTIMENT_API_KEY,
            url: process.env.AI_SENTIMENT_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
            model: process.env.AI_SENTIMENT_MODEL || 'llama-3.1-8b-instant'
        };
    }

    return {
        provider,
        apiKey: process.env.OPENAI_API_KEY || process.env.AI_SENTIMENT_API_KEY,
        url: process.env.AI_SENTIMENT_API_URL || 'https://api.openai.com/v1/chat/completions',
        model: process.env.AI_SENTIMENT_MODEL || 'gpt-4o-mini'
    };
}

function normalizeOnlineSentiment(value) {
    const text = String(value || '').toLowerCase();
    if (text.includes('needs_review')) return 'needs_review';
    if (text.includes('negative')) return 'negative';
    if (text.includes('positive')) return 'positive';
    if (text.includes('neutral')) return 'neutral';
    return 'needs_review';
}

async function analyzeWithOnlineAI(pledgeText) {
    const { provider, apiKey, url, model } = getOnlineAiConfig();
    if (!provider) return null;
    if (!apiKey) return null;

    const response = await requestJson(url, apiKey, {
        model,
        messages: [
            {
                role: 'system',
                content: 'Classify a sustainability pledge as positive, neutral, negative, or needs_review. Return only JSON like {"sentiment":"positive","confidence":0.9}.'
            },
            { role: 'user', content: String(pledgeText || '').slice(0, 1000) }
        ],
        temperature: 0,
        max_tokens: 40
    });

    const content = response?.choices?.[0]?.message?.content || '';
    let parsed = {};
    try {
        parsed = JSON.parse(content);
    } catch {
        parsed = { sentiment: content };
    }

    return {
        sentiment: normalizeOnlineSentiment(parsed.sentiment),
        confidence: Number(parsed.confidence || 0.75),
        source: `${provider}-online-ai`
    };
}

async function analyzePledgeSentiment(pledgeText) {
    const ruleResult = detectPledgeSentimentRule(pledgeText);
    // <Jun Kai/> the AI Settings page can switch the AI part off: then word rules only, nothing is sent online
    const mode = aiSettings.on('pledgeCheck') ? String(process.env.PLEDGE_SENTIMENT_MODE || 'hybrid').toLowerCase() : 'rules';

    if (!String(pledgeText || '').trim()) {
        return { ...ruleResult, moderationStatus: getModerationStatus(ruleResult.sentiment) };
    }

    if (mode === 'rules' || (mode === 'hybrid' && ruleResult.confidence >= 0.75)) {
        return { ...ruleResult, moderationStatus: getModerationStatus(ruleResult.sentiment) };
    }

    try {
        const onlineResult = mode === 'online' || mode === 'hybrid'
            ? await analyzeWithOnlineAI(pledgeText)
            : null;
        if (onlineResult) {
            return { ...onlineResult, moderationStatus: getModerationStatus(onlineResult.sentiment) };
        }
    } catch (error) {
        console.warn('Online pledge sentiment failed, trying local/rules fallback:', error.message);
    }

    try {
        if (mode === 'local' || mode === 'hybrid') {
            const localResult = await analyzeWithLocalAI(pledgeText);
            return { ...localResult, moderationStatus: getModerationStatus(localResult.sentiment) };
        }
    } catch (error) {
        console.warn('Local pledge sentiment failed, using rules fallback:', error.message);
    }

    return { ...ruleResult, moderationStatus: getModerationStatus(ruleResult.sentiment) };
}

module.exports = {
    analyzePledgeSentiment,
    detectPledgeSentimentRule,
    getModerationStatus
};
