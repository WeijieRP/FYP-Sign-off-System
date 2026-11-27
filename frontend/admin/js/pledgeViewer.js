// Owner: Role 3, Jun Kai. Previous team: Caeden (1).
// Part 9/30 of the admin page: pledge and content viewing (load order in admin.html).
// ==================== 9. PLEDGE & CONTENT VIEWING ====================

// Translate visitor-entered pledge or feedback answers to English for admin review (Done by Caeden)
async function translateAdminTextToEnglish(sourceId, outputId, button) {
    const source = document.getElementById(sourceId);
    const output = document.getElementById(outputId);
    const text = source?.textContent?.trim() || '';

    if (!text) {
        if (output) output.textContent = 'No text to translate.';
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = 'Translating...';
    }

    try {
        const response = await fetch('/api/admin/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ text })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Translation failed');
        }

        if (output) {
            output.textContent = data.translatedText || text;
            output.style.display = 'block';
        }
    } catch (error) {
        console.error('Translation error:', error);
        if (output) {
            output.textContent = error.message || 'Translation unavailable.';
            output.style.display = 'block';
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'Translate to English';
        }
    }
}

// <Jun Kai start> One kit window (a native <dialog>, va-dialog look) for the photo, pledge, answer and insight viewers.
// Escape and the close buttons close it (a click outside does not, so a double click or a text selection dragged out
// cannot close it by mistake), and the focus goes back to where it was. The old class name (photo-popup, pledge-popup, qa-popup) stays on the window, so the Feedback side panel can tell that a
// viewer is open and lets the first Escape close the viewer only.
function openKitViewer({ className, title, sub = '', wide = false }) {
    document.querySelectorAll(`dialog.${className}`).forEach((old) => old.remove());
    const opener = document.activeElement;
    const id = `${className}-${Date.now()}`;
    const dialog = document.createElement('dialog');
    dialog.className = `va-dialog kit-viewer${wide ? ' kit-viewer-wide' : ''} ${className}`;
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.innerHTML = `<div class="va-dialog-inner">
        <div class="va-dialog-head">
            <div><h3 id="${id}-title"></h3><div class="va-dialog-sub"></div></div>
            <button type="button" class="ui-btn ui-btn-icon va-dialog-close" data-kit-close aria-label="Close" title="Close">${uiIcon('close', 18)}</button>
        </div>
        <div class="va-dialog-body"></div>
        <div class="va-dialog-foot"><span class="kit-viewer-status" role="status" aria-live="polite"></span><button type="button" class="ui-btn ui-btn-secondary" data-kit-close>Close</button></div>
    </div>`;
    dialog.querySelector('h3').textContent = title;
    const subLine = dialog.querySelector('.va-dialog-sub');
    if (sub) subLine.textContent = sub;
    else subLine.remove();
    const close = () => closeKitViewer(dialog);
    dialog.querySelectorAll('[data-kit-close]').forEach((button) => button.addEventListener('click', close));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => {
        dialog.remove();
        if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    return { dialog, body: dialog.querySelector('.va-dialog-body'), foot: dialog.querySelector('.va-dialog-foot'), status: dialog.querySelector('.kit-viewer-status') };
}

function closeKitViewer(dialog) {
    if (!dialog || !dialog.isConnected || dialog.classList.contains('is-closing')) return;
    const done = () => { if (dialog.open) dialog.close(); else dialog.remove(); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    dialog.classList.add('is-closing');
    setTimeout(done, 150);
}

// a "Translate to English" button under a visitor's text, when the AI settings allow it
function kitTranslateButton(sourceId, outputId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-btn ui-btn-secondary kit-viewer-translate';
    button.textContent = 'Translate to English';
    button.addEventListener('click', () => translateAdminTextToEnglish(sourceId, outputId, button));
    const output = document.createElement('div');
    output.id = outputId;
    output.className = 'admin-translation-result';
    output.style.display = 'none';
    return [button, output];
}

function kitViewedLine() {
    const line = document.createElement('p');
    line.className = 'kit-viewer-meta';
    line.textContent = `Viewed by ${sessionStorage.getItem('loggedUser') || 'you'} at ${new Date().toLocaleTimeString()}`;
    return line;
}
// <Jun Kai end>

// View pledge
function viewPledge(feedbackId, pledgeText) {
    if (pledgeText === undefined) {
        const row = findLoadedFeedbackRow(feedbackId);
        pledgeText = row ? (row.pledge || '') : '';
    }
    // <Jun Kai start> the pledge in a kit window, as plain text
    const pledgeSourceId = `pledge-source-${feedbackId}`;
    const pledgeTranslationId = `pledge-translation-${feedbackId}`;
    const { body } = openKitViewer({ className: 'pledge-popup', title: 'Pledge', sub: `Feedback ${feedbackId}` });
    const text = document.createElement('div');
    text.id = pledgeSourceId;
    text.className = 'kit-viewer-text';
    text.textContent = pledgeText || 'No pledge text available';
    if (!pledgeText) text.classList.add('is-empty');
    body.appendChild(text);
    if (pledgeText && adminAiAllows('translate')) body.append(...kitTranslateButton(pledgeSourceId, pledgeTranslationId));
    body.appendChild(kitViewedLine());
    // <Jun Kai end>
}

// Close pledge popup
function closePledgePopup() {
    closeKitViewer(document.querySelector('dialog.pledge-popup')); // <Jun Kai/>
}

// View question answers
function viewQuestionAnswers(feedbackId) {
    const row = findLoadedFeedbackRow(feedbackId);
    if (!row) {
        showNotification('That feedback is not in the loaded table. Refresh the page and try again.', 'error'); // <Jun Kai/>
        return;
    }
    createQuestionAnswersPopup(feedbackId, row.question_answers || []);
}

// The feedback and archive lists already carry question_answers, photo paths and the pledge
function findLoadedFeedbackRow(feedbackId) {
    const rows = [].concat(
        typeof allFeedbackData !== 'undefined' ? allFeedbackData : [],
        typeof allArchiveData !== 'undefined' ? allArchiveData : []
    );
    return rows.find(f => Number(f.id) === Number(feedbackId)) || null;
}

// Create Q&A popup
function createQuestionAnswersPopup(feedbackId, answers) {
    // <Jun Kai start> every question and its answer in a kit window, as plain text
    const { body } = openKitViewer({ className: 'qa-popup', title: 'Questions and answers', sub: `Feedback ${feedbackId}` });
    if (!answers || !answers.length) {
        const empty = document.createElement('p');
        empty.className = 'kit-viewer-empty';
        empty.textContent = 'No question answers available';
        body.appendChild(empty);
    } else {
        const list = document.createElement('ol');
        list.className = 'kit-qa';
        answers.forEach((answer, index) => {
            const item = document.createElement('li');
            const question = document.createElement('p');
            question.className = 'kit-qa-q';
            question.textContent = answer.question_text || `Question ${index + 1}`;
            const answerId = `qa-answer-${feedbackId}-${index}`;
            const reply = document.createElement('div');
            reply.id = answerId;
            reply.className = 'kit-qa-a';
            const shown = formatAnswerText(answer.option_label || answer.answer_value, answer.question_type);
            reply.textContent = shown || 'No answer provided';
            if (!shown) reply.classList.add('is-empty');
            item.append(question, reply);
            if (shown && adminAiAllows('translate')) item.append(...kitTranslateButton(answerId, `qa-translation-${feedbackId}-${index}`));
            list.appendChild(item);
        });
        body.appendChild(list);
    }
    body.appendChild(kitViewedLine());
    // <Jun Kai end>
}

// Format answer based on question type
// (escaped HTML: the Feedback and Archive side panel puts it into its markup)
function formatAnswer(answer, questionType) {
    if (!answer) return '<em>No answer provided</em>';
    const safeAnswer = escapeHtmlSafe(answer);
    
    switch(questionType) {
        case 'rating':
            const rating = parseInt(answer) || 0;
            // Display as number 1-5
            if (rating >= 1 && rating <= 5) {
                return `Rating: ${rating}/5`;
            } else {
                return `Rating: ${rating}`;
            }
        case 'yesno':
            return ['1', 'yes', 'true'].includes(String(answer).trim().toLowerCase()) ? 'Yes' : 'No';
        case 'choice':
            return safeAnswer;
        default:
            return safeAnswer;
    }
}

// <Jun Kai start> the same reading as plain text, only for textContent (the answers window); '' when there is no answer
function formatAnswerText(answer, questionType) {
    if (!answer) return '';
    if (questionType === 'rating') {
        const rating = parseInt(answer) || 0;
        return rating >= 1 && rating <= 5 ? `Rating: ${rating}/5` : `Rating: ${rating}`;
    }
    if (questionType === 'yesno') return ['1', 'yes', 'true'].includes(String(answer).trim().toLowerCase()) ? 'Yes' : 'No';
    return String(answer);
}
// <Jun Kai end>

// Close Q&A popup
function closeQAPopup() {
    closeKitViewer(document.querySelector('dialog.qa-popup')); // <Jun Kai/>
}

