// Owner: Role 3, Jun Kai. Previous team: none marked.
// Part 11/30 of the admin page: photo management (load order in admin.html).
// ==================== 10. PHOTO MANAGEMENT ====================

// View raw photo
async function viewRawPhoto(feedbackId) {
    showRawPhotoPopup(feedbackId);
}

// View processed photo
async function viewProcessedPhoto(feedbackId) {
    showProcessedPhotoPopup(feedbackId);
}

// <Jun Kai start> the raw and the processed photo open the same way: from the loaded row, or from the server when the
// row is not loaded. Messages show as notifications (no browser box).
function showPhotoOfKind(feedbackId, field, photoType) {
    const missing = `No ${photoType.toLowerCase()} photo available for this feedback`;
    const loaded = findLoadedFeedbackRow(feedbackId);
    if (loaded) {
        if (!loaded[field]) return showNotification(missing, 'info');
        return createPhotoPopup(feedbackId, loaded[field], photoType);
    }
    fetch('/api/admin/feedback')
        .then(response => response.json())
        .then(data => {
            if (!data.success) return showNotification('Could not load the photo information', 'error');
            const feedback = data.feedback.find(f => Number(f.id) === Number(feedbackId));
            if (!feedback) return showNotification('That feedback was not found', 'error');
            if (!feedback[field]) return showNotification(missing, 'info');
            createPhotoPopup(feedbackId, feedback[field], photoType);
        })
        .catch(error => {
            console.error('Error fetching feedback data:', error);
            showNotification('Could not load the photo information', 'error');
        });
}
// <Jun Kai end>

// Show raw photo in popup
function showRawPhotoPopup(feedbackId) {
    showPhotoOfKind(feedbackId, 'photo_path', 'Raw'); // <Jun Kai/>
}

// Show processed photo in popup
function showProcessedPhotoPopup(feedbackId) {
    showPhotoOfKind(feedbackId, 'processed_photo_path', 'Processed'); // <Jun Kai/>
}

// Generic function to create photo popup Same size for both raw and processed
function createPhotoPopup(feedbackId, photoPath, photoType) {
    // <Jun Kai start> the photo in a kit window: the picture, who opened it, and Download beside Close
    const photoUrl = '/uploads/' + String(photoPath).split('/').map(encodeURIComponent).join('/');
    const photoExt = (String(photoPath).match(/\.[a-z0-9]+$/i) || ['.jpg'])[0];
    const kind = photoType.toLowerCase();
    const { body, foot, status } = openKitViewer({ className: 'photo-popup', title: `${photoType} photo`, sub: `Feedback ${feedbackId}` });
    const figure = document.createElement('figure');
    figure.className = 'kit-photo';
    const img = document.createElement('img');
    img.alt = `${kind} photo for feedback ${feedbackId}`;
    img.addEventListener('error', () => handlePhotoError(img, feedbackId, kind), { once: true });
    img.src = photoUrl;
    figure.appendChild(img);
    const meta = document.createElement('p');
    meta.className = 'kit-viewer-meta';
    meta.textContent = `${photoType} photo, opened by ${sessionStorage.getItem('loggedUser') || 'you'} at ${new Date().toLocaleTimeString()}`;
    body.append(figure, meta);
    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'ui-btn ui-btn-primary';
    download.innerHTML = `${uiIcon('download', 16)}<span></span>`;
    download.querySelector('span').textContent = `Download ${kind} photo`;
    download.addEventListener('click', () => downloadPhoto(photoUrl, `feedback_${feedbackId}_${kind}_photo${photoExt}`, download, status));
    foot.appendChild(download);
    // <Jun Kai end>
}

// Handle photo loading errors
function handlePhotoError(imgElement, feedbackId, photoType = 'raw') {
    console.error(`Failed to load ${photoType} photo for feedback ID:`, feedbackId);
    // <Jun Kai start> a plain message where the picture would be
    const box = document.createElement('div');
    box.className = 'kit-photo-missing';
    const title = document.createElement('strong');
    title.textContent = `The ${photoType} photo could not be loaded`;
    const note = document.createElement('span');
    note.textContent = `Feedback ${feedbackId}. The file may have been deleted or moved.`;
    box.append(title, note);
    imgElement.replaceWith(box);
    // <Jun Kai end>
}

// Download photo function
// <Jun Kai start> button and status are given by the photo window: the button is off while the file comes, so a second
// click cannot start a second download, and a failure shows on the window's status line (a notification would sit
// under the window). The side panel calls it with the address and the file name only.
function downloadPhoto(photoUrl, filename, button = null, status = null) {
    if (button && button.disabled) return;
    if (button) button.disabled = true;
    if (status) { status.textContent = ''; status.classList.remove('is-error'); }
    fetch(photoUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('the photo was not found');
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            if (status) status.textContent = 'Downloaded';
        })
        .catch(error => {
            console.error('Download error:', error);
            const message = `Could not download the photo: ${error.message}`;
            if (status && status.isConnected) { status.textContent = message; status.classList.add('is-error'); }
            else showNotification(message, 'error');
        })
        .finally(() => { if (button) button.disabled = false; });
}
// <Jun Kai end>

// Close photo popup
function closePhotoPopup() {
    closeKitViewer(document.querySelector('dialog.photo-popup')); // <Jun Kai/>
}

