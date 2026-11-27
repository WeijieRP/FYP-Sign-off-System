// Owner: Role 2, Wei Jie.
// Unit tests for the tree's automatic growth stage (shared by the 2D and 3D trees). Run: npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeTreeStageMode,
    normalizeLeafThresholds,
    stageForLeafCount,
    stageProgress,
    withAutoTreeStage
} = require('../../backend/features/parameters/treeStage');

const thresholds = { stage1: 1, stage2: 10, stage3: 25, stage4: 50 };

test('the stage follows the leaf count past each threshold', () => {
    assert.equal(stageForLeafCount(0, thresholds), 0);
    assert.equal(stageForLeafCount(1, thresholds), 1);
    assert.equal(stageForLeafCount(9, thresholds), 1);
    assert.equal(stageForLeafCount(10, thresholds), 2);
    assert.equal(stageForLeafCount(24, thresholds), 2);
    assert.equal(stageForLeafCount(25, thresholds), 3);
    assert.equal(stageForLeafCount(50, thresholds), 4);
    assert.equal(stageForLeafCount(500, thresholds), 4);
});

test('thresholds are whole numbers that never go down from one stage to the next', () => {
    assert.deepEqual(normalizeLeafThresholds({ stage1: '2', stage2: 8.6, stage3: -5, stage4: 'x' }),
        { stage1: 2, stage2: 9, stage3: 9, stage4: 50 });
    assert.deepEqual(normalizeLeafThresholds(undefined), thresholds);
});

test('the tree grows a little with every leaf between the stages, fully grown at stage 4', () => {
    assert.deepEqual(stageProgress(0, thresholds), { stage: 0, progress: 0 });
    assert.deepEqual(stageProgress(1, thresholds), { stage: 1, progress: 0 });
    assert.deepEqual(stageProgress(4, thresholds), { stage: 1, progress: 0.333 });
    assert.deepEqual(stageProgress(19, thresholds), { stage: 2, progress: 0.6 });
    assert.deepEqual(stageProgress(49, thresholds), { stage: 3, progress: 0.96 });
    assert.deepEqual(stageProgress(50, thresholds), { stage: 4, progress: 1 });
    assert.deepEqual(stageProgress(500, thresholds), { stage: 4, progress: 1 });
    // A higher number for a full tree spreads the same growth over more leaves.
    assert.deepEqual(stageProgress(60, { ...thresholds, stage4: 100 }), { stage: 3, progress: 0.467 });
    // Stage 0 grows towards stage 1's number when that is more than one leaf.
    assert.deepEqual(stageProgress(2, { ...thresholds, stage1: 5 }), { stage: 0, progress: 0.4 });
});

test('only "auto" turns automatic growth on', () => {
    assert.equal(normalizeTreeStageMode('auto'), 'auto');
    assert.equal(normalizeTreeStageMode('manual'), 'manual');
    assert.equal(normalizeTreeStageMode(undefined), 'manual');
    assert.equal(normalizeTreeStageMode('AUTO'), 'manual');
});

test('in Auto the trees are told the stage for the leaf count now', async () => {
    const parameters = { treeParameters: { treeStage: 1, treeStageMode: 'auto', leafThresholds: thresholds, leafFallThreshold: 13 }, other: { a: 1 } };
    const shown = await withAutoTreeStage(parameters, async () => 12);
    assert.equal(shown.treeParameters.treeStage, 2);
    assert.deepEqual(shown.treeParameters.treeStageAuto, { leafCount: 12, stage: 2, progress: 0.133 });
    assert.equal(shown.treeParameters.leafFallThreshold, 13);
    assert.deepEqual(shown.other, { a: 1 });
    assert.equal(parameters.treeParameters.treeStage, 1, 'the saved settings are not changed');
});

test('in Manual, or when the leaves cannot be counted, the saved stage stays', async () => {
    const manual = { treeParameters: { treeStage: 3, treeStageMode: 'manual', leafThresholds: thresholds } };
    assert.equal((await withAutoTreeStage(manual, async () => 100)).treeParameters.treeStage, 3);
    const noMode = { treeParameters: { treeStage: 3 } };
    assert.equal((await withAutoTreeStage(noMode, async () => 100)).treeParameters.treeStage, 3);
    const auto = { treeParameters: { treeStage: 3, treeStageMode: 'auto', leafThresholds: thresholds } };
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        const shown = await withAutoTreeStage(auto, async () => { throw new Error('database offline'); });
        assert.equal(shown.treeParameters.treeStage, 3);
    } finally {
        console.warn = originalWarn;
    }
});
