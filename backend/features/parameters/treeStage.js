// Owner: Role 2, Wei Jie.
// The tree's growth stage (0 bare trunk to 4 full canopy), shared by the 2D and 3D trees.
// treeParameters keeps:
//   treeStage      - the stage chosen by hand (Manual), or the last one worked out (Auto)
//   treeStageMode  - 'auto' (grows by itself with the leaf count) or 'manual'; saved by the admin's 2D Tree
//                    Display and 3D Tree Growth Stage panels; without it the saved stage is used, as before
//   leafThresholds - { stage1, stage2, stage3, stage4 }: the fewest leaves for each stage in Auto
// In Auto the public GET /api/parameters (server.js and kioskServer.js) reports the stage for the tree's
// leaf count now, so both trees grow by themselves as feedback comes in: past stage 2's threshold, stage 2.
// It also reports how far the tree is from this stage's threshold to the next (treeStageAuto.progress, 0 to
// 1), so the 3D tree can grow a little with every leaf between the stages (frontend/3dTree/tree-growth.js),
// until it is fully grown at stage 4's threshold.

const DEFAULT_LEAF_THRESHOLDS = Object.freeze({ stage1: 1, stage2: 10, stage3: 25, stage4: 50 });

function normalizeTreeStageMode(mode) {
    return mode === 'auto' ? 'auto' : 'manual';
}

// Whole numbers of at least 0, each stage needing at least as many leaves as the one before.
function normalizeLeafThresholds(thresholds) {
    const result = {};
    let previous = 0;
    for (const key of ['stage1', 'stage2', 'stage3', 'stage4']) {
        const raw = Number(thresholds?.[key]);
        const value = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : DEFAULT_LEAF_THRESHOLDS[key];
        previous = Math.max(previous, value);
        result[key] = previous;
    }
    return result;
}

// The same rule as the admin's getStageFromLeafCount (frontend/admin/js/tree.js).
function stageForLeafCount(leafCount, thresholds) {
    const t = normalizeLeafThresholds(thresholds);
    const count = Math.max(0, Number(leafCount) || 0);
    if (count >= t.stage4) return 4;
    if (count >= t.stage3) return 3;
    if (count >= t.stage2) return 2;
    if (count >= t.stage1) return 1;
    return 0;
}

// How far the tree has grown through its stage: 0 at this stage's threshold, nearly 1 just before the next
// stage's, and 1 at stage 4 (fully grown). For example 19 leaves with thresholds 10 and 25: stage 2, 0.6.
function stageProgress(leafCount, thresholds) {
    const t = normalizeLeafThresholds(thresholds);
    const count = Math.max(0, Number(leafCount) || 0);
    const stage = stageForLeafCount(count, t);
    if (stage >= 4) return { stage, progress: 1 };
    const from = stage === 0 ? 0 : t[`stage${stage}`];
    const to = t[`stage${stage + 1}`];
    const progress = to > from ? Math.min(1, Math.max(0, (count - from) / (to - from))) : 1;
    return { stage, progress: Math.round(progress * 1000) / 1000 };
}

// The parameters as the trees should see them: in Auto, treeStage is the stage for the leaf count now
// (countLeaves resolves it), with treeStageAuto { leafCount, stage, progress } alongside. If the leaves
// cannot be counted, the saved stage stays.
async function withAutoTreeStage(parameters, countLeaves) {
    const tree = parameters?.treeParameters;
    if (!tree || normalizeTreeStageMode(tree.treeStageMode) !== 'auto') return parameters;
    try {
        const leafCount = await countLeaves();
        const { stage, progress } = stageProgress(leafCount, tree.leafThresholds);
        return {
            ...parameters,
            treeParameters: { ...tree, treeStage: stage, treeStageAuto: { leafCount, stage, progress } }
        };
    } catch (error) {
        console.warn('Automatic tree stage unavailable; using the saved stage:', error.message);
        return parameters;
    }
}

module.exports = {
    DEFAULT_LEAF_THRESHOLDS,
    normalizeTreeStageMode,
    normalizeLeafThresholds,
    stageForLeafCount,
    stageProgress,
    withAutoTreeStage
};
