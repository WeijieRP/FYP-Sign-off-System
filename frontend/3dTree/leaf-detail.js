// A feedback leaf's details on the 3D ESG Tree, as on the 2D tree (frontend/tree/tree.js openLeafDetail):
// clicking a leaf opens the leaf detail card (3dTree.html #leafDetailCard) with the visitor's name (or
// "Anonymous visitor", as /api/tree gives it for privacy), whether the name is shown or hidden, their badge
// in its colour, the date and their pledge snippet. The card opens beside the clicked leaf, on the side
// with more room, and closes with its button, the Escape key, or a click away from the leaves
// (feedback-leaves.js decides which leaf was clicked).

// The badges' names, for a leaf whose /api/tree record has no badge name (2D: badgeLeafProfiles).
const BADGE_NAMES = {
  'feedback-completer': 'Feedback Contributor',
  'climate-champion': 'Climate Champion',
  'renewable-innovator': 'Renewable Innovator',
  'sustainable-living-advocate': 'Sustainable Living Advocate',
  'ocean-guardian': 'Ocean Guardian',
  'governance-guardian': 'Governance Guardian',
  'social-champion': 'Social Champion',
};

// As the 2D tree's formatLeafDate.
function formatLeafDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function createLeafDetail({ onClose } = {}) {
  const card = document.getElementById('leafDetailCard');
  const field = id => document.getElementById(id);
  let open = false;

  function close() {
    if (!card || !open) return;
    open = false;
    card.classList.remove('active');
    card.setAttribute('aria-hidden', 'true');
    onClose?.();
  }

  // Beside the leaf at (x, y) on the page: to its right when the leaf is on the left half, otherwise to its
  // left, kept on screen.
  function place(x, y) {
    const room = card.parentElement?.getBoundingClientRect() || { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const width = card.offsetWidth, height = card.offsetHeight;
    const gap = 36, margin = 16;
    const localX = x - room.left, localY = y - room.top;
    let left = localX < room.width / 2 ? localX + gap : localX - gap - width;
    left = Math.min(room.width - width - margin, Math.max(margin, left));
    const top = Math.min(room.height - height - margin, Math.max(margin, localY - height / 2));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  function show({ visitor, badgeColour, x, y }) {
    if (!card) return;
    const badgeKey = visitor?.badgeKey || 'feedback-completer';
    field('leafDetailPrivacy').textContent = visitor?.privacyLabel || 'Leaf details';
    field('leafDetailName').textContent = visitor?.name || 'Anonymous visitor';
    const badge = field('leafDetailBadge');
    badge.textContent = visitor?.badgeName || BADGE_NAMES[badgeKey] || 'Feedback Contributor';
    badge.style.setProperty('--leaf-detail-badge-color', badgeColour || visitor?.badgeColor || '#4a7c59');
    field('leafDetailDate').textContent = formatLeafDate(visitor?.created_at);
    field('leafDetailSnippet').textContent = visitor?.pledgeSnippet || 'No pledge snippet was shared for this leaf.';
    place(x, y);
    open = true;
    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
  }

  field('leafDetailClose')?.addEventListener('click', close);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

  return { show, close, isOpen: () => open };
}
