// Owner: Role 2, Wei Jie. Previous team: Yu Kang (1).
// Part 19/30 of the admin page: digital tree management (load order in admin.html).
// ==================== 18. DIGITAL TREE MANAGEMENT ====================

// Load digital tree data
async function loadDigitalTreeData() {
    try {
        console.log('🌳 Loading digital tree data...');
        await loadTreeStageSelection();
        await loadAvailableTreeBackgrounds();
        const response = await fetch('/api/tree');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Tree API response:', data);
        
        updateDigitalTreeTable(data);
        
    } catch (error) {
        console.error('Error loading tree data:', error);
        updateDigitalTreeTable([]);
        alert('Error loading tree data: ' + error.message);
    }
}


async function getCurrentLeafCount() {
    try {
        const res = await fetch('/api/tree', { credentials: 'include' });
        const data = await res.json();
        console.log('📡 /api/tree response:', data);  // debug

        // If the response is an array, the leaf count is its length
        if (Array.isArray(data)) {
            return data.length;
        }
        // If it's an object with a leafCount property (fallback for other endpoints)
        if (data && typeof data === 'object' && data.leafCount !== undefined) {
            return data.leafCount;
        }
        // If it's an object with a 'count' or 'total' property (just in case)
        if (data && data.count !== undefined) return data.count;
        if (data && data.total !== undefined) return data.total;

        // Otherwise, try to guess: if it's an object with a 'visitors' array
        if (data && Array.isArray(data.visitors)) {
            return data.visitors.length;
        }

        console.warn('⚠️ Unexpected response format from /api/tree:', data);
        return 0;
    } catch (e) {
        console.warn('Could not get leaf count, using 0', e);
        return 0;
    }
}

function getStageFromLeafCount(leafCount, thresholds) {
    // thresholds = { stage1: min, stage2: min, stage3: min, stage4: min }
    if (leafCount >= thresholds.stage4) return 4;
    if (leafCount >= thresholds.stage3) return 3;
    if (leafCount >= thresholds.stage2) return 2;
    if (leafCount >= thresholds.stage1) return 1;
    return 0;
}

async function saveTreeParameters() {
    const setStatus = (msg, type) => {
        if (typeof setParameterStatus === 'function') setParameterStatus(msg, type);
        else console.log(`[${type}] ${msg}`);
    };
    try {
        setStatus('Saving tree parameters...', 'info');

        const showTitleBox = document.getElementById('param-showTitleBox').checked;
        const leafScaleSlider = document.getElementById('param-leafDisplayScale');
        const leafDisplayScale = leafScaleSlider ? parseFloat(leafScaleSlider.value) : 1.0;
        const treeDisplayMode = document.getElementById('param-treeDisplayMode')?.value === '3d' ? '3d' : '2d';

        // Get thresholds
        const thresholds = {
            stage1: parseInt(document.getElementById('threshold-stage1').value) || 0,
            stage2: parseInt(document.getElementById('threshold-stage2').value) || 0,
            stage3: parseInt(document.getElementById('threshold-stage3').value) || 0,
            stage4: parseInt(document.getElementById('threshold-stage4').value) || 0
        };

        // Determine which stage is currently active (manual or auto)
        const mode = document.querySelector('input[name="stageMode"]:checked')?.value;
        let treeStage;
        if (mode === 'manual') {
            treeStage = parseInt(document.getElementById('param-treeStage').value) || 0;
        } else {
            // Auto: get leaf count and compute stage
            const leafCount = await getCurrentLeafCount();
            treeStage = getStageFromLeafCount(leafCount, thresholds);
            // Update dropdown to match computed stage (for UI consistency)
            document.getElementById('param-treeStage').value = treeStage;
        }

        const payload = {
            treeStage,
            showTitleBox,
            leafDisplayScale,
            treeDisplayMode,
            leafThresholds: thresholds,   // save thresholds for later
            treeTitleBox: collectTreeTitleSettings()  // collect title box settings if needed
        };

        const response = await fetch('/api/admin/parameters/treeParameters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to save tree parameters');

        setStatus('Tree parameters saved.', 'success');
        showNotification('Tree display, leaf scale, and thresholds saved.', 'success');

        // Refresh the auto stage preview
        updateAutoStagePreview();
    } catch (error) {
        console.error('Error saving tree parameters:', error);
        setStatus(error.message || 'Failed to save tree parameters.', 'error');
        showNotification(error.message || 'Failed to save tree parameters.', 'error');
    }
}

let treeStageModeInitialized = false;
function initTreeStageMode() {
    const radioAuto = document.querySelector('input[value="auto"]');
    const radioManual = document.querySelector('input[value="manual"]');
    const manualSelect = document.getElementById('param-treeStage');
    const manualContainer = document.getElementById('manualStageContainer');
    if (treeStageModeInitialized || !radioAuto || !radioManual || !manualSelect || !manualContainer) return;
    treeStageModeInitialized = true;

    function updateMode() {
        const isAuto = radioAuto.checked;
        if (isAuto) {
            manualSelect.disabled = true;
            manualContainer.style.opacity = '0.6';
            // Automatically recompute stage from leaf count and thresholds
            updateAutoStagePreview();
        } else {
            manualSelect.disabled = false;
            manualContainer.style.opacity = '1';
        }
    }

    radioAuto.addEventListener('change', updateMode);
    radioManual.addEventListener('change', updateMode);
    updateMode();
}

async function updateAutoStagePreview() {
    const leafCountSpan = document.getElementById('currentLeafCount');
    const autoStageSpan = document.getElementById('autoStagePreview');
    if (!leafCountSpan || !autoStageSpan) return;

    const leafCount = await getCurrentLeafCount();
    leafCountSpan.textContent = leafCount;

    const thresholds = {
        stage1: parseInt(document.getElementById('threshold-stage1').value) || 0,
        stage2: parseInt(document.getElementById('threshold-stage2').value) || 0,
        stage3: parseInt(document.getElementById('threshold-stage3').value) || 0,
        stage4: parseInt(document.getElementById('threshold-stage4').value) || 0
    };
    const stage = getStageFromLeafCount(leafCount, thresholds);
    autoStageSpan.textContent = stage;

    // If in auto mode, also update the manual dropdown selection (for consistency)
    const isAuto = document.querySelector('input[name="stageMode"]:checked')?.value === 'auto';
    if (isAuto) {
        document.getElementById('param-treeStage').value = stage;
    }
}

// Add event listeners to threshold inputs
document.getElementById('threshold-stage1')?.addEventListener('input', updateAutoStagePreview);
document.getElementById('threshold-stage2')?.addEventListener('input', updateAutoStagePreview);
document.getElementById('threshold-stage3')?.addEventListener('input', updateAutoStagePreview);
document.getElementById('threshold-stage4')?.addEventListener('input', updateAutoStagePreview);



// Save tree parameters (stage, title box, leaf scale) - Done by Yu Kang
/*async function saveTreeParameters() {
    // Helper to show status messages (uses your existing setParameterStatus if available,
    // otherwise a fallback)
    const setStatus = (msg, type) => {
        if (typeof setParameterStatus === 'function') {
            setParameterStatus(msg, type);
        } else {
            console.log(`[${type}] ${msg}`);
            const statusEl = document.getElementById('tree-stage-status');
            if (statusEl) statusEl.textContent = msg;
        }
    };

    try {
        setStatus('Saving tree parameters...', 'info');

        // 1. Collect values from the UI
        const treeStageSelect = document.getElementById('param-treeStage');
        const showTitleBoxCheck = document.getElementById('param-showTitleBox');
        const leafScaleSlider = document.getElementById('param-leafDisplayScale');

        if (!treeStageSelect || !showTitleBoxCheck || !leafScaleSlider) {
            throw new Error('Required form elements not found on the page.');
        }

        const treeStage = Math.max(0, Math.min(4, Number(treeStageSelect.value) || 0));
        const showTitleBox = showTitleBoxCheck.checked;
        const leafDisplayScale = parseFloat(leafScaleSlider.value) || 1.0;
        const vipLeafScaleSlider = document.getElementById('param-vipLeafDisplayScale');
        const vipLeafDisplayScale = vipLeafScaleSlider ? parseFloat(vipLeafScaleSlider.value) || 1.0 : leafDisplayScale;

        // 2. Build payload (adjust field names to match your backend expectations)
        const payload = {
            treeStage: treeStage,
            showTitleBox: showTitleBox,
            leafDisplayScale: leafDisplayScale,
            vipLeafDisplayScale: vipLeafDisplayScale
        };

        // 3. Send to backend – use the same endpoint as saveTreeStageSelection
        //    but now with extra fields. Your backend should handle the extended payload.
        const response = await fetch('/api/admin/parameters/treeParameters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to save tree parameters');
        }

        // 4. Update UI feedback
        setStatus('Tree parameters saved successfully.', 'success');
        showNotification('Tree display and leaf settings saved.', 'success');

        // 5. Optionally refresh any live preview on the page
        //    (e.g., update leaf scale preview if it wasn't already using live input)
        const previewBox = document.getElementById('previewLeafBox');
        if (previewBox) {
            previewBox.style.transform = `scale(${leafDisplayScale})`;
        }
        const vipPreviewBox = document.getElementById('previewVipLeafBox');
        if (vipPreviewBox) {
            vipPreviewBox.style.transform = `scale(${vipLeafDisplayScale})`;
        }

    } catch (error) {
        console.error('Error saving tree parameters:', error);
        setStatus(error.message || 'Failed to save tree parameters.', 'error');
        showNotification(error.message || 'Failed to save tree parameters.', 'error');
    }
}*/

// Switch between tree management tabs
function switchTreeTab(tabId) {

    // Hide all contents
    document.querySelectorAll('.tree-tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Remove active from buttons
    document.querySelectorAll('.tree-tab').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabId).classList.add('active');

    // Activate clicked button
    event.currentTarget.classList.add('active');
}


async function loadTreeStageSelection() {
    const stageSelect = document.getElementById('param-treeStage');
    const stageStatus = document.getElementById('tree-stage-status');
    if (!stageSelect) return;

    try {
        const response = await fetch('/api/admin/parameters/treeParameters', {
            credentials: 'include'
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to load tree stage');
        }

        const treeParameters = data.parameters || {};
        const rawStage = Number(treeParameters.treeStage);
        const normalizedStage = Number.isInteger(rawStage) ? Math.max(0, Math.min(4, rawStage)) : 0;
        stageSelect.value = String(normalizedStage);
        const savedThresholds = treeParameters.leafThresholds || {};
        ['stage1', 'stage2', 'stage3', 'stage4'].forEach(key => {
            const input = document.getElementById('threshold-' + key);
            if (input && savedThresholds[key] !== undefined && savedThresholds[key] !== null) input.value = savedThresholds[key];
        });
        if (stageStatus) {
            stageStatus.textContent = `Current: stage ${normalizedStage}. Shown on /tree after apply.`;
        }
    } catch (error) {
        console.error('Error loading tree stage selection:', error);
        stageSelect.value = '0';
        if (stageStatus) {
            stageStatus.textContent = 'Unable to load saved stage. Using stage 0.';
        }
    }
}

async function saveTreeStageSelection() {
    const stageSelect = document.getElementById('param-treeStage');
    const stageStatus = document.getElementById('tree-stage-status');
    if (!stageSelect) return;

    const selectedStage = Math.max(0, Math.min(4, Number(stageSelect.value) || 0));

    try {
        if (stageStatus) {
            stageStatus.textContent = `Applying stage ${selectedStage}...`;
        }
        const response = await fetch('/api/admin/parameters/treeParameters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ treeStage: selectedStage })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to save tree stage');
        }

        if (stageStatus) {
            stageStatus.textContent = `Saved: stage ${selectedStage}. /tree now uses this stage.`;
        }
        showNotification(`Tree stage updated to stage ${selectedStage}.`, 'success');
    } catch (error) {
        console.error('Error saving tree stage selection:', error);
        if (stageStatus) {
            stageStatus.textContent = 'Failed to apply stage. Please try again.';
        }
        showNotification(error.message || 'Failed to save tree stage.', 'error');
    }
}


async function loadAvailableTreeBackgrounds() {
    try {
        const response = await fetch('/api/admin/parameters/tree-background/list', {
            credentials: 'include'
        });
        const data = await response.json();

        console.log('🎨 Tree backgrounds API response:', { response: { ok: response.ok, status: response.status }, data });

        const picker = document.getElementById('param-treeBackgroundList');
        const preview = document.getElementById('treeBackgroundPreview');
        const status = document.getElementById('tree-background-status');
        if (!picker) return;

        picker.innerHTML = '';
        window.selectedTreeBackground = '';

        if (!response.ok || !data.success) {
            const errorMsg = data.error || 'Failed to load tree backgrounds';
            console.error('❌ Tree backgrounds load failed:', errorMsg);
            throw new Error(errorMsg);
        }

        const currentTreeBackground = data.currentTreeBackground || '';
        if (preview && currentTreeBackground) {
            preview.style.backgroundImage = `url('${currentTreeBackground}')`;
        }

        const backgrounds = Array.isArray(data.backgroundImages) ? data.backgroundImages : [];
        console.log(`📂 Available tree backgrounds: ${backgrounds.length} images found`);
        
        if (backgrounds.length === 0) {
            picker.innerHTML = '<div style="grid-column:1 / -1;padding:16px;text-align:center;color:#64748b;">No background images found in /assets/Tree/background. Please add .png, .jpg, or .webp files to that directory.</div>';
            if (status) {
                status.textContent = 'No selectable tree backgrounds found. Add images to /assets/Tree/background/';
            }
            return;
        }

        backgrounds.forEach((background) => {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.dataset.backgroundFilename = background.filename;
            tile.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px;border:1px solid #d7dbe3;border-radius:8px;background:#f8fafc;cursor:pointer;transition:all 0.15s ease;text-align:center;';

            const thumb = document.createElement('div');
            thumb.style.cssText = `width:100%;height:84px;border-radius:6px;background:url('${background.path}') center/cover no-repeat;border:1px solid #e2e8f0;`;

            const label = document.createElement('span');
            label.textContent = background.name;
            label.style.cssText = 'font-size:12px;color:#1f2937;word-break:break-word;';

            tile.appendChild(thumb);
            tile.appendChild(label);

            tile.onclick = () => {
                picker.querySelectorAll('[data-selected="true"]').forEach((el) => {
                    el.dataset.selected = 'false';
                    el.style.borderColor = '#d7dbe3';
                    el.style.background = '#f8fafc';
                    el.style.boxShadow = 'none';
                });

                tile.dataset.selected = 'true';
                tile.style.borderColor = '#2563eb';
                tile.style.background = '#eff6ff';
                tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                window.selectedTreeBackground = background.filename;

                if (preview) {
                    preview.style.backgroundImage = `url('${background.path}')`;
                }
                if (status) {
                    status.textContent = `Selected: ${background.name}. Click Apply Background to save.`;
                }
                console.log('🎯 Selected background:', background.filename);
            };

            if (currentTreeBackground && currentTreeBackground.endsWith('/' + background.filename)) {
                tile.dataset.selected = 'true';
                tile.style.borderColor = '#2563eb';
                tile.style.background = '#eff6ff';
                tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                window.selectedTreeBackground = background.filename;
                if (status) {
                    status.textContent = `Current: ${background.name}.`;
                }
            }

            picker.appendChild(tile);
        });
    } catch (error) {
        console.error('❌ Error loading available tree backgrounds:', error);
        const status = document.getElementById('tree-background-status');
        if (status) {
            status.textContent = `Error: ${error.message || 'Failed to load tree backgrounds.'}`;
        }
    }
}

async function selectTreeBackground() {
    const selectedBackground = window.selectedTreeBackground;
    const status = document.getElementById('tree-background-status');

    if (!selectedBackground) {
        if (status) {
            status.textContent = 'Choose a background tile first.';
        }
        showNotification('Choose a tree background before applying.', 'error');
        console.warn('⚠️  No background selected');
        return;
    }

    try {
        if (status) {
            status.textContent = `Applying ${selectedBackground}...`;
        }
        console.log('🎨 Applying tree background:', selectedBackground);

        const response = await fetch('/api/admin/parameters/tree-background/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ treeBackground: selectedBackground })
        });

        const data = await response.json();
        console.log('📡 Tree background response:', { ok: response.ok, status: response.status, data });

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to apply tree background');
        }

        const applied = data.assetPath || '';
        const preview = document.getElementById('treeBackgroundPreview');
        if (preview && applied) {
            preview.style.backgroundImage = `url('${applied}')`;
        }
        if (status) {
            status.textContent = `✅ Applied: ${selectedBackground}. /tree now uses this background.`;
        }

        console.log('✅ Tree background applied successfully:', applied);
        showNotification('Tree background updated successfully.', 'success');
    } catch (error) {
        console.error('❌ Error applying tree background:', error);
        if (status) {
            status.textContent = `Error: ${error.message || 'Failed to apply tree background.'}`;
        }
        showNotification(error.message || 'Failed to apply tree background.', 'error');
    }
}

async function uploadTreeBackground() {
    const fileInput = document.getElementById('param-treeBackgroundUpload');
    const file = fileInput?.files?.[0];
    const status = document.getElementById('tree-background-status');
    
    if (!file) {
        if (status) status.textContent = 'Choose a background image first.';
        showNotification('Choose a background image first.', 'error');
        return;
    }

    try {
        if (status) status.textContent = 'Uploading background image...';
        const formData = new FormData();
        formData.append('background', file);

        const response = await fetch('/api/admin/parameters/tree-background/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to upload background image');
        }

        if (fileInput) fileInput.value = '';
        if (status) status.textContent = '✅ Background uploaded and applied.';
        showNotification('Tree background uploaded and applied successfully.', 'success');

        // Update the manual path field input under Visual Assets settings if it exists
        const manualInput = document.getElementById('param-treeBackground');
        if (manualInput && data.assetPath) {
            setInputValue('param-treeBackground', data.assetPath);
        }

        // Reload the backgrounds list to reflect the new background
        await loadAvailableTreeBackgrounds();
    } catch (error) {
        console.error('Error uploading tree background:', error);
        if (status) status.textContent = `Error: ${error.message || 'Failed to upload background image.'}`;
        showNotification(error.message || 'Failed to upload background image.', 'error');
    }
}

// Update the digital tree table
function updateDigitalTreeTable(treeData) {
    const tbody = document.querySelector('#digital-tree-page table tbody');
    if (!tbody) {
        console.error('Digital tree table tbody not found');
        return;
    }
    
    tbody.innerHTML = '';
    
    // Update current year display
    const currentYear = new Date().getFullYear();
    const currentYearSpan = document.getElementById('current-year');
    const treeCountSpan = document.getElementById('tree-count');
    
    if (currentYearSpan) {
        currentYearSpan.textContent = currentYear;
    }
    
    if (!treeData || treeData.length === 0) {
        if (treeCountSpan) {
            treeCountSpan.textContent = '0';
        }
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; padding: 40px; color: #64748b;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🌳</div>
                    <h3 style="color: #64748b; margin-bottom: 10px;">No Tree Data Found</h3>
                    <p>No visitors have been recorded for ${currentYear} yet.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    // Update tree count
    if (treeCountSpan) {
        treeCountSpan.textContent = treeData.length;
    }
    
    // Add each visitor to the table
    treeData.forEach(visitor => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${visitor.name || 'Anonymous'}</td>
            <td>${visitor.visit_count || 1}</td>
            <td>${visitor.last_visit ? new Date(visitor.last_visit).toLocaleDateString() : 'N/A'}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Leaf image management for digital tree parameters
async function uploadParameterLeaf() {
    const fileInput = document.getElementById('param-leafUpload');
    const file = fileInput?.files?.[0];
    if (!file) {
        setParameterStatus('Choose a leaf image first.', 'error');
        return;
    }

    try {
        setParameterStatus('Uploading leaf image...', 'info');
        const formData = new FormData();
        formData.append('leaf', file);

        const response = await fetch('/api/admin/parameters/leaf', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to upload leaf image');
        }

        // Update preview and parameter form
        populateParameterForm(data.parameters || {});
        if (fileInput) fileInput.value = '';
        setParameterStatus(data.message || 'Leaf image uploaded.', 'success');
    } catch (error) {
        console.error('Error uploading parameter leaf image:', error);
        setParameterStatus(error.message || 'Failed to upload leaf image.', 'error');
    }
}

async function uploadParameterVipLeaf() {
    const fileInput = document.getElementById('param-vipLeafUpload');
    const file = fileInput?.files?.[0];
    if (!file) {
        setParameterStatus('Choose a VIP leaf image first.', 'error');
        return;
    }

    try {
        setParameterStatus('Uploading VIP leaf image...', 'info');
        const formData = new FormData();
        formData.append('vipLeaf', file);

        const response = await fetch('/api/admin/parameters/vip-leaf', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to upload VIP leaf image');
        }

        populateParameterForm(data.parameters || {});
        if (fileInput) fileInput.value = '';
        setParameterStatus(data.message || 'VIP leaf image uploaded.', 'success');
    } catch (error) {
        console.error('Error uploading VIP leaf image:', error);
        setParameterStatus(error.message || 'Failed to upload VIP leaf image.', 'error');
    }
}

async function revertParameterLeaf() {
    try {
        setParameterStatus('Reverting to previous leaf image...', 'info');
        const response = await fetch('/api/admin/parameters/leaf/revert', {
            method: 'POST',
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to revert leaf image');
        }

        // Update preview and parameter form
        populateParameterForm(data.parameters || {});
        setParameterStatus(data.message || 'Leaf image reverted.', 'success');
    } catch (error) {
        console.error('Error reverting parameter leaf image:', error);
        setParameterStatus(error.message || 'Failed to revert leaf image.', 'error');
    }
}

async function revertParameterVipLeaf() {
    try {
        setParameterStatus('Reverting to previous VIP leaf image...', 'info');
        const response = await fetch('/api/admin/parameters/vip-leaf/revert', {
            method: 'POST',
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to revert VIP leaf image');
        }

        populateParameterForm(data.parameters || {});
        setParameterStatus(data.message || 'VIP leaf image reverted.', 'success');
    } catch (error) {
        console.error('Error reverting VIP leaf image:', error);
        setParameterStatus(error.message || 'Failed to revert VIP leaf image.', 'error');
    }
}

async function loadAvailableLeafImages(currentLeafImagePath = '') {
    try {
        console.log('📂 Loading available leaf images...');
        const response = await fetch('/api/admin/parameters/leaf/list', {
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Failed to load leaf images:', data.error);
            return;
        }

        const picker = document.getElementById('param-existingLeafList');
        const previewBox = document.getElementById('previewLeafBox');
        if (!picker) return;

        picker.innerHTML = '';
        window.selectedLeafImage = '';

        // Add leaf images as thumbnail tiles
        if (data.leafImages && data.leafImages.length > 0) {
            console.log(`✅ Found ${data.leafImages.length} leaf images`);
            data.leafImages.forEach(leaf => {
                const tile = document.createElement('button');
                tile.type = 'button';
                tile.dataset.leafFilename = leaf.filename;
                tile.dataset.leafPath = leaf.path;
                tile.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px;border:1px solid #d7dbe3;border-radius:8px;background:#f8fafc;cursor:pointer;transition:all 0.15s ease;text-align:center;';

                const img = document.createElement('img');
                img.src = leaf.path;
                img.alt = leaf.name;
                img.style.cssText = 'width:64px;height:64px;object-fit:contain;display:block;';

                const label = document.createElement('span');
                label.textContent = leaf.name;
                label.style.cssText = 'font-size:12px;color:#1f2937;word-break:break-word;';

                tile.appendChild(img);
                tile.appendChild(label);

                tile.onclick = () => {
                    picker.querySelectorAll('[data-selected="true"]').forEach(el => {
                        el.dataset.selected = 'false';
                        el.style.borderColor = '#d7dbe3';
                        el.style.background = '#f8fafc';
                        el.style.boxShadow = 'none';
                    });
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = '#2563eb';
                    tile.style.background = '#eff6ff';
                    tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                    window.selectedLeafImage = leaf.filename;
                    if (previewBox) {
                        previewBox.style.backgroundImage = `url('${leaf.path}')`;
                    }
                };

                if (currentLeafImagePath && (currentLeafImagePath.endsWith('/' + leaf.filename) || currentLeafImagePath.endsWith(leaf.filename))) {
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = '#2563eb';
                    tile.style.background = '#eff6ff';
                    tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                    window.selectedLeafImage = leaf.filename;
                }

                picker.appendChild(tile);
            });
        } else {
            picker.innerHTML = '<div style="grid-column:1 / -1;padding:16px;text-align:center;color:#64748b;">No existing leaf images found.</div>';
        }
    } catch (error) {
        console.error('Error loading available leaf images:', error);
    }
}

async function loadAvailableVipLeafImages(currentVipLeafImagePath = '') {
    try {
        console.log('📂 Loading available VIP leaf images...');
        const response = await fetch('/api/admin/parameters/vip-leaf/list', {
            credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Failed to load VIP leaf images:', data.error);
            return;
        }

        const picker = document.getElementById('param-existingVipLeafList');
        const previewBox = document.getElementById('previewVipLeafBox');
        if (!picker) return;

        picker.innerHTML = '';
        window.selectedVipLeafImage = '';

        const renderVipLeafTiles = (vipLeafImages) => {
            if (!Array.isArray(vipLeafImages) || vipLeafImages.length === 0) {
                picker.innerHTML = '<div style="grid-column:1 / -1;padding:16px;text-align:center;color:#64748b;">No existing VIP leaf images found.</div>';
                return;
            }

            vipLeafImages.forEach(leaf => {
                const tile = document.createElement('button');
                tile.type = 'button';
                tile.dataset.leafFilename = leaf.filename;
                tile.dataset.leafPath = leaf.path;
                tile.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px;border:1px solid #d7dbe3;border-radius:8px;background:#f8fafc;cursor:pointer;transition:all 0.15s ease;text-align:center;';

                const img = document.createElement('img');
                img.src = leaf.path;
                img.alt = leaf.name;
                img.style.cssText = 'width:64px;height:64px;object-fit:contain;display:block;';

                const label = document.createElement('span');
                label.textContent = leaf.name;
                label.style.cssText = 'font-size:12px;color:#1f2937;word-break:break-word;';

                tile.appendChild(img);
                tile.appendChild(label);

                tile.onclick = () => {
                    picker.querySelectorAll('[data-selected="true"]').forEach(el => {
                        el.dataset.selected = 'false';
                        el.style.borderColor = '#d7dbe3';
                        el.style.background = '#f8fafc';
                        el.style.boxShadow = 'none';
                    });
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = '#2563eb';
                    tile.style.background = '#eff6ff';
                    tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                    window.selectedVipLeafImage = leaf.filename;
                    if (previewBox) {
                        previewBox.style.backgroundImage = `url('${leaf.path}')`;
                    }
                };

                if (currentVipLeafImagePath && (currentVipLeafImagePath.endsWith('/' + leaf.filename) || currentVipLeafImagePath.endsWith(leaf.filename))) {
                    tile.dataset.selected = 'true';
                    tile.style.borderColor = '#2563eb';
                    tile.style.background = '#eff6ff';
                    tile.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.12)';
                    window.selectedVipLeafImage = leaf.filename;
                }

                picker.appendChild(tile);
            });
        };

        if (data.vipLeafImages && data.vipLeafImages.length > 0) {
            renderVipLeafTiles(data.vipLeafImages);
        } else {
            renderVipLeafTiles([
                { filename: 'GoldLeftLeaf.png', path: '/assets/Tree/vip-leaf/GoldLeftLeaf.png', name: 'GoldLeftLeaf' },
                { filename: 'GoldRightLeaf.png', path: '/assets/Tree/vip-leaf/GoldRightLeaf.png', name: 'GoldRightLeaf' }
            ]);
        }
    } catch (error) {
        console.error('Error loading available VIP leaf images:', error);
    }
}

async function selectParameterLeaf() {
    const leafImage = window.selectedLeafImage;

    if (!leafImage) {
        setParameterStatus('Choose a leaf image tile to apply.', 'error');
        return;
    }

    try {
        setParameterStatus('Applying leaf image...', 'info');
        const response = await fetch('/api/admin/parameters/leaf/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ leafImage })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to apply leaf image');
        }

        // Update preview and parameter form
        populateParameterForm(data.parameters || {});
        setParameterStatus(data.message || 'Leaf image applied.', 'success');
    } catch (error) {
        console.error('Error selecting parameter leaf image:', error);
        setParameterStatus(error.message || 'Failed to apply leaf image.', 'error');
    }
}

async function selectParameterVipLeaf() {
    const vipLeafImage = window.selectedVipLeafImage;

    if (!vipLeafImage) {
        setParameterStatus('Choose a VIP leaf image tile to apply.', 'error');
        return;
    }

    try {
        setParameterStatus('Applying VIP leaf image...', 'info');
        const response = await fetch('/api/admin/parameters/vip-leaf/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ vipLeafImage })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to apply VIP leaf image');
        }

        populateParameterForm(data.parameters || {});
        setParameterStatus(data.message || 'VIP leaf image applied.', 'success');
    } catch (error) {
        console.error('Error selecting VIP leaf image:', error);
        setParameterStatus(error.message || 'Failed to apply VIP leaf image.', 'error');
    }
}

// Refresh tree data
async function refreshTreeData() {
    await loadParameters();
    await loadDigitalTreeData();

    // Reload existing leaf images from the latest saved config
    await loadAvailableLeafImages(window.currentLeafImagePath || '');
    await loadAvailableVipLeafImages(window.currentVipLeafImagePath || '');
}


// Default values for tree title box settings
const TITLE_DEFAULTS = {
    showTitleBox: true,
    titleText: '🌳 ESG Digital Tree',
    subtitleText: 'Growing with every visitor\'s contribution this year',
    opacity: 0.25,
    blur: 6,
    radius: 25,
    position: 'top-center',
    paddingX: 30,
    paddingY: 15
};

function resetTreeTitleSettings(autoSave = true) {
    // Reset all input fields to default values
    document.getElementById('param-showTitleBox').checked = TITLE_DEFAULTS.showTitleBox;
    document.getElementById('param-titleText').value = TITLE_DEFAULTS.titleText;
    document.getElementById('param-subtitleText').value = TITLE_DEFAULTS.subtitleText;
    document.getElementById('param-titleOpacity').value = TITLE_DEFAULTS.opacity;
    document.getElementById('param-titleOpacityValue').textContent = TITLE_DEFAULTS.opacity;
    document.getElementById('param-titleBlur').value = TITLE_DEFAULTS.blur;
    document.getElementById('param-titleBlurValue').textContent = TITLE_DEFAULTS.blur + 'px';
    document.getElementById('param-titleRadius').value = TITLE_DEFAULTS.radius;
    document.getElementById('param-titleRadiusValue').textContent = TITLE_DEFAULTS.radius + 'px';
    document.getElementById('param-titlePosition').value = TITLE_DEFAULTS.position;
    document.getElementById('param-titlePaddingX').value = TITLE_DEFAULTS.paddingX;
    document.getElementById('param-titlePaddingY').value = TITLE_DEFAULTS.paddingY;

    // The live preview updates automatically via oninput events.

    // Optionally save immediately to persist the defaults on the server
    if (autoSave) {
        saveTreeTitleSettings();  // calls the existing save function
        showNotification('Title box settings reset to defaults and saved.', 'success');
    } else {
        showNotification('Title box settings reset to defaults. Click Save to persist.', 'info');
    }
}

// Collect tree title settings from the form
function collectTreeTitleSettings() {
    return {
        showTitleBox: document.getElementById('param-showTitleBox').checked,
        titleText: document.getElementById('param-titleText').value,
        subtitleText: document.getElementById('param-subtitleText').value,
        opacity: parseFloat(document.getElementById('param-titleOpacity').value),
        blur: parseInt(document.getElementById('param-titleBlur').value),
        radius: parseInt(document.getElementById('param-titleRadius').value),
        position: document.getElementById('param-titlePosition').value,
        paddingX: parseInt(document.getElementById('param-titlePaddingX').value),
        paddingY: parseInt(document.getElementById('param-titlePaddingY').value)
    };
}

// Save tree title settings
async function saveTreeTitleSettings() {
    await saveTreeParameters();
}

// Load tree title settings from the backend and populate the form
async function loadTreeTitleSettings() {
    const response = await fetch('/api/parameters');
    const data = await response.json();
    const tree = data.parameters?.treeParameters || {};
    const settings = tree.treeTitleBox;
    // treeDisplayMode is saved on treeParameters itself; reading it from the title box reset the select to 2D
    const displayModeSelect = document.getElementById('param-treeDisplayMode');
    if (displayModeSelect) displayModeSelect.value = (tree.treeDisplayMode || settings?.treeDisplayMode) === '3d' ? '3d' : '2d';
    // Show the settings of the tree that is live (admin/js/tree3d.js).
    if (displayModeSelect && typeof showTreeSettingsForMode === 'function') showTreeSettingsForMode(displayModeSelect.value);
    if (settings) {
        document.getElementById('param-showTitleBox').checked = settings.showTitleBox ?? true;
        document.getElementById('param-titleText').value = settings.titleText || '🌳 ESG Digital Tree';
        document.getElementById('param-subtitleText').value = settings.subtitleText || 'Growing with every visitor\'s contribution this year';
        document.getElementById('param-titleOpacity').value = settings.opacity ?? 0.25;
        document.getElementById('param-titleOpacityValue').textContent = settings.opacity ?? 0.25;
        document.getElementById('param-titleBlur').value = settings.blur ?? 6;
        document.getElementById('param-titleBlurValue').textContent = (settings.blur ?? 6) + 'px';
        document.getElementById('param-titleRadius').value = settings.radius ?? 25;
        document.getElementById('param-titleRadiusValue').textContent = (settings.radius ?? 25) + 'px';
        document.getElementById('param-titlePosition').value = settings.position || 'top-center';
        document.getElementById('param-titlePaddingX').value = settings.paddingX ?? 30;
        document.getElementById('param-titlePaddingY').value = settings.paddingY ?? 15;
    }
}
// Call when DOM is ready
document.addEventListener('DOMContentLoaded', loadTreeTitleSettings);

