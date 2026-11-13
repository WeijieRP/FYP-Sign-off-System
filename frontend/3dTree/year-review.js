// Year Review for the 3D ESG Tree: the same corner button and flip-book as the 2D tree
// (frontend/tree/tree.js, "YEAR REVIEW BOOK"), with the same data from /api/tree/years and /api/tree.
// The button opens a small book of the tree's years. The arrows turn its pages, each showing the year,
// its number of leaves and a preview of the tree with one dot per leaf. "View Tree" switches the page
// heading to that year's review, and "Live" (or "View Live" on the current year) switches back.
// It runs on its own, so it works even while the 3D scene is still loading.

const element = id => document.getElementById(id);
const ui = {
  toggle: element('yearReviewToggle'),
  book: element('yearReviewBook'),
  live: element('bookLiveButton'),
  close: element('bookCloseButton'),
  prev: element('bookPrevButton'),
  next: element('bookNextButton'),
  view: element('bookViewButton'),
  year: element('bookYear'),
  count: element('bookCount'),
  preview: element('reviewTreePreview'),
  turnYear: element('bookTurnYear'),
};
const masthead = document.querySelector('.masthead');
const heading = masthead?.querySelector('h1');
const subtitle = masthead?.querySelector('.species');
const liveHeading = {
  title: heading?.textContent || 'ESG Tree',
  subtitleHtml: subtitle?.innerHTML || '',
  label: masthead?.getAttribute('aria-label') || '',
};
// The admin's 3D title box settings (tree3d-settings.js) change the live heading; "Live" restores that one.
document.addEventListener('esg-tree-title', event => Object.assign(liveHeading, event.detail));

const state = {
  currentYear: new Date().getFullYear(),
  selectedYear: new Date().getFullYear(),
  reviewYears: [],
  reviewIndex: 0,
  isReviewMode: false,
  isBookOpen: false,
  isBookFlipping: false,
  reviewLeafCount: 0,
};

// The same seeded random numbers as the 2D tree, so a year's dot preview looks the same on both pages.
function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let value = hashString(seed) || 1;
  return () => {
    value = Math.imul(1664525, value) + 1013904223;
    return (value >>> 0) / 4294967296;
  };
}

async function fetchYearReviewData() {
  try {
    const response = await fetch('/api/tree/years');
    const data = await response.json();

    state.currentYear = Number(data.currentYear) || new Date().getFullYear();
    state.selectedYear = state.isReviewMode ? state.selectedYear : state.currentYear;
    state.reviewYears = Array.isArray(data.years) ? data.years : [];

    if (!state.reviewYears.some(item => Number(item.year) === state.currentYear)) {
      state.reviewYears.unshift({ year: state.currentYear, leafCount: 0, isCurrentYear: true });
    }
    state.reviewYears.sort((a, b) => Number(b.year) - Number(a.year));

    // Keep the open page where it is when the list is refreshed.
    if (!state.isBookOpen) {
      const activeIndex = state.reviewYears.findIndex(item => Number(item.year) === state.selectedYear);
      state.reviewIndex = activeIndex >= 0 ? activeIndex : 0;
    } else {
      state.reviewIndex = Math.min(state.reviewIndex, state.reviewYears.length - 1);
    }
  } catch (error) {
    console.error('Error fetching tree year review data:', error);
    if (!state.reviewYears.length) {
      state.reviewYears = [{ year: state.currentYear, leafCount: 0, isCurrentYear: true }];
      state.reviewIndex = 0;
    }
  }
}

async function fetchLeafCount(year) {
  try {
    const response = await fetch(`/api/tree?year=${encodeURIComponent(year)}`);
    const data = await response.json();
    return Array.isArray(data) ? data.length : 0;
  } catch (error) {
    console.error('Error fetching visitor data:', error);
    return 0;
  }
}

function updateTreeHeading() {
  if (!heading) return;
  if (state.isReviewMode) {
    const count = state.reviewLeafCount;
    heading.textContent = `${state.selectedYear} ESG Tree Review`;
    if (subtitle) subtitle.textContent = `Completed yearly tree with ${count} contribution${count === 1 ? '' : 's'}`;
    masthead.setAttribute('aria-label', `ESG Centre, ${state.selectedYear} ESG Tree Review`);
  } else {
    heading.textContent = liveHeading.title;
    if (subtitle) subtitle.innerHTML = liveHeading.subtitleHtml;
    if (liveHeading.label) masthead.setAttribute('aria-label', liveHeading.label);
  }
  document.body.classList.toggle('year-review-mode', state.isReviewMode);
}

function renderYearReviewBook() {
  if (!ui.book || !ui.year || !ui.count || !ui.preview) return;

  const page = state.reviewYears[state.reviewIndex] || {
    year: state.currentYear,
    leafCount: 0,
    isCurrentYear: true,
  };
  const leafCount = Number(page.leafCount) || 0;

  ui.year.textContent = page.year;
  ui.count.textContent = `${leafCount} ${leafCount === 1 ? 'leaf' : 'leaves'}`;
  ui.preview.innerHTML = '';

  const dotCount = Math.min(leafCount, 90);
  for (let i = 0; i < dotCount; i++) {
    const dot = document.createElement('span');
    dot.className = 'review-leaf-dot';
    const random = createSeededRandom(`${page.year}|review-dot|${i}`);
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random());
    dot.style.left = `${50 + Math.cos(angle) * radius * 33}%`;
    dot.style.top = `${35 + Math.sin(angle) * radius * 22}%`;
    ui.preview.appendChild(dot);
  }

  if (ui.view) ui.view.textContent = Number(page.year) === state.currentYear ? 'View Live' : 'View Tree';
  if (ui.live) ui.live.classList.toggle('active', !state.isReviewMode);
}

function openYearReviewBook() {
  state.isBookOpen = true;
  ui.book?.classList.add('open');
  ui.book?.setAttribute('aria-hidden', 'false');
  ui.toggle?.classList.add('active');
  ui.toggle?.setAttribute('aria-expanded', 'true');
  // Fresh leaf counts each time the book is opened.
  fetchYearReviewData().then(renderYearReviewBook);
}

function closeYearReviewBook() {
  state.isBookOpen = false;
  ui.book?.classList.remove('open');
  ui.book?.setAttribute('aria-hidden', 'true');
  ui.toggle?.classList.remove('active');
  ui.toggle?.setAttribute('aria-expanded', 'false');
}

function toggleYearReviewBook() {
  if (state.isBookOpen) closeYearReviewBook();
  else openYearReviewBook();
}

function animateBookFlip(direction, nextPage) {
  if (!ui.book) return;
  ui.book.classList.remove('flip-forward', 'flip-back');
  state.isBookFlipping = true;
  if (ui.turnYear && nextPage) ui.turnYear.textContent = nextPage.year;
  void ui.book.offsetWidth; // restart the flip animation
  ui.book.classList.add(direction > 0 ? 'flip-forward' : 'flip-back');
  window.setTimeout(() => {
    ui.book?.classList.remove('flip-forward', 'flip-back');
    state.isBookFlipping = false;
  }, 720);
}

function turnReviewPage(direction) {
  if (!state.reviewYears.length || state.isBookFlipping) return;
  const nextIndex = (state.reviewIndex + direction + state.reviewYears.length) % state.reviewYears.length;
  animateBookFlip(direction, state.reviewYears[nextIndex]);
  window.setTimeout(() => {
    state.reviewIndex = nextIndex;
    renderYearReviewBook();
  }, 260);
}

async function viewReviewYear() {
  const page = state.reviewYears[state.reviewIndex];
  if (!page) return;
  state.selectedYear = Number(page.year) || state.currentYear;
  state.isReviewMode = state.selectedYear !== state.currentYear;
  state.reviewLeafCount = await fetchLeafCount(state.selectedYear);
  updateTreeHeading();
  renderYearReviewBook();
}

function viewLiveYear() {
  state.selectedYear = state.currentYear;
  state.isReviewMode = false;
  updateTreeHeading();
  renderYearReviewBook();
}

if (ui.toggle && ui.book) {
  ui.toggle.addEventListener('click', toggleYearReviewBook);
  ui.close?.addEventListener('click', closeYearReviewBook);
  ui.prev?.addEventListener('click', () => turnReviewPage(-1));
  ui.next?.addEventListener('click', () => turnReviewPage(1));
  ui.view?.addEventListener('click', viewReviewYear);
  ui.live?.addEventListener('click', viewLiveYear);

  fetchYearReviewData().then(renderYearReviewBook);
  // New feedback changes this year's leaf count; keep the book current like the 2D tree does.
  window.setInterval(() => fetchYearReviewData().then(renderYearReviewBook), 30000);
}
