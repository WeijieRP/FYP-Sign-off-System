// Owner: Role 1, Zihan. Previous team: none marked.
// Part 15/30 of the admin page: question management (load order in admin.html).
// ==================== 14. QUESTION MANAGEMENT ====================

// <Jun Kai start> Questions in the new look (admin redesign, Questions B). Messages show on the line under the title
// instead of alert boxes, and Add and Edit open as cards inside the list.
let questionsPageReady = false;

function prepareQuestionsPage() {
    if (questionsPageReady) return;
    questionsPageReady = true;
    document.querySelectorAll('#questions-page [data-fb-icon]').forEach((slot) => {
        slot.innerHTML = uiIcon(slot.dataset.fbIcon, slot.closest('.ui-info-btn') ? 15 : 16);
    });
    // the preview follows every key press and choice in the Add and Edit cards
    const pageEl = document.getElementById('questions-page');
    pageEl.addEventListener('input', renderQuestionPreview);
    pageEl.addEventListener('change', renderQuestionPreview);
    // an option marked empty loses its red edge as soon as something is typed in it
    pageEl.addEventListener('input', (event) => {
        if (event.target.getAttribute('aria-invalid') === 'true' && event.target.value.trim()) event.target.removeAttribute('aria-invalid');
    });
}

function setQuestionStatus(type, message) {
    const el = document.getElementById('questions-status');
    if (!el) return;
    if (!message) { el.innerHTML = ''; return; }
    const tone = type === 'success' ? 'ok' : type === 'error' ? 'down' : 'info';
    el.innerHTML = uiPill(tone, message);
}

// escapeHtmlSafe comes from vips.js, which loads after this file, so it is only called when the page is used
function questionsEscape(value) {
    return escapeHtmlSafe(value === null || value === undefined ? '' : String(value));
}

function questionOptionsHtml(options) {
    if (!options || options.length === 0) return '';
    return `<ol class="qs-option-list">${options.map((option, index) => `
        <li><span class="qs-option-num">${index + 1}</span><span>${questionsEscape(option.option_label)}</span></li>`).join('')}
    </ol>`;
}

function questionRowHtml(question) {
    const id = Number(question.id);
    const text = questionsEscape(question.question_text);
    const options = question.question_type === 'choice' ? question.options || [] : [];
    return `
        <article class="ui-card qs-row${question.is_active ? '' : ' is-off'}" data-question-id="${id}">
            <div class="qs-row-main">
                <span class="qs-num" title="Display order">${questionsEscape(question.display_order)}</span>
                <div class="qs-body">
                    <div class="qs-text">${text}</div>
                    <div class="qs-tags">
                        <span class="ui-tag is-blue">${questionsEscape(formatQuestionType(question.question_type))}</span>
                        ${question.is_required ? '<span class="ui-tag is-green">Required</span>' : '<span class="ui-tag">Optional</span>'}
                    </div>
                </div>
                <div class="qs-side">
                    ${question.is_active ? uiPill('ok', 'Active') : uiPill('muted', 'Inactive')}
                    <button type="button" class="ui-btn ui-btn-icon" onclick="editQuestionById(${id})" aria-label="Edit: ${text}" title="Edit">${uiIcon('edit', 16)}</button>
                    <button type="button" class="ui-btn ui-btn-icon ui-danger" onclick="deleteQuestion(${id})" aria-label="Delete: ${text}" title="Delete">${uiIcon('trash', 16)}</button>
                </div>
            </div>
            ${options.length ? `<div class="qs-options"><div class="qs-options-title">Options</div>${questionOptionsHtml(options)}</div>` : ''}
            <div class="qs-edit-slot"></div>
        </article>`;
}

// One card is open at a time: Add or one Edit. A card with typed changes stays open and says why, so a list reload
// or another card never wipes what was typed.
function questionEditIsDirty() {
    const form = document.getElementById('edit-question-form');
    const saved = form && window.questionsDataMap.get(Number(form.dataset.questionId));
    if (!saved) return false;
    return document.getElementById('edit-question-text').value !== String(saved.question_text ?? '')
        || (parseInt(document.getElementById('edit-display-order').value) || 0) !== (Number(saved.display_order) || 0)
        || (document.getElementById('edit-is-required').value === '1') !== Boolean(saved.is_required)
        || document.getElementById('edit-is-active').checked !== Boolean(saved.is_active);
}

function questionAddIsDirty() {
    if (!document.getElementById('add-question-form')) return false;
    return document.getElementById('question-text').value.trim() !== ''
        || document.getElementById('question-type').value !== ''
        || [...document.querySelectorAll('#options-list input[type="text"]')].some((input) => input.value.trim() !== '');
}

function showQuestionCardHint(errorId, fieldId, message) {
    const errorDiv = document.getElementById(errorId);
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    // the card can be far below the button that was pressed, so its message is brought into view
    document.getElementById(fieldId).focus({ preventScroll: true });
    errorDiv.scrollIntoView({ block: 'center' });
}

// true when an open card with changes has to be finished first; action is what the admin tried, like "editing another question"
function questionCardBlocks(action) {
    if (questionEditIsDirty()) {
        showQuestionCardHint('edit-question-error', 'edit-question-text', `Save or cancel the question you are editing before ${action}.`);
        return true;
    }
    if (questionAddIsDirty()) {
        showQuestionCardHint('question-error', 'question-text', `Add or cancel the new question before ${action}.`);
        return true;
    }
    return false;
}
// <Jun Kai end>

// Load question management data
async function loadQuestionManagementData() {
    prepareQuestionsPage(); // <Jun Kai/>
    try {
        console.log('❓ Loading question management data...');
        const response = await fetch('/api/admin/questions?includeInactive=1');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Question API response:', data);
        
        if (data.success) {
            updateQuestionManagementTable(data.questions);
            setQuestionStatus('', ''); // <Jun Kai/> a good load clears an old message
            return true; // <Jun Kai/>
        } else {
            console.error('Failed to load question data:', data.error);
            setQuestionStatus('error', 'Could not load the questions: ' + (data.error || 'unknown error')); // <Jun Kai/>
        }
    } catch (error) {
        console.error('Error loading question data:', error);
        // <Jun Kai start>
        setQuestionStatus('error', 'Could not reach the server to load the questions. Check that the server is running.');
        const container = document.getElementById('questions-container');
        if (container && !window.questionsDataMap.size) container.innerHTML = '<div class="ui-card qs-empty">The questions could not be loaded.</div>';
        // <Jun Kai end>
    }
    return false; // <Jun Kai/>
}

// Update question management table
function updateQuestionManagementTable(questionsData) {
    const container = document.getElementById('questions-container');
    if (!container) {
        console.error('Questions container not found');
        return;
    }
    
    // <Jun Kai start> an open Edit card is carried across the redraw (coming back to the page, or a delete of another
    // question) together with what was typed in it
    const openEdit = document.getElementById('edit-question-form');
    const carried = openEdit ? {
        id: Number(openEdit.dataset.questionId),
        text: document.getElementById('edit-question-text').value,
        order: document.getElementById('edit-display-order').value,
        required: document.getElementById('edit-is-required').value,
        active: document.getElementById('edit-is-active').checked,
        focused: openEdit.contains(document.activeElement),
        scroll: document.scrollingElement.scrollTop
    } : null;

    // the map is filled first, so an empty list also clears the old questions
    window.questionsDataMap.clear();
    (questionsData || []).forEach((question) => window.questionsDataMap.set(question.id, question));
    
    if (!questionsData || questionsData.length === 0) {
        container.innerHTML = `
            <div class="ui-card qs-empty">
                <strong>No questions yet</strong>
                <p>Add the first question to start collecting feedback.</p>
                <button class="ui-btn ui-btn-primary" type="button" onclick="showAddQuestionModal()">${uiIcon('plus', 16)}Add the first question</button>
            </div>`;
        renderQuestionPreview();
        return;
    }
    
    container.innerHTML = questionsData.map(questionRowHtml).join('');
    if (carried && window.questionsDataMap.has(carried.id)) {
        editQuestionById(carried.id);
        document.getElementById('edit-question-text').value = carried.text;
        document.getElementById('edit-display-order').value = carried.order;
        document.getElementById('edit-is-required').value = carried.required;
        document.getElementById('edit-is-active').checked = carried.active;
        if (!carried.focused) document.activeElement.blur();
        document.scrollingElement.scrollTop = carried.scroll;
    }
    renderQuestionPreview();
    // <Jun Kai end>
}

// Format question type for display
function formatQuestionType(type) {
    const typeMap = {
        'text': 'Text Input',
        'yesno': 'Yes/No',
        'rating': 'Rating (1-5)',
        'choice': 'Multiple Choice'
    };
    return typeMap[type] || type;
}

// Show add question modal
function showAddQuestionModal() {
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'system_admin') {
        setQuestionStatus('error', 'Only a system admin can add questions.'); // <Jun Kai/>
        return;
    }
    
    // <Jun Kai start> the new question opens as a card above the list (its own slot, so a list reload keeps it)
    const slot = document.getElementById('questions-new-slot');
    if (!slot) return;
    if (document.getElementById('add-question-form')) {
        document.getElementById('question-text').focus();
        return;
    }
    if (questionCardBlocks('adding a new question')) return;
    closeEditQuestionModal();
    const orders = [...window.questionsDataMap.values()].map((question) => Number(question.display_order) || 0);
    const nextOrder = orders.length ? Math.max(...orders) + 1 : 1;
    slot.innerHTML = `
        <section class="ui-card qs-row qs-new" aria-labelledby="qs-new-title">
            <form id="add-question-form" class="qs-form" onsubmit="handleAddQuestion(event)" novalidate>
                <h3 id="qs-new-title" class="qs-form-title">New question</h3>
                <div class="ui-field">
                    <label class="ui-label" for="question-text">Question text</label>
                    <textarea id="question-text" class="ui-input qs-textarea" rows="3" placeholder="Type the question visitors will see" required></textarea>
                </div>
                <div class="qs-form-grid">
                    <div class="ui-field">
                        <label class="ui-label" for="question-type">Question type</label>
                        <select id="question-type" class="ui-select" onchange="toggleOptionsField(this.value)" required>
                            <option value="">Choose a type</option>
                            <option value="text">Text Input</option>
                            <option value="yesno">Yes/No</option>
                            <option value="rating">Rating (1-5)</option>
                            <option value="choice">Multiple Choice</option>
                        </select>
                    </div>
                    <div class="ui-field">
                        <label class="ui-label" for="display-order">Display order</label>
                        <input type="number" id="display-order" class="ui-input" value="${nextOrder}" min="0">
                        <span class="ui-help">Visitors see this number in front of the question.</span>
                    </div>
                    <div class="ui-field">
                        <label class="ui-label" for="is-required">Required</label>
                        <select id="is-required" class="ui-select">
                            <option value="1">Yes, visitors must answer it</option>
                            <option value="0" selected>No, visitors may skip it</option>
                        </select>
                    </div>
                    <div class="ui-field">
                        <span class="ui-label">Active</span>
                        <label class="qs-switch-row" for="question-is-active">
                            <span class="ui-switch"><input type="checkbox" id="question-is-active" checked><span class="ui-switch-track"></span></span>
                            <span>Show on the feedback form</span>
                        </label>
                    </div>
                </div>
                <div id="options-container" style="display: none;">
                    <div class="ui-field">
                        <span class="ui-label">Options</span>
                        <div id="options-list" class="qs-option-inputs"></div>
                        <div><button type="button" class="ui-btn ui-btn-secondary" onclick="addOptionField()">${uiIcon('plus', 16)}Add option</button></div>
                    </div>
                </div>
                <div id="question-error" class="qs-error" role="alert" style="display: none;"></div>
                <div class="qs-form-actions">
                    <button type="button" class="ui-btn ui-btn-secondary" onclick="closeAddQuestionModal()">Cancel</button>
                    <button type="submit" class="ui-btn ui-btn-primary">Add question</button>
                </div>
            </form>
        </section>`;
    document.getElementById('question-text').focus();
    renderQuestionPreview();
    // <Jun Kai end>
}

// Close add question modal
function closeAddQuestionModal() {
    const slot = document.getElementById('questions-new-slot'); // <Jun Kai/> the new question card above the list
    if (slot) slot.innerHTML = ''; // <Jun Kai/>
    renderQuestionPreview(); // <Jun Kai/>
    if (document.getElementById('questions-page').classList.contains('active')) {
        return loadQuestionManagementData(); // <Jun Kai/> true once the list is loaded again
    }
}

// Toggle options field based on question type
function toggleOptionsField(questionType) {
    const optionsContainer = document.getElementById('options-container');
    const optionsList = document.getElementById('options-list');
    
    if (questionType === 'choice') {
        optionsContainer.style.display = 'block';
        if (optionsList.children.length === 0) {
            addOptionField();
        }
    } else {
        optionsContainer.style.display = 'none';
        optionsList.innerHTML = '';
    }
}

// Add option field
function addOptionField() {
    const optionsList = document.getElementById('options-list');
    
    // <Jun Kai start> one option row in the kit look; its order starts one past the highest order already typed
    const orders = [...optionsList.querySelectorAll('.qs-option-order')].map((input) => parseInt(input.value) || 0);
    const nextOrder = orders.length ? Math.max(...orders) + 1 : 1;
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option-input-group qs-option-input';
    optionDiv.innerHTML = `
        <input type="text" class="ui-input" placeholder="Option label" aria-label="Option label" required>
        <input type="number" class="ui-input qs-option-order" placeholder="Order" value="${nextOrder}" min="0" aria-label="Option order">
        <button type="button" class="ui-btn ui-btn-icon ui-danger" onclick="removeOptionField(this)" aria-label="Remove option" title="Remove">${uiIcon('trash', 16)}</button>
    `;
    // <Jun Kai end>
    
    optionsList.appendChild(optionDiv);
    optionDiv.querySelector('input').focus(); // <Jun Kai/>
}

// Remove option field
function removeOptionField(button) {
    const optionGroup = button.parentElement;
    optionGroup.remove();
    renderQuestionPreview(); // <Jun Kai/>
}

// Handle add question
async function handleAddQuestion(event) {
    event.preventDefault();
    
    const questionText = document.getElementById('question-text').value;
    const questionType = document.getElementById('question-type').value;
    const displayOrder = parseInt(document.getElementById('display-order').value) || 0;
    const isRequired = document.getElementById('is-required').value === '1';
    const isActive = document.getElementById('question-is-active').checked;
    const errorDiv = document.getElementById('question-error');
    
    errorDiv.style.display = 'none';
    
    if (!questionText.trim()) {
        errorDiv.textContent = 'Question text is required';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (!questionType) {
        errorDiv.textContent = 'Please select a question type';
        errorDiv.style.display = 'block';
        return;
    }
    
    let options = [];
    
    if (questionType === 'choice') {
        const optionInputs = document.querySelectorAll('#options-list .option-input-group');
        if (optionInputs.length === 0) {
            errorDiv.textContent = 'At least one option is required for multiple choice questions';
            errorDiv.style.display = 'block';
            return;
        }
        
        // <Jun Kai start> an option row with no label is an error instead of being skipped, and the orders are
        // numbered 1, 2, 3 again in the order chosen, so two options never share a number
        const rows = [...optionInputs].map((group, index) => ({
            labelInput: group.querySelector('input[type="text"]'),
            order: parseInt(group.querySelector('input[type="number"]').value) || 0,
            index
        }));
        rows.forEach((row) => {
            if (row.labelInput.value.trim()) row.labelInput.removeAttribute('aria-invalid');
            else row.labelInput.setAttribute('aria-invalid', 'true');
        });
        const emptyRow = rows.find((row) => !row.labelInput.value.trim());
        if (emptyRow) {
            errorDiv.textContent = `Option ${emptyRow.index + 1} has no label. Type one or remove that row.`;
            errorDiv.style.display = 'block';
            emptyRow.labelInput.focus();
            return;
        }
        rows.sort((a, b) => a.order - b.order || a.index - b.index).forEach((row, position) => {
            options.push({ option_label: row.labelInput.value.trim(), display_order: position + 1 });
        });
        // <Jun Kai end>
        
        if (options.length === 0) {
            errorDiv.textContent = 'At least one valid option is required for multiple choice questions';
            errorDiv.style.display = 'block';
            return;
        }
    }
    
    const username = sessionStorage.getItem('loggedUser');
    if (!username) {
        errorDiv.textContent = 'User session not found. Please login again.';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch('/api/admin/questions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-username': username
            },
            body: JSON.stringify({
                question_text: questionText,
                question_type: questionType,
                display_order: displayOrder,
                is_required: isRequired,
                is_active: isActive,
                options: options
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (await closeAddQuestionModal()) setQuestionStatus('success', 'Question added.'); // <Jun Kai/> after the reload
        } else {
            errorDiv.textContent = data.error || 'Failed to add question';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error adding question:', error);
        errorDiv.textContent = 'Error adding question: ' + error.message;
        errorDiv.style.display = 'block';
    }
}


function editQuestionById(questionId) {
    const question = window.questionsDataMap.get(questionId);
    if (!question) {
        console.error('Question not found:', questionId);
        setQuestionStatus('error', 'This question was not found. Open the page again to reload the list.'); // <Jun Kai/>
        return;
    }
    
    editQuestion(
        question.id,
        question.question_text,
        question.question_type,
        question.is_required,
        question.display_order,
        question.is_active,
        question.options || []
    );
}

// Edit question modal
function editQuestion(questionId, currentQuestionText, questionType, isRequired, displayOrder, isActive, options) {
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'system_admin') {
        setQuestionStatus('error', 'Only a system admin can change questions.'); // <Jun Kai/>
        return;
    }
    
    // <Jun Kai start> the edit card opens under the question's own row; one question is edited at a time.
    // The type and the options stay fixed, so old answers keep their meaning (the options show once, in the row).
    const id = Number(questionId);
    const open = document.getElementById('edit-question-form');
    if (open && Number(open.dataset.questionId) === id) {
        document.getElementById('edit-question-text').focus();
        return;
    }
    if (questionCardBlocks('editing another question')) return;
    closeEditQuestionModal();
    const newSlot = document.getElementById('questions-new-slot');
    if (newSlot) newSlot.innerHTML = '';
    const row = document.querySelector(`#questions-container .qs-row[data-question-id="${id}"]`);
    const slot = row && row.querySelector('.qs-edit-slot');
    if (!slot) return;
    row.classList.add('is-editing');
    slot.innerHTML = `
        <form id="edit-question-form" class="qs-form" data-question-id="${id}" onsubmit="handleEditQuestion(event, ${id})" novalidate>
            <div class="ui-field">
                <label class="ui-label" for="edit-question-text">Question text</label>
                <textarea id="edit-question-text" class="ui-input qs-textarea" rows="3" placeholder="Type the question visitors will see" required>${questionsEscape(currentQuestionText)}</textarea>
            </div>
            <div class="qs-form-grid">
                <div class="ui-field">
                    <span class="ui-label">Question type</span>
                    <div class="qs-fixed"><span class="ui-tag is-blue">${questionsEscape(formatQuestionType(questionType))}</span></div>
                    <span class="ui-help">${questionType === 'choice' && options && options.length
                        ? 'The type and the options (listed above) cannot be changed, so old answers keep their meaning.'
                        : 'The type cannot be changed, so old answers keep their meaning.'}</span>
                </div>
                <div class="ui-field">
                    <label class="ui-label" for="edit-display-order">Display order</label>
                    <input type="number" id="edit-display-order" class="ui-input" value="${Number(displayOrder) || 0}" min="0">
                    <span class="ui-help">Visitors see this number in front of the question.</span>
                </div>
                <div class="ui-field">
                    <label class="ui-label" for="edit-is-required">Required</label>
                    <select id="edit-is-required" class="ui-select">
                        <option value="1"${isRequired ? ' selected' : ''}>Yes, visitors must answer it</option>
                        <option value="0"${isRequired ? '' : ' selected'}>No, visitors may skip it</option>
                    </select>
                </div>
                <div class="ui-field">
                    <span class="ui-label">Active</span>
                    <label class="qs-switch-row" for="edit-is-active">
                        <span class="ui-switch"><input type="checkbox" id="edit-is-active"${isActive ? ' checked' : ''}><span class="ui-switch-track"></span></span>
                        <span>Show on the feedback form</span>
                    </label>
                </div>
            </div>
            <p class="ui-help qs-note">Old answers keep the question as it was. A change only applies to new answers.</p>
            <div id="edit-question-error" class="qs-error" role="alert" style="display: none;"></div>
            <div class="qs-form-actions">
                <button type="button" class="ui-btn ui-btn-secondary" onclick="closeEditQuestionModal()">Cancel</button>
                <button type="submit" class="ui-btn ui-btn-primary">Save changes</button>
            </div>
        </form>`;
    const textBox = document.getElementById('edit-question-text');
    textBox.focus();
    textBox.setSelectionRange(textBox.value.length, textBox.value.length);
    renderQuestionPreview();
    // <Jun Kai end>
}

// Handle edit question
async function handleEditQuestion(event, questionId) {
    event.preventDefault();
    
    const questionText = document.getElementById('edit-question-text').value;
    const displayOrder = parseInt(document.getElementById('edit-display-order').value) || 0;
    const isRequired = document.getElementById('edit-is-required').value === '1';
    const isActive = document.getElementById('edit-is-active').checked;
    const errorDiv = document.getElementById('edit-question-error');
    
    errorDiv.style.display = 'none';
    
    if (!questionText.trim()) {
        errorDiv.textContent = 'Question text is required';
        errorDiv.style.display = 'block';
        return;
    }
    
    const username = sessionStorage.getItem('loggedUser');
    if (!username) {
        errorDiv.textContent = 'User session not found. Please login again.';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/questions/${questionId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-username': username
            },
            body: JSON.stringify({
                question_text: questionText,
                display_order: displayOrder,
                is_required: isRequired,
                is_active: isActive
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeEditQuestionModal();
            if (await loadQuestionManagementData()) setQuestionStatus('success', 'Question saved. Old answers keep the question as it was.'); // <Jun Kai/> after the reload
        } else {
            errorDiv.textContent = data.error || 'Failed to update question';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Error updating question:', error);
        errorDiv.textContent = 'Error updating question: ' + error.message;
        errorDiv.style.display = 'block';
    }
}

// Close edit question modal
function closeEditQuestionModal() {
    // <Jun Kai start> closes the edit card inside the list
    const form = document.getElementById('edit-question-form');
    if (!form) return;
    const row = form.closest('.qs-row');
    if (row) row.classList.remove('is-editing');
    form.parentElement.innerHTML = '';
    renderQuestionPreview();
    // <Jun Kai end>
}

// Delete question
async function deleteQuestion(questionId) {
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'system_admin') {
        setQuestionStatus('error', 'Only a system admin can delete questions.'); // <Jun Kai/>
        return;
    }
    // <Jun Kai start> the list is drawn again after a delete, so changes typed into another question come first
    const editing = document.getElementById('edit-question-form');
    if (editing && Number(editing.dataset.questionId) !== Number(questionId) && questionEditIsDirty()) {
        showQuestionCardHint('edit-question-error', 'edit-question-text', 'Save or cancel the question you are editing before deleting another question.');
        return;
    }
    // <Jun Kai end>
    
    if (await uiConfirm({ title: 'Delete this question?', message: 'If visitors already answered it, it is turned off instead, so their answers are kept.', confirmText: 'Delete', danger: true })) { // <Jun Kai/> a kit window instead of the browser's box
        try {
            const username = sessionStorage.getItem('loggedUser');
            if (!username) {
                setQuestionStatus('error', 'Your sign in was not found. Please sign in again.'); // <Jun Kai/>
                return;
            }
            
            const response = await fetch(`/api/admin/questions/${questionId}`, {
                method: 'DELETE',
                headers: {
                    'x-username': username
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                // <Jun Kai start> a question with answers is only turned off by the server; the message comes after the reload
                const turnedOff = /deactivated/i.test(data.message || '');
                if (await loadQuestionManagementData()) {
                    setQuestionStatus(turnedOff ? 'info' : 'success', turnedOff
                        ? 'The question already has answers, so it was turned off instead of deleted. Its answers are kept.'
                        : 'Question deleted.');
                }
                // <Jun Kai end>
            } else {
                setQuestionStatus('error', 'The question was not deleted: ' + (data.error || 'unknown error')); // <Jun Kai/>
            }
        } catch (error) {
            console.error('Error deleting question:', error);
            setQuestionStatus('error', 'The question was not deleted: ' + error.message); // <Jun Kai/>
        }
    }
}

// <Jun Kai start> The live preview (new feature): the feedback form drawn the way the kiosk draws it
// (frontend/feedback/js/questions.js), from the saved questions plus what is typed in the open Add or Edit card.
// Like the kiosk: only active questions, in display order, the display order is the number in front, a star marks
// a required question, and a choice question with no options shows no answers. All text is set with textContent.
function readQuestionDraftOptions() {
    const options = [];
    document.querySelectorAll('#options-list .option-input-group').forEach((group, index) => {
        const label = group.querySelector('input[type="text"]').value.trim();
        if (label) options.push({ option_label: label, display_order: parseInt(group.querySelector('input[type="number"]').value) || 0, index });
    });
    return options.sort((a, b) => a.display_order - b.display_order || a.index - b.index);
}

function collectPreviewQuestions() {
    const list = [...window.questionsDataMap.values()].map((question) => ({ ...question, draft: false }));
    const edit = document.getElementById('edit-question-form');
    if (edit) {
        const i = list.findIndex((question) => Number(question.id) === Number(edit.dataset.questionId));
        if (i >= 0) {
            list[i] = { ...list[i], draft: true,
                question_text: document.getElementById('edit-question-text').value,
                display_order: parseInt(document.getElementById('edit-display-order').value) || 0,
                is_required: document.getElementById('edit-is-required').value === '1',
                is_active: document.getElementById('edit-is-active').checked };
        }
    }
    if (document.getElementById('add-question-form')) {
        const type = document.getElementById('question-type').value;
        list.push({ id: 'new', draft: true,
            question_text: document.getElementById('question-text').value,
            question_type: type,
            display_order: parseInt(document.getElementById('display-order').value) || 0,
            is_required: document.getElementById('is-required').value === '1',
            is_active: document.getElementById('question-is-active').checked,
            options: type === 'choice' ? readQuestionDraftOptions() : [] });
    }
    // the same order as the kiosk: display order first, then the order the questions were added
    return list.map((question, index) => ({ question, index }))
        .sort((a, b) => (Number(a.question.display_order) || 0) - (Number(b.question.display_order) || 0) || a.index - b.index)
        .map((entry) => entry.question);
}

function previewEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function previewChoices(labels, row) {
    const box = previewEl('div', row ? 'qs-k-choices is-row' : 'qs-k-choices');
    labels.forEach((label) => {
        const choice = previewEl('div', 'qs-k-choice');
        choice.append(previewEl('span', 'qs-k-radio'), previewEl('span', '', label));
        box.appendChild(choice);
    });
    return box;
}

function previewQuestionEl(question) {
    const group = previewEl('div', question.draft ? 'qs-k-q is-draft' : 'qs-k-q');
    const text = String(question.question_text || '').trim();
    const label = previewEl('div', 'qs-k-label', `${Number(question.display_order) || 0}. `);
    label.appendChild(text ? document.createTextNode(text) : previewEl('span', 'qs-k-empty', 'Type the question'));
    if (question.is_required) label.appendChild(document.createTextNode(' *'));
    group.appendChild(label);
    if (question.question_type === 'rating') {
        const buttons = previewEl('div', 'qs-k-rating');
        [1, 2, 3, 4, 5].forEach((n) => buttons.appendChild(previewEl('span', 'qs-k-rate', String(n))));
        group.appendChild(buttons);
    } else if (question.question_type === 'yesno') {
        group.appendChild(previewChoices(['Yes', 'No'], true));
    } else if (question.question_type === 'choice') {
        if (question.options && question.options.length) group.appendChild(previewChoices(question.options.map((option) => option.option_label), false));
    } else {
        group.appendChild(previewEl('div', 'qs-k-text', 'Type your answer here...'));
    }
    return group;
}

function renderQuestionPreview() {
    const box = document.getElementById('questions-preview');
    if (!box) return;
    const questions = collectPreviewQuestions();
    const shown = questions.filter((question) => question.is_active);
    box.replaceChildren(...(shown.length ? shown.map(previewQuestionEl) : [previewEl('div', 'qs-k-none', 'No questions are shown. Visitors see "No Questions Available".')]));

    const note = document.getElementById('questions-preview-note');
    const hiddenDraft = questions.find((question) => question.draft && !question.is_active);
    note.hidden = !hiddenDraft;
    note.textContent = hiddenDraft ? 'The question you are editing is turned off, so visitors do not see it.' : '';

    // keeps the question being typed in visible inside the tablet screen
    const screen = document.getElementById('questions-preview-screen');
    const draftEl = box.querySelector('.qs-k-q.is-draft');
    if (screen && draftEl) {
        const top = draftEl.offsetTop; // the screen is the offset parent (position: relative)
        if (top < screen.scrollTop || top + draftEl.offsetHeight > screen.scrollTop + screen.clientHeight) {
            screen.scrollTop = Math.max(0, top - 16);
        }
    }
}
// <Jun Kai end>
