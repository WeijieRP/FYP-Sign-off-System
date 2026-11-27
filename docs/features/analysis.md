# Feedback analysis (rules, BERT, Ollama)

**Owner:** Role 3, Jun Kai

**Where the code is**

- backend/features/analysis/cacheStore.js, flagged.js
- analysis routes still inside backend/features/admin/routes.js (analysis_modes, classifySentiment, feedback-insight-summary)
- frontend/admin/js/analysis.js

**What it does**

Classifies feedback as positive, neutral or negative with rules, the BERT model (@xenova/transformers, loaded on first use) or an Ollama model (phi3, qwen, gemma), caches results, flags inappropriate text and builds the insight report. When the Visitor Data Archive deletes feedback, cacheStore.purgeTexts removes the cached analyses of texts that no remaining feedback uses.

The Xenova, Qwen, Gemma and LocalGPT modes follow the Local AI models switch of the incident settings (`localAi` in backend/data/aiops-settings.json, 17 Nov 2026). Off: the page disables them with a note (refreshAnalysisModes in frontend/admin/js/analysis.js, run when Feedback Reports opens), and GET /feedback-insight-summary and GET /feedback-sentiment-analysis answer 409 before any analysis starts or any result is cached. Rule-Based Analysis always works.

**Routes** (from tests/contracts/routes.snapshot.txt)

| Method | Path | Registered in |
|---|---|---|
| GET | `/api/admin/feedback-analysis-cache-storage` | backend/features/admin/routes.js |
| PUT | `/api/admin/feedback-analysis-cache-storage` | backend/features/admin/routes.js |
| GET | `/api/admin/feedback-insight-summary` | backend/features/admin/routes.js |
| GET | `/api/admin/feedback-sentiment-analysis` | backend/features/admin/routes.js |
| GET | `/api/admin/flagged-feedback` | backend/features/admin/routes.js |
| POST | `/api/admin/translate` | backend/features/admin/routes.js |

**Task-sheet items for this feature**

- LLM health check (Ollama /api/tags); failures currently return "neutral" silently.

**Known issues (from the October 2026 review, line numbers refer to the layout before the restructure where noted)**

- /feedback-sentiment-analysis downloads a 164 MB model. It asks for a system admin sign-in since 19 Nov 2026, and no page calls it.
- Ollama calls fail to "neutral" with no sign in the admin page, and engine failures are cached as "neutral" forever (old 2426-2447).
- cacheStore never persists hit statistics and rewrites the whole JSON cache on every run with no pruning (cacheStore.js 404-473).
- pledgeSentiment retries a failed local-model load on every neutral pledge, before the feedback INSERT (pledgeSentiment.js 22, 70-75).

---
Generated from the route snapshot plus hand-written notes on 2026-10-31. Update this page when you change the feature.
