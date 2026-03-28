/* ============================================================
   MANDY Renderer Process
   ============================================================ */

'use strict';

// ---- Globals ----
let cfg = {};
let chatHistories = {};  // Separate from config — loaded/saved independently
let currentFile = null;
let currentContent = '';
let findMatches = [];
let findIndex = 0;
let liveReload = true;
let viewMode = 'preview';       // 'preview' | 'split' | 'edit'
let hasUnsavedChanges = false;
let previewUpdateTimer = null;
let _previewHtmlDirty = false;  // Set when preview DOM changes, cleared on HTML snapshot

// ---- Chat state ----
let chatMessages = [];   // { role: 'user'|'assistant'|'error'|'approval', content?: string }[]
let chatStreaming = false;
let chatStreamContent = '';
let activeConversationByDoc = {};
let chatContextFilesByDoc = {};
let chatSuggestReqId = 0;
let chatPathSuggestIndex = -1;
let chatSessionAutoApprove = false;
let chatQueuedPrompts = [];
let chatPaused = false;
let chatPromptHistory = [];
let chatPromptHistoryIndex = -1;
let chatPromptDraft = '';
let draggedTabId = null;
const chatApprovalExpanded = new Set();
let chatSessionDocKey = null;
const chatMarkdownCache = new Map();
const chatMarkdownInFlight = new Set();

// ---- Tab state ----
let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let tabBarScrollToEndPending = false;

// ---- Localisation ----
const LOCALES = window.MANDY_LOCALES || {};

let currentLang = 'en';
let loadedFolderName = null; // null = no folder open yet
let loadedFolderPath = null;

function t(key) {
  return (LOCALES[currentLang] || LOCALES.en)[key] ?? LOCALES.en[key] ?? key;
}

function tf(key, vars = {}) {
  let out = String(t(key));
  Object.keys(vars || {}).forEach(k => {
    out = out.replaceAll(`{${k}}`, String(vars[k]));
  });
  return out;
}

function applyTranslations() {
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  $$('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  $$('[data-i18n-aria-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
  syncChatInputPlaceholder();
}

function refreshDynamicText() {
  if (!loadedFolderName) dom.folderName.textContent = t('hdr.noFolder');
  const activeTab = tabs.find(tab => tab.id === activeTabId);
  if (activeTab && activeTab.content && cfg.showWordCount !== false) {
    if (activeTab._wordCountCached == null) activeTab._wordCountCached = countWords(activeTab.content);
    const words = activeTab._wordCountCached;
    dom.docStats.words.textContent = `${words.toLocaleString()} ${t('words')}`;
    dom.docStats.read.textContent  = `~${Math.max(1, Math.round(words / 200))} ${t('minRead')}`;
    dom.docStats.chars.textContent = `${activeTab.content.length.toLocaleString()} ${t('chars')}`;
  }
}

function updateRefreshFolderButtonState() {
  if (!dom.refreshFolderBtn) return;
  dom.refreshFolderBtn.disabled = !loadedFolderPath;
}

function updateNewFolderFileButtonState() {
  if (!dom.newFolderFileBtn) return;
  dom.newFolderFileBtn.disabled = !loadedFolderPath;
}

function getParentFolderPath(folderPath) {
  if (!folderPath) return null;
  const normalized = folderPath.replace(/[\\/]+$/, '');
  if (!normalized) return null;
  if (/^\\\\[^\\]+\\[^\\]+$/.test(normalized)) return null;
  const parent = normalized.replace(/[\\/][^\\/]+$/, '');
  if (!parent || parent === normalized) return null;
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent;
}

function updateParentFolderButtonState() {
  if (!dom.parentFolderBtn) return;
  dom.parentFolderBtn.disabled = !getParentFolderPath(loadedFolderPath);
}

function updateFolderEmptyActions() {
  if (!dom.openFileDirBtn) return;
  const activeTab = tabs.find(t => t.id === activeTabId);
  const canOpenFileDir = !loadedFolderPath && !!activeTab?.path;
  dom.openFileDirBtn.classList.toggle('hidden', !canOpenFileDir);
  dom.openFileDirBtn.disabled = !canOpenFileDir;
}

function syncChatInputPlaceholder() {
  if (!dom.chatInput) return;
  dom.chatInput.placeholder = chatPaused
    ? t('chat.agentPausedHint')
    : t('chat.placeholder');
}

function setLanguage(lang) {
  currentLang = LOCALES[lang] ? lang : 'en';
  document.documentElement.lang = currentLang;
  applyTranslations();
  refreshDynamicText();
  renderChatMessages();
  renderChatHistoryList();
  renderChatContextFiles();
  renderChatAutoApproveToggle();
}

// ---- DOM refs ----
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const dom = {
  body: document.body,
  fileTitle: $('#file-title'),
  unsavedDot: $('#unsaved-dot'),
  progressFill: $('#progress-fill'),
  findBar: $('#find-bar'),
  findInput: $('#find-input'),
  findCount: $('#find-count'),
  sidebar: $('#sidebar'),
  recentsList: $('#recents-list'),
  recentsEmpty: $('#recents-empty'),
  folderList: $('#folder-list'),
  folderEmpty: $('#folder-empty'),
  openFileDirBtn: $('#btn-open-file-dir'),
  folderName: $('#folder-name'),
  newFolderFileBtn: $('#btn-new-folder-file'),
  parentFolderBtn: $('#btn-parent-folder'),
  refreshFolderBtn: $('#btn-refresh-folder'),
  tocList: $('#toc-list'),
  tocEmpty: $('#toc-empty'),
  welcome: $('#welcome'),
  welcomeRecents: $('#welcome-recents'),
  viewer: $('#viewer'),
  scrollContainer: $('#scroll-container'),
  tabBar: $('#tab-bar'),
  tabScrollLeft: $('#tab-scroll-left'),
  tabScrollRight: $('#tab-scroll-right'),
  mdContent: $('#md-content'),
  docFilename: $('#doc-filename'),
  docStats: { words: $('#stat-words'), read: $('#stat-read'), chars: $('#stat-chars') },
  scrollThumb: $('#scroll-thumb'),
  settingsOverlay: $('#settings-overlay'),
  statusFile: $('#status-file'),
  statusLink: $('#status-link'),
  statusPos: $('#status-pos'),
  editorPane: $('#editor-pane'),
  editorTextarea: $('#editor-textarea'),
  editorPos: $('#editor-pos'),
  editorChars: $('#editor-chars'),
  chatOverlay: $('#chat-overlay'),
  chatPanel: $('#chat-panel'),
  chatResizer: $('#chat-resizer'),
  chatMessages: $('#chat-messages'),
  chatEmpty: $('#chat-empty'),
  chatInput: $('#chat-input'),
  chatSend: $('#chat-send'),
  chatContextList: $('#chat-context-list'),
  chatContextAdd: $('#chat-context-add'),
  chatPathSuggest: $('#chat-path-suggest'),
  chatPathSuggestList: $('#chat-path-suggest-list'),
  chatHistoryBtn: $('#chat-history'),
  chatAutoApproveToggle: $('#chat-auto-approve-toggle'),
  chatHistoryMenu: $('#chat-history-menu'),
  chatHistoryList: $('#chat-history-list'),
};

// ---- Heading IDs (added post-render via DOM Ã¢â‚¬â€ sidesteps marked v13 token quirks) ----
function addHeadingIds() {
  $$('h1,h2,h3,h4,h5,h6', dom.mdContent).forEach(h => {
    if (!h.id) {
      h.id = h.textContent
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    }
  });
}

// ---- Highlight.js theme injection ----
// Use a <link> element so the browser loads the CSS natively (no IPC round-trip).
// Relative path resolves from renderer/ up to the project root node_modules/.
function applyHljsTheme(theme) {
  let link = $('#hljs-theme');
  if (!link) {
    link = document.createElement('link');
    link.id = 'hljs-theme';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  const base = '../node_modules/highlight.js/styles/';
  link.href = base + theme + '.min.css';
  link.onerror = () => { link.href = base + 'github-dark.min.css'; };
}

// ---- Markdown render (re-render via IPC Ã¢â‚¬â€ used only when settings change) ----
async function renderMarkdown(mdText) {
  return window.mandy.renderMarkdown(mdText, currentFile);
}


// ---- View mode ----
function setViewMode(mode) {
  viewMode = mode;
  dom.viewer.classList.remove('mode-preview', 'mode-split', 'mode-edit');
  dom.viewer.classList.add(`mode-${mode}`);
  $$('.view-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

  if (mode !== 'preview') {
    // preventScroll stops Chromium from jumping to the cursor position on focus
    dom.editorTextarea.focus({ preventScroll: true });
  }
  // Trigger a preview update when switching into split (content may differ from saved)
  if (mode === 'split' && hasUnsavedChanges) updatePreview();
}

// ---- Editor: live preview update ----
async function updatePreview() {
  const html = await renderMarkdown(dom.editorTextarea.value);
  dom.mdContent.innerHTML = html;
  _previewHtmlDirty = true;
  addHeadingIds();
  buildTOC();
  updateProgress();
  updateScrollThumb();
  invalidateScrollAnchors(); // heading positions changed
}

// ---- Anchor-based split-view scroll sync ----
// We map headings in the editor to the same headings in the preview as fixed
// anchor points, then interpolate between them.
//
// The critical detail: editorY must be the VISUAL pixel position of each
// heading in the textarea, not `lineIndex * lineHeight`.  Long paragraphs
// wrap to multiple visual lines Ã¢â‚¬â€ a simple line-count formula misses this
// and causes the preview to jump ahead (overscroll).
//
// Solution: a hidden "mirror" div styled identically to the textarea renders
// the same text with the same wrapping, giving us accurate pixel heights.
let _scrollAnchors    = null;
let _scrollDriver     = null;   // 'editor' | 'preview' | null
let _scrollDriverTimer = null;
let _scrollMirror     = null;   // Persistent hidden div for measuring textarea line heights

function invalidateScrollAnchors() {
  _scrollAnchors = null;
  // Remove stale mirror — will be recreated lazily with fresh styles
  if (_scrollMirror && _scrollMirror.parentNode) {
    _scrollMirror.parentNode.removeChild(_scrollMirror);
  }
  _scrollMirror = null;
}

function buildScrollAnchors() {
  const ta   = dom.editorTextarea;
  const sc   = dom.scrollContainer;
  const text = ta.value;
  const lines = text.split('\n');

  // 1. Find ATX headings in the source and their char offsets.
  const srcHeadings = [];
  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,6}\s+(.+)/);
    if (m) srcHeadings.push({ charOffset, text: m[1] });
    charOffset += lines[i].length + 1; // +1 for '\n'
  }

  // 2. Preview heading positions Ã¢â‚¬â€ absolute Y inside the scroll container.
  const scTop = sc.getBoundingClientRect().top;
  const norm  = s => s.toLowerCase().replace(/[`*_~[\]()]/g, '').replace(/\s+/g, ' ').trim();
  const prevHeadings = $$('h1,h2,h3,h4,h5,h6', dom.mdContent).map(h => ({
    y:    h.getBoundingClientRect().top - scTop + sc.scrollTop,
    text: norm(h.textContent),
  }));

  // 3. Match source headings Ã¢â€ â€™ preview headings (sequential, by normalised text).
  const pairs = [];
  let pIdx = 0;
  for (const sh of srcHeadings) {
    if (pIdx >= prevHeadings.length) break;
    if (norm(sh.text) === prevHeadings[pIdx].text) {
      pairs.push({ charOffset: sh.charOffset, previewY: prevHeadings[pIdx].y });
      pIdx++;
    }
  }

  if (pairs.length === 0) {
    // No matching headings Ã¢â‚¬â€ fall back to simple % sync.
    return [
      { editorY: 0,                                        previewY: 0 },
      { editorY: Math.max(0, ta.scrollHeight - ta.clientHeight),
        previewY: Math.max(0, sc.scrollHeight - sc.clientHeight) },
    ];
  }

  // 4. Measure accurate visual Y positions with a persistent mirror div.
  //    Styled like the textarea so it wraps identically — scrollHeight after
  //    filling with text up to a heading = pixel offset inside the textarea.
  const cs = getComputedStyle(ta);
  if (!_scrollMirror) {
    _scrollMirror = document.createElement('div');
    Object.assign(_scrollMirror.style, {
      position:      'absolute',
      visibility:    'hidden',
      pointerEvents: 'none',
      left:          '-9999px',
      top:           '0',
      boxSizing:     'border-box',
      paddingBottom: '0',
      whiteSpace:    'pre-wrap',
      wordBreak:     'break-word',
      overflowWrap:  'break-word',
    });
    document.body.appendChild(_scrollMirror);
  }
  // Sync styles that may change (font size, width, etc.)
  Object.assign(_scrollMirror.style, {
    width:         ta.clientWidth + 'px',
    fontFamily:    cs.fontFamily,
    fontSize:      cs.fontSize,
    fontWeight:    cs.fontWeight,
    lineHeight:    cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    paddingTop:    cs.paddingTop,
    paddingRight:  cs.paddingRight,
    paddingLeft:   cs.paddingLeft,
  });

  const anchors = [{ editorY: 0, previewY: 0 }];
  for (const p of pairs) {
    _scrollMirror.textContent = text.slice(0, p.charOffset);
    anchors.push({ editorY: _scrollMirror.scrollHeight, previewY: p.previewY });
  }

  anchors.push({
    editorY: Math.max(0, ta.scrollHeight - ta.clientHeight),
    previewY: Math.max(0, sc.scrollHeight - sc.clientHeight),
  });

  return anchors;
}

function getScrollAnchors() {
  if (!_scrollAnchors) _scrollAnchors = buildScrollAnchors();
  return _scrollAnchors;
}

// Piecewise linear interpolation through parallel arrays.
function mapScroll(val, from, to) {
  for (let i = 0; i < from.length - 1; i++) {
    if (val <= from[i + 1] || i === from.length - 2) {
      const span = from[i + 1] - from[i];
      const frac = span > 0 ? Math.min(1, Math.max(0, (val - from[i]) / span)) : 0;
      return to[i] + frac * (to[i + 1] - to[i]);
    }
  }
  return to[to.length - 1];
}

function syncEditorToPreview() {
  if (viewMode !== 'split' || _scrollDriver === 'preview') return;
  _scrollDriver = 'editor';
  clearTimeout(_scrollDriverTimer);
  _scrollDriverTimer = setTimeout(() => { _scrollDriver = null; }, 100);
  const a = getScrollAnchors();
  // 'instant' bypasses scroll-behavior:smooth Ã¢â‚¬â€ the smooth animation fires
  // scroll events for ~300 ms, outlasting the 100 ms driver timeout and
  // causing the preview to bounce the editor back ("pullback" jitter).
  dom.scrollContainer.scrollTo({
    top:      mapScroll(dom.editorTextarea.scrollTop, a.map(x => x.editorY),  a.map(x => x.previewY)),
    behavior: 'instant',
  });
}

function syncPreviewToEditor() {
  if (viewMode !== 'split' || _scrollDriver === 'editor') return;
  _scrollDriver = 'preview';
  clearTimeout(_scrollDriverTimer);
  _scrollDriverTimer = setTimeout(() => { _scrollDriver = null; }, 100);
  const a = getScrollAnchors();
  dom.editorTextarea.scrollTop = mapScroll(
    dom.scrollContainer.scrollTop,
    a.map(x => x.previewY),
    a.map(x => x.editorY),
  );
}

// ---- Editor: input handler ----
function handleEditorInput() {
  hasUnsavedChanges = true;
  updateUnsavedIndicator();
  updateEditorStatus();

  // Keep tab dot in sync (only re-render bar on first change)
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (activeTab) activeTab._wordCountCached = null; // invalidate cached word count
  if (activeTab && !activeTab.unsaved) {
    activeTab.unsaved = true;
    updateTabBarState();
  }

  if (viewMode === 'split') {
    clearTimeout(previewUpdateTimer);
    previewUpdateTimer = setTimeout(updatePreview, 400);
  }
}

// ---- Editor: cursor/char status ----
function updateEditorStatus() {
  const ta = dom.editorTextarea;
  const text = ta.value;
  const pos = ta.selectionStart;
  const before = text.slice(0, pos);
  const lines = before.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  dom.editorPos.textContent = `Ln ${line}, Col ${col}`;
  dom.editorChars.textContent = `${text.length.toLocaleString()} ${t('chars')}`;
}

// ---- Unsaved indicator ----
function updateUnsavedIndicator() {
  dom.unsavedDot.classList.toggle('hidden', !hasUnsavedChanges);
}

// ---- Tab management ----
function createTab(data = {}) {
  const id = `tab-${++tabCounter}`;
  const tab = {
    id,
    path:          data.path    || null,
    name:          data.name    || 'untitled.md',
    content:       data.content || '',
    html:          data.html    || '',
    viewMode:      data.viewMode || viewMode || 'preview',
    unsaved:       data.unsaved || false,
    cursorStart:   0,
    cursorEnd:     0,
    editorScroll:  data.editorScroll  || 0,
    previewScroll: data.previewScroll || 0,
  };
  tabs.push(tab);
  tabBarScrollToEndPending = true;
  return tab;
}

function saveActiveTabState() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  // Note: closeFind() is always called before saveActiveTabState() in activateTab(),
  // so search marks are already gone. No need to call clearHighlights() again.
  tab.content       = dom.editorTextarea.value;
  tab.cursorStart   = dom.editorTextarea.selectionStart;
  tab.cursorEnd     = dom.editorTextarea.selectionEnd;
  tab.editorScroll  = dom.editorTextarea.scrollTop;
  tab.previewScroll = dom.scrollContainer.scrollTop;
  tab.viewMode      = viewMode;
  tab.unsaved       = hasUnsavedChanges;
  if (_previewHtmlDirty) {
    tab.html = dom.mdContent.innerHTML;
    _previewHtmlDirty = false;
  }

  // Persist scroll position to disk if enabled
  if (cfg.rememberScrollPos !== false && tab.path) {
    window.mandy.setScrollPosition(tab.path, tab.previewScroll, tab.editorScroll).catch(() => {
      // Ignore errors saving scroll position
    });
  }
}

function activateTab(tabId) {
  clearTimeout(previewUpdateTimer);
  _scrollDriver = null;
  closeFind();
  saveActiveTabState();

  activeTabId = tabId;
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // Update globals
  currentFile       = tab.path;
  currentContent    = tab.content;
  hasUnsavedChanges = tab.unsaved;

  // Restore DOM
  dom.editorTextarea.value = tab.content;
  dom.editorTextarea.setSelectionRange(tab.cursorStart, tab.cursorEnd);
  dom.mdContent.innerHTML  = tab.html;

  dom.fileTitle.textContent   = tab.name;
  dom.docFilename.textContent = tab.name;
  dom.statusFile.textContent  = tab.path || '';

  // Word count (use cached value to avoid regex scan on every tab switch)
  if (cfg.showWordCount !== false && tab.content) {
    if (tab._wordCountCached == null) {
      tab._wordCountCached = countWords(tab.content);
    }
    const words = tab._wordCountCached;
    dom.docStats.words.textContent = `${words.toLocaleString()} ${t('words')}`;
    dom.docStats.read.textContent  = `~${Math.max(1, Math.round(words / 200))} ${t('minRead')}`;
    dom.docStats.chars.textContent = `${tab.content.length.toLocaleString()} ${t('chars')}`;
    $('#doc-meta').style.display = '';
  } else {
    $('#doc-meta').style.display = 'none';
  }

  // Welcome tab: empty, no path, not in edit mode Ã¢â€ â€™ show welcome screen
  const isWelcomeTab = !tab.path && !tab.content && !tab.unsaved && tab.viewMode !== 'edit';
  dom.welcome.classList.toggle('hidden', !isWelcomeTab);
  dom.viewer.classList.toggle('hidden',   isWelcomeTab);

  updateUnsavedIndicator();
  setViewMode(tab.viewMode);
  invalidateScrollAnchors();
  addHeadingIds();
  buildTOC();
  updateProgress();
  updateScrollThumb();
  updateEditorStatus();

  requestAnimationFrame(() => {
    dom.editorTextarea.scrollTop = tab.editorScroll;
    dom.scrollContainer.scrollTo({ top: tab.previewScroll, behavior: 'instant' });
  });

  // Full rebuild if tab count changed (add/remove); lightweight update otherwise
  const tabDomCount = $$('.tab', dom.tabBar).length;
  if (tabDomCount !== tabs.length) renderTabBar();
  else updateTabBarState();
  updateChatButtonState();
  updateChatFileBadge();
  updateFolderEmptyActions();

  // Mark active file in sidebar
  $$('.file-item').forEach(el => {
    el.classList.toggle('active', !!tab.path && el.dataset.path === tab.path);
  });
}

function renderTabBar() {
  const bar = $('#tab-bar');
  if (!bar) return;
  $$('.tab', bar).forEach(el => el.remove());
  const newBtn = $('#tab-new-btn');
  if (newBtn) {
    newBtn.classList.toggle('hidden', tabs.length === 0);
  }
  let dragStartOrder = null;
  let dragDropped = false;
  const DRAG_EDGE_SCROLL_ZONE = 28;
  const DRAG_EDGE_SCROLL_INTERVAL_MS = 220;
  let dragEdgeScrollDir = 0;
  let dragEdgeScrollTimer = 0;
  const stopDragEdgeAutoScroll = () => {
    dragEdgeScrollDir = 0;
    if (dragEdgeScrollTimer) {
      clearInterval(dragEdgeScrollTimer);
      dragEdgeScrollTimer = 0;
    }
  };
  const startDragEdgeAutoScroll = (dir) => {
    stopDragEdgeAutoScroll();
    dragEdgeScrollDir = dir;
    // Match the scroll-button behavior: larger smooth jumps.
    scrollTabBarByDirection(dir);
    dragEdgeScrollTimer = setInterval(() => {
      scrollTabBarByDirection(dir);
    }, DRAG_EDGE_SCROLL_INTERVAL_MS);
  };
  const updateDragEdgeAutoScroll = (e) => {
    const rect = bar.getBoundingClientRect();
    let dir = 0;
    if (e.clientX <= rect.left + DRAG_EDGE_SCROLL_ZONE) dir = -1;
    else if (e.clientX >= rect.right - DRAG_EDGE_SCROLL_ZONE) dir = 1;
    if (dir === dragEdgeScrollDir) return;
    if (!dir) {
      stopDragEdgeAutoScroll();
      return;
    }
    startDragEdgeAutoScroll(dir);
  };
  const commitTabOrderFromDom = () => {
    const orderedIds = $$('.tab', bar).map(t => t.dataset.tabId);
    if (orderedIds.length === 0) return;
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    tabs.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  };

  const labelsByTabId = new Map();
  const groups = new Map();
  tabs.forEach(tab => {
    const name = tab?.name || '';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(tab);
  });

  const goodLabels = new Set();

  // Keep non-duplicate names unchanged and reserve them first.
  groups.forEach((group, name) => {
    if (group.length === 1) {
      labelsByTabId.set(group[0].id, name);
      goodLabels.add(name);
    }
  });

  function getAncestors(filePath) {
    if (!filePath) return [];
    const parts = filePath.split(/[/\\]+/).filter(Boolean);
    const dirs = parts.slice(0, -1);
    return dirs.reverse(); // nearest parent first
  }

  groups.forEach((group, name) => {
    if (group.length <= 1) return;

    group.forEach((tab, idx) => {
      const ancestors = getAncestors(tab.path);
      const parent = ancestors[0] || '';
      let label = parent ? `${parent}/${name}` : name;

      // First try parent-prefix for everyone.
      if (goodLabels.has(label)) {
        // From second colliding tab onward, progressively use {ancestor}/../{filename}
        if (idx > 0) {
          let found = false;
          for (let i = 1; i < ancestors.length; i++) {
            const candidate = `${ancestors[i]}/../${name}`;
            if (!goodLabels.has(candidate)) {
              label = candidate;
              found = true;
              break;
            }
          }
          if (!found) {
            // Last-resort fallback when all ancestors still collide.
            let n = 2;
            let candidate = `${label} (${n})`;
            while (goodLabels.has(candidate)) {
              n += 1;
              candidate = `${label} (${n})`;
            }
            label = candidate;
          }
        } else {
          // Extremely rare collision with pre-existing good labels.
          let n = 2;
          let candidate = `${label} (${n})`;
          while (goodLabels.has(candidate)) {
            n += 1;
            candidate = `${label} (${n})`;
          }
          label = candidate;
        }
      }

      labelsByTabId.set(tab.id, label);
      goodLabels.add(label);
    });
  });

  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.dataset.tabId = tab.id;
    el.draggable = true;
    if (tab.path) el.title = tab.path;
    el.innerHTML =
      `<span class="tab-name">${escapeHtml(labelsByTabId.get(tab.id) || tab.name || '')}</span>` +
      `<span class="tab-dot${tab.unsaved ? '' : ' hidden'}">&bull;</span>` +
      `<button class="tab-close" title="${t('tt.closeTab')}">&times;</button>`;
    el.addEventListener('click', e => {
      if (e.target.classList.contains('tab-close')) { closeTab(tab.id); return; }
      activateTab(tab.id);
    });
    el.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tab.id);
      draggedTabId = tab.id;
      dragStartOrder = tabs.map(t => t.id);
      dragDropped = false;
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      draggedTabId = null;
      stopDragEdgeAutoScroll();
      $$('.tab.drop-before, .tab.drop-after', bar).forEach(t => t.classList.remove('drop-before', 'drop-after'));
      if (!dragDropped && Array.isArray(dragStartOrder)) {
        const orderMap = new Map(dragStartOrder.map((id, i) => [id, i]));
        tabs.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        renderTabBar();
      }
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      updateDragEdgeAutoScroll(e);
      const draggingId = draggedTabId || e.dataTransfer.getData('text/plain');
      if (!draggingId || draggingId === tab.id) return;
      const rect = el.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      el.classList.toggle('drop-before', before);
      el.classList.toggle('drop-after', !before);
      const draggingEl = $(`.tab[data-tab-id="${draggingId}"]`, bar);
      if (!draggingEl) return;
      const ref = before ? el : el.nextElementSibling;
      if (ref !== draggingEl && draggingEl.nextElementSibling !== ref) {
        bar.insertBefore(draggingEl, ref);
      }
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drop-before', 'drop-after');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      stopDragEdgeAutoScroll();
      const draggingId = draggedTabId || e.dataTransfer.getData('text/plain');
      el.classList.remove('drop-before', 'drop-after');
      if (!draggingId || draggingId === tab.id) return;
      dragDropped = true;
      commitTabOrderFromDom();
      renderTabBar();
    });
    bar.insertBefore(el, newBtn);
  });

  // Drop on empty area of tab bar to move tab to the end with live preview.
  bar.ondragover = (e) => {
    if (e.target.closest('#tab-new-btn')) return;
    e.preventDefault();
    updateDragEdgeAutoScroll(e);
    const draggingId = draggedTabId || e.dataTransfer.getData('text/plain');
    if (!draggingId) return;
    const draggingEl = $(`.tab[data-tab-id="${draggingId}"]`, bar);
    if (!draggingEl) return;
    if (e.target.closest('.tab')) return;
    bar.insertBefore(draggingEl, newBtn);
  };
  bar.ondrop = (e) => {
    if (e.target.closest('#tab-new-btn')) return;
    e.preventDefault();
    stopDragEdgeAutoScroll();
    const draggingId = draggedTabId || e.dataTransfer.getData('text/plain');
    if (!draggingId) return;
    dragDropped = true;
    commitTabOrderFromDom();
    renderTabBar();
  };
  bar.ondragleave = (e) => {
    if (e.relatedTarget && bar.contains(e.relatedTarget)) return;
    stopDragEdgeAutoScroll();
  };

  const activeEl = $('.tab.active', bar);
  if (activeEl && typeof activeEl.scrollIntoView === 'function') {
    activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }
  if (tabBarScrollToEndPending) {
    requestAnimationFrame(() => {
      bar.scrollLeft = bar.scrollWidth;
      updateTabScrollButtons();
    });
    tabBarScrollToEndPending = false;
  }
  updateTabScrollButtons();
}

// Lightweight tab bar update — toggles active class, unsaved dot, and name
// without rebuilding DOM nodes or re-attaching drag listeners.
function updateTabBarState() {
  const bar = dom.tabBar;
  if (!bar) return;
  $$('.tab', bar).forEach(el => {
    const tabId = el.dataset.tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    el.classList.toggle('active', tabId === activeTabId);
    const dot = el.querySelector('.tab-dot');
    if (dot) dot.classList.toggle('hidden', !tab.unsaved);
  });
  const activeEl = $('.tab.active', bar);
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
}

function updateTabScrollButtons() {
  const bar = dom.tabBar;
  if (!bar || !dom.tabScrollLeft || !dom.tabScrollRight) return;
  const maxScroll = Math.max(0, bar.scrollWidth - bar.clientWidth);
  const showLeft = bar.scrollLeft > 2;
  const showRight = bar.scrollLeft < maxScroll - 2;
  dom.tabScrollLeft.classList.toggle('hidden', !showLeft);
  dom.tabScrollRight.classList.toggle('hidden', !showRight);
}

function getTabBarScrollStep() {
  return Math.max(120, Math.round((dom.tabBar?.clientWidth || 360) * 0.55));
}

function scrollTabBarByDirection(dir) {
  if (!dir) return;
  dom.tabBar?.scrollBy({ left: dir * getTabBarScrollStep(), behavior: 'smooth' });
}

async function closeTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  if (tab.unsaved) {
    // Activate the tab being closed so saveFile() targets it
    if (tabId !== activeTabId) activateTab(tabId);
    const dlg = {
      title:   t('dlg.unsaved.title'),
      message: t('dlg.unsaved.msg').replace('{name}', tab.name),
      detail:  t('dlg.unsaved.detail'),
      buttons: [t('dlg.unsaved.save'), t('dlg.unsaved.dontSave'), t('dlg.unsaved.cancel')],
    };
    const resp = await window.mandy.showUnsavedDialog(dlg);
    if (resp === 2) return;           // Cancel
    if (resp === 0) await saveFile(); // Save
  }

  // Save scroll position if enabled and file has a path
  if (cfg.rememberScrollPos !== false && tab.path) {
    try {
      // Update scroll position one last time before closing
      if (tabId === activeTabId) {
        tab.previewScroll = dom.scrollContainer.scrollTop;
        tab.editorScroll = dom.editorTextarea.scrollTop;
      }
      await window.mandy.setScrollPosition(tab.path, tab.previewScroll, tab.editorScroll);
    } catch (e) {
      // Ignore errors saving scroll position
    }
  }

  const idx = tabs.findIndex(t => t.id === tabId);
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    activeTabId = null;
    currentFile = null;
    currentContent = '';
    hasUnsavedChanges = false;
    dom.viewer.classList.add('hidden');
    dom.welcome.classList.remove('hidden');
    dom.progressFill.style.width = '0%';
    dom.statusPos.textContent = '';
    // Clear active file highlighting in sidebar
    $$('.file-item').forEach(el => el.classList.remove('active'));
    $$('.recent-item').forEach(el => el.classList.remove('active'));
    renderTabBar();
    updateChatButtonState();
    updateFolderEmptyActions();
    return;
  }

  const nextTab = tabs[Math.min(idx, tabs.length - 1)];
  activeTabId = null; // force full restore in activateTab
  activateTab(nextTab.id);
}

// ---- Save file ----
async function saveFile() {
  const activeTab = tabs.find(t => t.id === activeTabId);

  if (!currentFile) {
    const result = await window.mandy.showSaveDialog({ defaultPath: activeTab?.name || 'untitled.md' });
    if (result.canceled || !result.filePath) return;
    currentFile = result.filePath;
    const name = currentFile.split(/[\\/]/).pop();
    dom.fileTitle.textContent   = name;
    dom.docFilename.textContent = name;
    dom.statusFile.textContent  = currentFile;
    if (activeTab) { activeTab.path = currentFile; activeTab.name = name; }
    updateChatButtonState();
    const recents = await window.mandy.addRecent(currentFile);
    updateRecentsList(recents);
    updateWelcomeRecents(recents);
  }

  const content = dom.editorTextarea.value;
  const result = await window.mandy.saveFile(currentFile, content);
  if (result.ok) {
    currentContent    = content;
    hasUnsavedChanges = false;
    if (activeTab) { activeTab.unsaved = false; activeTab.content = content; activeTab._wordCountCached = null; }
    updateUnsavedIndicator();
    updateTabBarState();
    const recents = await window.mandy.addRecent(currentFile);
    updateRecentsList(recents);
    updateWelcomeRecents(recents);
    // Re-render preview with saved content
    const html = await renderMarkdown(content);
    dom.mdContent.innerHTML = html;
    _previewHtmlDirty = false; // Stored directly on tab below
    if (activeTab) activeTab.html = html;
    addHeadingIds();
    buildTOC();
    // Update word count stats
    const words = countWords(content);
    dom.docStats.words.textContent = `${words.toLocaleString()} ${t('words')}`;
    dom.docStats.read.textContent  = `~${Math.max(1, Math.round(words / 200))} ${t('minRead')}`;
    dom.docStats.chars.textContent = `${content.length.toLocaleString()} ${t('chars')}`;
    updateChatButtonState();
  } else {
    dom.statusPos.textContent = t('saveFailed');
    setTimeout(() => updateScrollPos(), 3000);
  }
}

// ---- Active format detection ----

function getLineInfo(text, pos) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const lineEndIdx = text.indexOf('\n', pos);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  return { lineStart, lineEnd, line: text.slice(lineStart, lineEnd), col: pos - lineStart };
}

// Find a symmetric inline marker (e.g. ** or ~~) containing the cursor.
// Returns { absOpen, absClose, markerLen } or null.
// absOpen  = absolute index of the opening marker's first char
// absClose = absolute index of the closing marker's first char
function findInlineMarker(text, pos, marker) {
  const { lineStart, line, col } = getLineInfo(text, pos);
  const ml = marker.length;
  const esc = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc + '.+?' + esc, 'gs');
  let m;
  while ((m = re.exec(line)) !== null) {
    if (col > m.index && col <= m.index + m[0].length) {
      return { absOpen: lineStart + m.index, absClose: lineStart + m.index + m[0].length - ml, markerLen: ml };
    }
  }
  return null;
}

// Find italic span (*...*) while ignoring ** (bold markers).
function findItalicMarker(text, pos) {
  const { lineStart, line, col } = getLineInfo(text, pos);
  const masked = line.replace(/\*\*/g, '\x00\x00');   // blank out bold markers
  const re = /\*[^*\x00]+?\*/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    if (col > m.index && col <= m.index + m[0].length) {
      return { absOpen: lineStart + m.index, absClose: lineStart + m.index + m[0].length - 1, markerLen: 1 };
    }
  }
  return null;
}

// Returns true when pos is between an opening ``` fence and its closing fence.
// Strategy: count ``` lines that appear strictly before pos in the source.
// An odd count means we are inside a block.
function isCursorInFencedCodeBlock(text, pos) {
  const before = text.slice(0, pos);
  const fences = (before.match(/^```/gm) || []).length;
  return fences % 2 === 1;
}

// Find the open/close fence pair enclosing pos.
// Returns { openStart, openEnd, closeStart, closeEnd } or null.
function findEnclosingFence(text, pos) {
  const lines = text.split('\n');
  const fences = [];
  let off = 0;
  for (const line of lines) {
    if (/^```/.test(line)) fences.push({ start: off, end: off + line.length });
    off += line.length + 1;
  }
  // Fences pair up: [0]=open,[1]=close,[2]=open,[3]=close Ã¢â‚¬Â¦
  for (let i = 0; i + 1 < fences.length; i += 2) {
    const open = fences[i], close = fences[i + 1];
    if (pos >= open.start && pos <= close.end) return { openStart: open.start, openEnd: open.end, closeStart: close.start, closeEnd: close.end };
  }
  return null;
}

// Returns a Set of format-name strings active at the current cursor position.
function getActiveFormats() {
  const ta = dom.editorTextarea;
  const pos = ta.selectionStart;
  const text = ta.value;
  const { line } = getLineInfo(text, pos);
  const active = new Set();

  // Fenced code block takes priority Ã¢â‚¬â€ don't check inline formats inside one
  if (isCursorInFencedCodeBlock(text, pos)) {
    active.add('codeblock');
    return active;
  }

  // Line-level (most-specific first so ### wins over ##)
  if (/^### /.test(line))      active.add('h3');
  else if (/^## /.test(line))  active.add('h2');
  else if (/^# /.test(line))   active.add('h1');
  if (/^- /.test(line))        active.add('ul');
  if (/^\d+\. /.test(line))    active.add('ol');
  if (/^> /.test(line))        active.add('blockquote');

  // Inline
  if (findInlineMarker(text, pos, '**')) active.add('bold');
  if (findItalicMarker(text, pos))       active.add('italic');
  if (findInlineMarker(text, pos, '~~')) active.add('strikethrough');
  if (findInlineMarker(text, pos, '`'))  active.add('code');

  return active;
}

// Sync toolbar button highlight with cursor position.
function updateToolbarState() {
  const active = getActiveFormats();
  $$('.toolbar-btn[data-action]').forEach(btn => {
    btn.classList.toggle('active', active.has(btn.dataset.action));
  });
}

// Debounced version — avoids running multiple regex scans on every caret move
let _toolbarDebounce = null;
function debouncedUpdateToolbarState() {
  clearTimeout(_toolbarDebounce);
  _toolbarDebounce = setTimeout(updateToolbarState, 60);
}

// ---- Format insertion / toggling ----
function applyFormat(type) {
  const ta = dom.editorTextarea;
  const pos = ta.selectionStart;
  const selEnd = ta.selectionEnd;
  const text = ta.value;
  const { lineStart, lineEnd, line, col } = getLineInfo(text, pos);
  const selected = text.slice(pos, selEnd);

  // Helper: strip any existing line-level prefix
  const stripPrefix = l => l.replace(/^(#{1,6} |- |\d+\. |> )/, '');

  // execCommand('insertText') is the only textarea write that integrates with
  // the native undo stack (Ctrl+Z). setRangeText/value assignment do not.
  // preventScroll: true stops Chromium from jumping the textarea when focus
  // returns from a toolbar button click.
  function exec(replaceText, selStart, selStop) {
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(selStart, selStop);
    document.execCommand('insertText', false, replaceText);
  }

  // Helper: commit a line-level replacement and reposition cursor
  function commitLine(newLine, oldPrefixLen, newPrefixLen) {
    exec(newLine, lineStart, lineEnd);
    const newPos = lineStart + newPrefixLen + Math.max(0, col - oldPrefixLen);
    ta.setSelectionRange(newPos, newPos);
    updateToolbarState();
  }

  // ---- Inline toggle-off ----
  const inlineFinders = {
    bold:          () => findInlineMarker(text, pos, '**'),
    italic:        () => findItalicMarker(text, pos),
    strikethrough: () => findInlineMarker(text, pos, '~~'),
    code:          () => findInlineMarker(text, pos, '`'),
  };
  if (type in inlineFinders) {
    const span = inlineFinders[type]();
    if (span) {
      const inner = text.slice(span.absOpen + span.markerLen, span.absClose);
      exec(inner, span.absOpen, span.absClose + span.markerLen);
      const newPos = Math.max(span.absOpen, Math.min(pos - span.markerLen, span.absOpen + inner.length));
      ta.setSelectionRange(newPos, newPos);
      updateToolbarState();
      return;
    }
  }

  // ---- Line-level toggle (headings, lists, blockquote) ----
  const stripped   = stripPrefix(line);
  const oldPrefLen = line.length - stripped.length;

  switch (type) {
    case 'h1': case 'h2': case 'h3': {
      const prefixes = { h1: '# ', h2: '## ', h3: '### ' };
      const prefix   = prefixes[type];
      const isActive = line.startsWith(prefix) && !line.startsWith(prefix + '#');
      commitLine(isActive ? stripped : prefix + stripped, oldPrefLen, isActive ? 0 : prefix.length);
      return;
    }
    case 'ul': {
      const isActive = /^- /.test(line);
      commitLine(isActive ? stripped : `- ${stripped}`, oldPrefLen, isActive ? 0 : 2);
      return;
    }
    case 'ol': {
      const isActive = /^\d+\. /.test(line);
      commitLine(isActive ? stripped : `1. ${stripped}`, oldPrefLen, isActive ? 0 : 3);
      return;
    }
    case 'blockquote': {
      const isActive = /^> /.test(line);
      commitLine(isActive ? stripped : `> ${stripped}`, oldPrefLen, isActive ? 0 : 2);
      return;
    }
    case 'codeblock': {
      // Toggle off: cursor is inside a fenced block Ã¢â‚¬â€ remove the fences.
      const fence = findEnclosingFence(text, pos);
      if (fence) {
        // Content sits between the end of the opening fence line and the
        // start of the closing fence line (strip the surrounding newlines).
        const contentStart = fence.openEnd + 1;              // char after opening \n
        const contentEnd   = Math.max(contentStart, fence.closeStart - 1); // char before closing \n
        const content      = text.slice(contentStart, contentEnd);
        exec(content, fence.openStart, fence.closeEnd);
        ta.setSelectionRange(fence.openStart, fence.openStart + content.length);
        return;
      }
      // Apply: insert a new fenced code block.
      const inner = selected || 'code';
      exec(`\`\`\`\n${inner}\n\`\`\``, pos, selEnd);
      ta.setSelectionRange(pos + 4, pos + 4 + inner.length);
      return;
    }
    case 'hr': {
      const ins = `\n\n---\n\n`;
      exec(ins, selEnd, selEnd);
      ta.setSelectionRange(selEnd + ins.length, selEnd + ins.length);
      return;
    }
  }

  // ---- Inline apply ----
  let newText, newStart, newEnd;
  switch (type) {
    case 'bold':
      newText = `**${selected || 'bold text'}**`;
      newStart = pos + 2; newEnd = pos + 2 + (selected.length || 9);
      break;
    case 'italic':
      newText = `*${selected || 'italic text'}*`;
      newStart = pos + 1; newEnd = pos + 1 + (selected.length || 11);
      break;
    case 'strikethrough':
      newText = `~~${selected || 'strikethrough'}~~`;
      newStart = pos + 2; newEnd = pos + 2 + (selected.length || 13);
      break;
    case 'code':
      newText = `\`${selected || 'code'}\``;
      newStart = pos + 1; newEnd = pos + 1 + (selected.length || 4);
      break;
    case 'link':
      newText = selected ? `[${selected}](url)` : `[link text](url)`;
      newStart = selected ? pos + selected.length + 3 : pos + 1;
      newEnd   = selected ? newStart + 3 : pos + 10;
      break;
    case 'image':
      newText = `![${selected || 'alt text'}](url)`;
      newStart = pos + 2; newEnd = pos + 2 + (selected.length || 8);
      break;
    default: return;
  }

  exec(newText, pos, selEnd);
  ta.setSelectionRange(newStart, newEnd);
}

// ---- Editor keyboard shortcuts ----
function setupEditorKeyboard() {
  dom.editorTextarea.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;

    // Formatting shortcuts
    if (mod && e.key === 'b') { e.preventDefault(); applyFormat('bold'); return; }
    if (mod && e.key === 'i') { e.preventDefault(); applyFormat('italic'); return; }
    if (mod && e.key === 'k') { e.preventDefault(); applyFormat('link'); return; }
    if (mod && e.key === '`') { e.preventDefault(); applyFormat('code'); return; }

    // Tab Ã¢â€ â€™ two spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = dom.editorTextarea;
      const pos = ta.selectionStart;
      document.execCommand('insertText', false, '  ');
      ta.setSelectionRange(pos + 2, pos + 2);
      return;
    }

    // Smart Enter: continue list items
    if (e.key === 'Enter') {
      const ta = dom.editorTextarea;
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const lines = before.split('\n');
      const currentLine = lines[lines.length - 1];

      const ulMatch = currentLine.match(/^(\s*)-\s+(.*)$/);
      const olMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);

      if (ulMatch) {
        e.preventDefault();
        if (!ulMatch[2]) {
          // Empty item Ã¢â€ â€™ exit list: replace "- " on this line with a plain newline
          const lineStart = pos - currentLine.length;
          ta.setSelectionRange(lineStart, pos);
          document.execCommand('insertText', false, '\n');
        } else {
          const cont = `\n${ulMatch[1]}- `;
          document.execCommand('insertText', false, cont);
        }
        return;
      }

      if (olMatch) {
        e.preventDefault();
        if (!olMatch[3]) {
          const lineStart = pos - currentLine.length;
          ta.setSelectionRange(lineStart, pos);
          document.execCommand('insertText', false, '\n');
        } else {
          const cont = `\n${olMatch[1]}${parseInt(olMatch[2]) + 1}. `;
          document.execCommand('insertText', false, cont);
        }
        return;
      }
    }
  });

  dom.editorTextarea.addEventListener('input', handleEditorInput);
  dom.editorTextarea.addEventListener('scroll', syncEditorToPreview, { passive: true });
  dom.editorTextarea.addEventListener('click', () => { updateEditorStatus(); debouncedUpdateToolbarState(); });
  dom.editorTextarea.addEventListener('mousedown', e => {
    if (e.detail !== 2) return;
    e.preventDefault();
    const ta   = dom.editorTextarea;
    const text = ta.value;
    let s = ta.selectionStart, end = s;
    while (s > 0 && /\w/.test(text[s - 1])) s--;
    while (end < text.length && /\w/.test(text[end])) end++;
    ta.setSelectionRange(s, end);
  });
  dom.editorTextarea.addEventListener('keyup', () => { updateEditorStatus(); debouncedUpdateToolbarState(); });
  // selectionchange fires on arrow-key navigation, mouse selection, etc.
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === dom.editorTextarea) debouncedUpdateToolbarState();
  });
}

// ---- New file ----
function newWelcomeTab() {
  const tab = createTab({ name: 'New Tab', viewMode: 'preview' });
  activateTab(tab.id);
}

function newFile() {
  // If the active tab is already a welcome tab, convert it to an edit tab in-place
  const cur = tabs.find(t => t.id === activeTabId);
  if (cur && !cur.path && !cur.content && !cur.unsaved && cur.viewMode !== 'edit') {
    cur.name    = 'untitled.md';
    cur.viewMode = 'edit';
    activeTabId = null; // force full DOM restore
    activateTab(cur.id);
    return;
  }
  const tab = createTab({ viewMode: 'edit' });
  activateTab(tab.id);
}

// ---- File opening ----
async function openDocument(data) {
  const { path: filePath, name, content, html, recents, gotoLine, gotoColumn } = data;
  const targetLine = Number(gotoLine) > 0 ? Number(gotoLine) : null;
  const targetColumn = Number(gotoColumn) > 0 ? Number(gotoColumn) : 1;

  // If file is already open in a tab, just switch to it
  const existing = tabs.find(t => t.path === filePath);
  if (existing) {
    activateTab(existing.id);
    if (targetLine) jumpToEditorPosition(targetLine, targetColumn);
    if (recents) updateRecentsList(recents);
    return;
  }

  // Load saved scroll position if enabled
  let savedScrollPos = {previewScroll: 0, editorScroll: 0};
  if (cfg.rememberScrollPos !== false && filePath) {
    try {
      savedScrollPos = await window.mandy.getScrollPosition(filePath);
    } catch (e) {
      // Ignore errors loading scroll position
    }
  }

  // Replace current tab only if it's untitled, unmodified, and empty
  const cur = tabs.find(t => t.id === activeTabId);
  let tab;
  if (cur && !cur.path && !cur.unsaved && cur.content === '') {
    Object.assign(cur, { path: filePath, name, content, html: html || '', viewMode: 'preview', unsaved: false,
                        previewScroll: savedScrollPos.previewScroll, editorScroll: savedScrollPos.editorScroll });
    tab = cur;
    activeTabId = null; // force full restore
  } else {
    tab = createTab({ path: filePath, name, content, html: html || '', viewMode: 'preview',
                     previewScroll: savedScrollPos.previewScroll, editorScroll: savedScrollPos.editorScroll });
  }

  activateTab(tab.id);
  if (targetLine) jumpToEditorPosition(targetLine, targetColumn);
  if (recents) updateRecentsList(recents);
  if (liveReload) window.mandy.watchFile(filePath);
}

function jumpToEditorPosition(line, column = 1) {
  const text = dom.editorTextarea.value || '';
  const lines = text.split('\n');
  const targetLine = Math.max(1, Math.min(Number(line) || 1, Math.max(1, lines.length)));
  const targetColumn = Math.max(1, Number(column) || 1);

  let pos = 0;
  for (let i = 0; i < targetLine - 1; i += 1) pos += lines[i].length + 1;
  const lineLen = (lines[targetLine - 1] || '').length;
  pos += Math.min(lineLen, targetColumn - 1);

  if (viewMode === 'preview') {
    const maxScroll = Math.max(0, dom.scrollContainer.scrollHeight - dom.scrollContainer.clientHeight);
    const ratio = (targetLine - 1) / Math.max(1, lines.length - 1);
    dom.scrollContainer.scrollTop = Math.round(maxScroll * ratio);
    updateProgress();
    updateScrollPos();
    return;
  }

  dom.editorTextarea.focus({ preventScroll: true });
  dom.editorTextarea.setSelectionRange(pos, pos);

  const lineHeight = parseFloat(getComputedStyle(dom.editorTextarea).lineHeight) || 24;
  const top = Math.max(0, (targetLine - 1) * lineHeight - dom.editorTextarea.clientHeight * 0.35);
  dom.editorTextarea.scrollTop = top;
  syncEditorToPreview();
  updateEditorStatus();
  updateToolbarState();
}

function countWords(text) {
  return (text.match(/\b\w+\b/g) || []).length;
}

// ---- TOC ----
let _tocScrolling = false;
let _tocScrollTimer = null;
let _scrollSpyListener = null;
let _lastTocSignature = null;

function buildTOC() {
  const headings = $$('h1,h2,h3,h4,h5,h6', dom.mdContent);

  // Skip full rebuild if heading structure hasn't changed
  const sig = headings.map(h => h.tagName + ':' + h.textContent).join('\n');
  if (sig === _lastTocSignature && dom.tocList.children.length > 0) {
    // Headings unchanged — just refresh scroll-spy offsets
    observeHeadings(headings);
    return;
  }
  _lastTocSignature = sig;

  dom.tocList.innerHTML = '';

  if (headings.length === 0) {
    dom.tocEmpty.classList.remove('hidden');
    return;
  }
  dom.tocEmpty.classList.add('hidden');

  headings.forEach((h, idx) => {
    const level = parseInt(h.tagName[1]);
    const item = document.createElement('a');
    item.className = 'toc-item';
    item.dataset.level = level;
    item.dataset.idx = idx;
    item.textContent = h.textContent;
    item.href = '#';
    item.onclick = (e) => {
      e.preventDefault();
      clearTimeout(_tocScrollTimer);
      _tocScrolling = true;
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $$('.toc-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      _tocScrollTimer = setTimeout(() => { _tocScrolling = false; }, 800);
    };
    dom.tocList.appendChild(item);
  });

  observeHeadings(headings);
}

function observeHeadings(headings) {
  if (!dom.scrollContainer) return;

  if (_scrollSpyListener) {
    dom.scrollContainer.removeEventListener('scroll', _scrollSpyListener);
    _scrollSpyListener = null;
  }

  const arr = Array.from(headings);
  let offsets = [];

  // Compute each heading's absolute offset within the scroll container's content.
  // Formula: BCR.top - containerBCR.top + scrollTop cancels scroll so the value
  // is stable (only changes if content reflows, not on scroll).
  function computeOffsets() {
    const cTop = dom.scrollContainer.getBoundingClientRect().top;
    const st   = dom.scrollContainer.scrollTop;
    offsets = arr.map(h => h.getBoundingClientRect().top - cTop + st);
  }

  function updateActive() {
    if (_tocScrolling || !offsets.length) return;
    const st        = dom.scrollContainer.scrollTop;
    const threshold = 80; // px Ã¢â‚¬â€ heading activates when within 80px of container top
    let activeIdx   = 0;
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] <= st + threshold) activeIdx = i;
    }
    $$('.toc-item').forEach(item =>
      item.classList.toggle('active', parseInt(item.dataset.idx) === activeIdx)
    );
  }

  // Wait one frame so the browser has finished laying out the new content
  requestAnimationFrame(() => {
    computeOffsets();
    updateActive();
  });

  _scrollSpyListener = updateActive;
  dom.scrollContainer.addEventListener('scroll', _scrollSpyListener, { passive: true });
}

// ---- Recents ----
function updateRecentsList(recents) {
  dom.recentsList.innerHTML = '';
  if (!recents || recents.length === 0) {
    dom.recentsEmpty.classList.remove('hidden');
    updateWelcomeRecents([]);
    return;
  }
  dom.recentsEmpty.classList.add('hidden');
  recents.forEach(r => {
    const item = createFileItem(r, () => openRecentFileFromList(r.path));
    dom.recentsList.appendChild(item);
  });
  updateWelcomeRecents(recents);
}

async function openRecentFileFromList(filePath) {
  const res = await window.mandy.openFileFromPath(filePath, {fromRecent: true});
  if (res?.removedRecent && Array.isArray(res.recents)) {
    purgeDocConversationHistory(filePath, { clearVisible: true });
    updateRecentsList(res.recents);
  }
}

function updateWelcomeRecents(recents) {
  dom.welcomeRecents.innerHTML = '';
  if (!recents || recents.length === 0) return;
  recents.slice(0, 6).forEach(r => {
    const el = document.createElement('div');
    el.className = 'welcome-recent-item';
    el.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="wri-name">${escapeHtml(r.name)}</span>
      <span class="wri-path">${escapeHtml(r.path)}</span>
    `;
    el.onclick = () => openRecentFileFromList(r.path);
    dom.welcomeRecents.appendChild(el);
  });
}

function createFileItem(r, onClick) {
  const div = document.createElement('div');
  div.className = 'file-item';
  div.dataset.path = r.path;
  if (r.path === currentFile) div.classList.add('active');

  const date = r.opened ? relativeTime(r.opened) : '';
  div.innerHTML = `
    <svg class="file-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
    <div class="file-info">
      <div class="file-name">${escapeHtml(r.name)}</div>
      <div class="file-path" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</div>
      ${date ? `<div class="file-date">${date}</div>` : ''}
    </div>
    <button class="file-remove" title="${t('tt.removeRecent')}" data-path="${escapeHtml(r.path)}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  `;

  div.addEventListener('click', (e) => {
    if (!e.target.closest('.file-remove')) onClick();
  });

  div.querySelector('.file-remove').addEventListener('click', async (e) => {
    e.stopPropagation();
    const p = e.currentTarget.dataset.path;
    const updated = await window.mandy.removeRecent(p);
    purgeDocConversationHistory(p, { clearVisible: true });
    updateRecentsList(updated);
  });

  return div;
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return t('justNow');
  if (m < 60) return `${m}${t('mAgo')}`;
  if (h < 24) return `${h}${t('hAgo')}`;
  if (d < 7) return `${d}${t('dAgo')}`;
  return new Date(ts).toLocaleDateString();
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function normalizeTreePath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function remapPathForRename(oldPath, newPath, inputPath) {
  const source = String(inputPath || '');
  const oldNorm = normalizeTreePath(oldPath);
  const sourceNorm = normalizeTreePath(source);
  if (!oldNorm || !sourceNorm) return source;
  if (sourceNorm === oldNorm) return newPath;
  if (sourceNorm.startsWith(oldNorm + '/')) return newPath + source.slice(String(oldPath || '').length);
  return source;
}

function remapRenamePathInLocalState(oldPath, newPath) {
  ensureChatHistories();
  const nextHistories = {};
  Object.keys(chatHistories).forEach(k => {
    nextHistories[remapPathForRename(oldPath, newPath, k)] = chatHistories[k];
  });
  chatHistories = nextHistories;

  const remapMap = (src) => {
    const out = {};
    Object.keys(src || {}).forEach(k => {
      out[remapPathForRename(oldPath, newPath, k)] = src[k];
    });
    return out;
  };
  activeConversationByDoc = remapMap(activeConversationByDoc);
  chatContextFilesByDoc = remapMap(chatContextFilesByDoc);
}

function isTreePathWithin(rootPath, candidatePath) {
  const rootNorm = normalizeTreePath(rootPath);
  const candidateNorm = normalizeTreePath(candidatePath);
  return candidateNorm === rootNorm || candidateNorm.startsWith(rootNorm + '/');
}

function getExpandedTreePaths() {
  return [...$$('.tree-dir.open', dom.folderList)].map(el => el.dataset.path).filter(Boolean);
}

function splitTreeRelativeParts(rootPath, fullPath) {
  const rootRaw = String(rootPath || '').replace(/[\\/]+$/, '');
  const fullRaw = String(fullPath || '').replace(/[\\/]+$/, '');
  if (!isTreePathWithin(rootRaw, fullRaw)) return [];
  const relative = fullRaw.slice(rootRaw.length).replace(/^[\\/]+/, '');
  return relative ? relative.split(/[\\/]+/).filter(Boolean) : [];
}

function findTreeDirByPath(filePath) {
  const targetNorm = normalizeTreePath(filePath);
  return $$('.tree-dir', dom.folderList).find(el => normalizeTreePath(el.dataset.path) === targetNorm) || null;
}

async function expandTreePath(filePath) {
  if (!loadedFolderPath || !filePath || !isTreePathWithin(loadedFolderPath, filePath)) return;

  const rootRaw = String(loadedFolderPath || '').replace(/[\\/]+$/, '');
  const parts = splitTreeRelativeParts(rootRaw, filePath);
  let cursor = rootRaw;

  for (const part of parts) {
    cursor = /[\\/]$/.test(cursor) ? `${cursor}${part}` : `${cursor}\\${part}`;
    const dirEl = findTreeDirByPath(cursor);
    if (!dirEl) return;
    dirEl.classList.add('open');
    const childGroup = [...dirEl.children].find(el => el.classList?.contains('tree-group'));
    if (!childGroup) return;
    const depth = Number(dirEl.dataset.depth || 0);
    await loadDirChildren(loadedFolderPath, dirEl.dataset.path, childGroup, depth);
  }
}

async function reopenFolderTreePreserving(extraPaths = []) {
  const restorePaths = [...new Set([...getExpandedTreePaths(), ...(extraPaths || [])].filter(Boolean))];
  try {
    await openFolder(loadedFolderPath);
    restorePaths.sort((a, b) => splitTreeRelativeParts(loadedFolderPath, a).length - splitTreeRelativeParts(loadedFolderPath, b).length);
    for (const p of restorePaths) {
      try { await expandTreePath(p); } catch {}
    }
  } catch {
    // Last resort: ensure tree is still refreshed.
    await openFolder(loadedFolderPath);
  }
}

async function refreshExpandedFolderForPath(filePath) {
  if (!loadedFolderPath || !filePath) return;
  const parentDir = dirnameOf(filePath);
  if (!isTreePathWithin(loadedFolderPath, parentDir)) return;

  const rootNorm = normalizeTreePath(loadedFolderPath);
  const parentNorm = normalizeTreePath(parentDir);

  // Parent is working-directory root: refresh root list while preserving opened nodes.
  if (parentNorm === rootNorm) {
    await reopenFolderTreePreserving(getExpandedTreePaths());
    return;
  }

  const dirEl = findTreeDirByPath(parentDir);
  if (!dirEl || !dirEl.classList.contains('open')) return;
  const childGroup = [...dirEl.children].find(el => el.classList?.contains('tree-group'));
  if (!childGroup) return;

  childGroup.innerHTML = '';
  childGroup.dataset.loaded = '0';
  childGroup.dataset.loading = '0';
  const depth = Number(dirEl.dataset.depth || 0);
  await loadDirChildren(loadedFolderPath, parentDir, childGroup, depth);
}

// ---- Folder tree ----
async function openFolder(folderPath) {
  const tree = await window.mandy.readFolder(folderPath);
  dom.folderList.innerHTML = '';
  const normalizedFolderPath = String(folderPath || '').replace(/[\\/]+$/, '');
  loadedFolderPath = folderPath;
  loadedFolderName = normalizedFolderPath.split(/[/\\]/).pop() || folderPath;
  dom.folderName.textContent = loadedFolderName;
  updateRefreshFolderButtonState();
  updateNewFolderFileButtonState();
  updateParentFolderButtonState();

  if (!tree || tree.length === 0) {
    dom.folderEmpty.classList.remove('hidden');
    updateFolderEmptyActions();
    return;
  }
  dom.folderEmpty.classList.add('hidden');
  dom.folderList.appendChild(buildTree(tree, 0));
  switchTab('folder');
  updateFolderEmptyActions();
}

async function refreshFolderTree() {
  if (!loadedFolderPath) return;
  await openFolder(loadedFolderPath);
}

function startInlineCreateInWorkingDirectory(type) {
  if (!loadedFolderPath) return;
  dom.folderEmpty.classList.add('hidden');

  let rootGroup = dom.folderList.querySelector(':scope > .tree-group');
  if (!rootGroup) {
    rootGroup = document.createElement('div');
    rootGroup.className = 'tree-group';
    dom.folderList.appendChild(rootGroup);
  }
  startInlineCreate(type, loadedFolderPath, rootGroup);
}

function buildTree(nodes, depth) {
  const group = document.createElement('div');
  group.className = 'tree-group';

  for (const node of nodes) {
    if (node.type === 'dir') {
      group.appendChild(buildDirNode(node, depth));
    } else {
      group.appendChild(buildFileNode(node, depth));
    }
  }
  return group;
}

function basenameOf(filePath) {
  const normalized = String(filePath || '').replace(/[\\/]+$/, '');
  return normalized.split(/[/\\]/).pop() || String(filePath || '');
}

function dirnameOf(filePath) {
  const normalized = String(filePath || '').replace(/[\\/]+$/, '');
  return normalized.replace(/[\\/][^\\/]+$/, '') || normalized;
}

function updateOpenTabsForPathRename(oldPath, newPath) {
  const oldNorm = String(oldPath || '').replace(/\\/g, '/');
  const newNorm = String(newPath || '').replace(/\\/g, '/');
  if (!oldNorm || !newNorm) return;

  let anyChanged = false;
  const oldLower = oldNorm.toLowerCase();
  const oldPrefixLower = `${oldLower}/`;

  tabs.forEach(tab => {
    if (!tab.path) return;
    const tabNorm = String(tab.path).replace(/\\/g, '/');
    const tabLower = tabNorm.toLowerCase();

    if (tabLower === oldLower) {
      tab.path = newPath;
      tab.name = basenameOf(newPath);
      anyChanged = true;
      return;
    }
    if (tabLower.startsWith(oldPrefixLower)) {
      const suffix = tab.path.slice(oldPath.length);
      tab.path = newPath + suffix;
      tab.name = basenameOf(tab.path);
      anyChanged = true;
    }
  });

  if (currentFile) {
    const curNorm = String(currentFile).replace(/\\/g, '/');
    const curLower = curNorm.toLowerCase();
    if (curLower === oldLower) currentFile = newPath;
    else if (curLower.startsWith(oldPrefixLower)) currentFile = newPath + currentFile.slice(oldPath.length);
  }

  if (anyChanged) {
    renderTabBar();
    updateTitle(activeTab());
  }
}

function startInlineRename(labelEl, itemPathOrGetter, onRenamed, options = {}) {
  if (!labelEl || labelEl.dataset.renaming === '1') return;
  const resolvePath = () => (typeof itemPathOrGetter === 'function' ? itemPathOrGetter() : itemPathOrGetter);
  const initialPath = resolvePath();
  if (!initialPath) return;
  const currentName = basenameOf(initialPath);
  const input = document.createElement('input');
  input.className = 'tree-inline-input tree-inline-rename';
  input.type = 'text';
  input.spellcheck = false;
  input.value = currentName;

  labelEl.dataset.renaming = '1';
  labelEl.style.display = 'none';
  labelEl.insertAdjacentElement('afterend', input);
  input.focus();
  if (options.selectStem === true) {
    const dot = currentName.lastIndexOf('.');
    const end = dot > 0 ? dot : currentName.length;
    input.setSelectionRange(0, end);
  } else {
    input.select();
  }

  let committed = false;
  const cleanup = () => {
    if (input.parentNode) input.remove();
    labelEl.style.display = '';
    delete labelEl.dataset.renaming;
  };
  const commit = async () => {
    if (committed) return;
    const nextName = String(input.value || '').trim();
    if (!nextName || nextName === currentName) {
      committed = true;
      cleanup();
      return;
    }

    committed = true;
    const oldPath = resolvePath();
    const res = await window.mandy.renameItem(oldPath, nextName);
    if (!res?.ok || !res?.path) {
      committed = false;
      input.focus();
      input.select();
      return;
    }
    labelEl.textContent = basenameOf(res.path);
    labelEl.title = basenameOf(res.path);
    cleanup();
    remapRenamePathInLocalState(oldPath, res.path);
    try {
      const latestRecents = await window.mandy.getRecents();
      updateRecentsList(latestRecents || []);
    } catch {}
    if (typeof onRenamed === 'function') onRenamed(res.path, oldPath);
    updateOpenTabsForPathRename(oldPath, res.path);
    try {
      await reopenFolderTreePreserving([dirnameOf(res.path)]);
    } catch {
      await openFolder(loadedFolderPath);
    }
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      committed = true;
      cleanup();
    }
  });
  input.addEventListener('blur', () => { if (!committed) commit(); });
}

function showTreeContextMenu(x, y, items) {
  const menu = $('#tree-context-menu');
  if (!menu) return;
  menu.innerHTML = '';

  items.filter(Boolean).forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    btn.addEventListener('click', async () => {
      menu.classList.add('hidden');
      await item.onClick();
    });
    menu.appendChild(btn);
  });

  menu.classList.remove('hidden');
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  menu.style.left = Math.min(x, window.innerWidth - mw - 4) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - mh - 4) + 'px';
}

function showWorkingDirContextMenu(x, y) {
  if (!loadedFolderPath) return;
  showTreeContextMenu(x, y, [
    {
      label: t('tt.newFile'),
      onClick: async () => startInlineCreateInWorkingDirectory('file'),
    },
    {
      label: t('tt.newFolder'),
      onClick: async () => startInlineCreateInWorkingDirectory('folder'),
    }
  ]);
}

async function loadDirChildren(rootPath, nodePath, targetGroup, depth) {
  if (!targetGroup || targetGroup.dataset.loading === '1' || targetGroup.dataset.loaded === '1') return;
  targetGroup.dataset.loading = '1';
  try {
    const children = await window.mandy.readFolder(rootPath, nodePath);
    targetGroup.innerHTML = '';
    if (Array.isArray(children) && children.length) {
      targetGroup.appendChild(buildTree(children, depth + 1));
    }
    targetGroup.dataset.loaded = '1';
  } finally {
    targetGroup.dataset.loading = '0';
  }
}

function buildDirNode(node, depth) {
  const wrap = document.createElement('div');
  wrap.className = 'tree-dir';
  wrap.dataset.path = node.path;
  wrap.dataset.depth = String(depth);

  const header = document.createElement('div');
  header.className = 'tree-dir-header';
  header.style.paddingLeft = (depth * 14 + 8) + 'px';
  header.innerHTML = `
    <svg class="tree-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M9 18l6-6-6-6"/>
    </svg>
    <svg class="tree-folder-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
    <span class="tree-dir-name" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</span>
  `;

  const children = document.createElement('div');
  children.className = 'tree-group';
  children.dataset.loaded = '0';
  children.dataset.loading = '0';

  header.addEventListener('click', async e => {
    const willOpen = !wrap.classList.contains('open');
    wrap.classList.toggle('open');
    if (willOpen) {
      await loadDirChildren(loadedFolderPath, node.path, children, depth);
    }
  });
  header.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    showTreeContextMenu(e.clientX, e.clientY, [
      {
        label: t('tt.setWorkingDir'),
        onClick: async () => openFolder(node.path),
      },
      {
        label: t('tt.newFile'),
        onClick: async () => {
          wrap.classList.add('open');
          await loadDirChildren(loadedFolderPath, node.path, children, depth);
          startInlineCreate('file', node.path, children);
        }
      },
      {
        label: t('tt.newFolder'),
        onClick: async () => {
          wrap.classList.add('open');
          await loadDirChildren(loadedFolderPath, node.path, children, depth);
          startInlineCreate('folder', node.path, children);
        }
      },
      {
        label: t('tt.rename'),
        onClick: async () => startInlineRename(
          header.querySelector('.tree-dir-name'),
          () => wrap.dataset.path,
          (newPath) => {
            wrap.dataset.path = newPath;
            node.path = newPath;
          }
        ),
      },
      {
        label: t('tt.delete'),
        onClick: async () => {
          const dirPath = wrap.dataset.path;
          const deleted = await window.mandy.deleteItem(dirPath);
          if (!deleted) return;
          const norm = dirPath.replace(/\\/g, '/');
          for (const tab of [...tabs]) {
            if (tab.path && tab.path.replace(/\\/g, '/').startsWith(norm + '/')) {
              await closeTab(tab.id);
            }
          }
          await reopenFolderTreePreserving();
        }
      }
    ]);
  });

  wrap.appendChild(header);
  wrap.appendChild(children);
  return wrap;
}

function startInlineCreate(type, parentPath, groupEl) {
  const existing = groupEl.querySelector('.tree-inline-create');
  if (existing) { existing.querySelector('input').focus(); return; }

  const row = document.createElement('div');
  row.className = 'tree-inline-create';
  const icon = type === 'file'
    ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  row.innerHTML = `${icon}<input class="tree-inline-input" type="text" placeholder="${t(type === 'file' ? 'folder.newFilePh' : 'folder.newFolderPh')}" spellcheck="false"/>`;
  groupEl.prepend(row);

  const input = row.querySelector('input');
  input.focus();

  let committed = false;
  async function commit() {
    let name = input.value.trim();
    if (!name) { row.remove(); return; }
    if (type === 'file') {
      const validExt = /\.(md|txt)$/i;
      if (!validExt.test(name)) {
        // default to .md if no valid extension given
        name = name.replace(/\.[^.]*$/, '') || name;
        name = name + '.md';
        input.value = name;
      }
    }
    committed = true;
    try {
      const fullPath = type === 'file'
        ? await window.mandy.createFile(parentPath, name)
        : await window.mandy.createFolder(parentPath, name);
      await reopenFolderTreePreserving([parentPath]);
      if (type === 'file') window.mandy.openFileFromPath(fullPath);
    } catch (err) {
      committed = false;
      input.select();
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { row.remove(); }
  });
  input.addEventListener('blur', () => { if (!committed) setTimeout(() => row.remove(), 120); });
}

function buildFileNode(node, depth) {
  const div = document.createElement('div');
  div.className = 'file-item tree-file' + (node.markdown ? '' : ' tree-file-other');
  div.dataset.path = node.path;
  if (node.path === currentFile) div.classList.add('active');
  // Align file icons with folder icons (folder rows reserve arrow space before icon).
  div.style.paddingLeft = (depth * 14 + 24) + 'px';
  div.innerHTML = `
    <svg class="file-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
    <div class="file-info">
      <div class="file-name" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</div>
    </div>
  `;
  div.addEventListener('click', () => {
    if (div.querySelector('.tree-inline-rename')) return;
    const filePath = div.dataset.path;
    if (node.markdown) window.mandy.openFileFromPath(filePath);
    else window.mandy.handleLink(filePath, null);
  });
  div.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    showTreeContextMenu(e.clientX, e.clientY, [
      {
        label: t('tt.rename'),
        onClick: async () => startInlineRename(
          div.querySelector('.file-name'),
          () => div.dataset.path,
          (newPath) => {
            div.dataset.path = newPath;
            node.path = newPath;
          },
          {selectStem: true}
        ),
      },
      {
        label: t('tt.delete'),
        onClick: async () => {
          const filePath = div.dataset.path;
          const deleted = await window.mandy.deleteItem(filePath);
          if (!deleted) return;
          const tab = tabs.find(t => t.path === filePath);
          if (tab) await closeTab(tab.id);
          const updatedRecents = await window.mandy.removeRecent(filePath);
          purgeDocConversationHistory(filePath, { clearVisible: true });
          updateRecentsList(updatedRecents);
          await reopenFolderTreePreserving();
        }
      }
    ]);
  });
  return div;
}

// ---- Sidebar tabs ----
function switchTab(tabName) {
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  $$('.tab-content').forEach(c => {
    if (c.id === `tab-${tabName}`) { c.classList.add('active'); c.classList.remove('hidden'); }
    else { c.classList.remove('active'); c.classList.add('hidden'); }
  });
}

// ---- Progress & scroll ----
function updateProgress() {
  const sc = dom.scrollContainer;
  const pct = sc.scrollHeight <= sc.clientHeight ? 0
    : (sc.scrollTop / (sc.scrollHeight - sc.clientHeight)) * 100;
  dom.progressFill.style.width = pct + '%';
  updateScrollPos();
}

function updateScrollPos() {
  const sc = dom.scrollContainer;
  const approx = Math.floor(sc.scrollTop / (parseFloat(cfg.fontSize || 18) * parseFloat(cfg.lineHeight || 1.8)));
  dom.statusPos.textContent = `Ln ${approx}`;
}

function updateScrollThumb() {
  const sc       = dom.scrollContainer;
  const indicator = dom.scrollThumb.parentElement;
  if (sc.scrollHeight <= sc.clientHeight) { dom.scrollThumb.style.height = '0'; return; }
  const trackH  = indicator.clientHeight || sc.clientHeight;
  const thumbH  = Math.max(30, (sc.clientHeight / sc.scrollHeight) * trackH);
  const thumbTop = (sc.scrollTop / (sc.scrollHeight - sc.clientHeight)) * (trackH - thumbH);
  dom.scrollThumb.style.height = thumbH + 'px';
  dom.scrollThumb.style.top    = thumbTop + 'px';
}

// ---- Preview context menu ----

function buildAskAiSpanPrompt(selectionText) {
  return `${t('chat.askSectionPrefix')} """${selectionText.trimEnd()}"""\n\n`;
}

function openAiSettingsFromChat() {
  closeChat();
  $('#chat-config-overlay')?.classList.add('hidden');
  closeChatHistoryMenu();
  openSettings();
  requestAnimationFrame(() => {
    const aiSection = $('#cfg-ai-api-url')?.closest('.settings-section');
    if (aiSection) aiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// Converts a DOM node (fragment from a selection) back to approximate Markdown.
function htmlToMd(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag   = node.tagName.toLowerCase();
  const inner = () => Array.from(node.childNodes).map(htmlToMd).join('');

  switch (tag) {
    case 'strong': case 'b':   return `**${inner()}**`;
    case 'em':     case 'i':   return `*${inner()}*`;
    case 'del':    case 's':   return `~~${inner()}~~`;
    case 'code':
      // inline code (not inside a pre)
      if (node.closest('pre')) return node.textContent;
      return `\`${node.textContent}\``;
    case 'a':
      return `[${inner()}](${node.getAttribute('href') || ''})`;
    case 'h1': return `# ${inner()}\n\n`;
    case 'h2': return `## ${inner()}\n\n`;
    case 'h3': return `### ${inner()}\n\n`;
    case 'h4': return `#### ${inner()}\n\n`;
    case 'h5': return `##### ${inner()}\n\n`;
    case 'h6': return `###### ${inner()}\n\n`;
    case 'p':  return `${inner()}\n\n`;
    case 'br': return '\n';
    case 'li': return `- ${inner().replace(/\n+$/, '')}\n`;
    case 'ul': case 'ol': return inner();
    case 'blockquote':
      return inner().trim().split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
    case 'pre': {
      const codeEl = node.querySelector('code');
      const lang   = (codeEl?.className || '').match(/language-(\S+)/)?.[1] || '';
      const text   = codeEl ? codeEl.textContent : node.textContent;
      return `\`\`\`${lang}\n${text.replace(/\n$/, '')}\n\`\`\`\n\n`;
    }
    case 'hr': return `---\n\n`;
    case 'img':
      return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
    default:   return inner();
  }
}

(function initContextMenu() {
  const menu          = document.getElementById('preview-context-menu');
  const btnMd         = document.getElementById('cm-copy-md');
  const btnText       = document.getElementById('cm-copy-text');
  const btnFind       = document.getElementById('cm-find');
  const btnFindEditor = document.getElementById('cm-find-editor');
  const btnAskAi      = document.getElementById('cm-ask-ai');

  function hideMenu() { menu.classList.add('hidden'); }

  function showMenu(x, y, hasSelection) {
    btnMd.disabled         = !hasSelection;
    btnText.disabled       = !hasSelection;
    btnFind.disabled       = !hasSelection;
    btnFindEditor.disabled = !hasSelection;
    btnAskAi.disabled      = !hasSelection;

    // Position, then clamp so it doesn't overflow the viewport
    menu.classList.remove('hidden');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth  - mw - 4) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - mh - 4) + 'px';
  }

  dom.mdContent.addEventListener('contextmenu', e => {
    // Available in preview and split modes (not edit, where the preview pane is hidden)
    if (viewMode === 'edit') return;
    e.preventDefault();
    const sel = window.getSelection();
    showMenu(e.clientX, e.clientY, sel && !sel.isCollapsed);
  });

  btnMd.onclick = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { hideMenu(); return; }
    const range    = sel.getRangeAt(0);
    const fragment = range.cloneContents();
    const wrapper  = document.createElement('div');
    wrapper.appendChild(fragment);
    navigator.clipboard.writeText(htmlToMd(wrapper).trim());
    hideMenu();
  };

  btnText.onclick = () => {
    const text = window.getSelection()?.toString() || '';
    if (text) navigator.clipboard.writeText(text);
    hideMenu();
  };

  // "Find in Document" Ã¢â‚¬â€ opens find bar pre-filled with the selection
  btnFind.onclick = () => {
    const text = window.getSelection()?.toString()?.trim() || '';
    hideMenu();
    openFind(text || undefined);
  };

  // "Find in Editor" Ã¢â‚¬â€ switches to split view and selects the text in the textarea
  btnFindEditor.onclick = () => {
    const text = window.getSelection()?.toString() || '';
    hideMenu();
    if (!text) return;

    const src = dom.editorTextarea.value;
    const idx = src.toLowerCase().indexOf(text.toLowerCase());
    if (idx === -1) return;

    // Switch to split so the user sees both panes
    setViewMode('split');

    // Select the match in the textarea and scroll to it
    dom.editorTextarea.focus({ preventScroll: true });
    dom.editorTextarea.setSelectionRange(idx, idx + text.length);

    // Scroll the textarea so the selection is vertically centred
    const lineH    = parseFloat(getComputedStyle(dom.editorTextarea).lineHeight) || 24;
    const lines    = src.substring(0, idx).split('\n').length - 1;
    const targetY  = lines * lineH;
    dom.editorTextarea.scrollTop = Math.max(0, targetY - dom.editorTextarea.clientHeight / 2);
  };

  btnAskAi.onclick = () => {
    const text = window.getSelection()?.toString() || '';
    hideMenu();
    if (!text.trim()) return;
    askAiAboutSpan(text);
  };

  // Dismiss on any click outside the menu or on Escape
  document.addEventListener('mousedown', e => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) { hideMenu(); e.stopPropagation(); }
  }, true);
})();

(function initEditorContextMenu() {
  const menu = document.getElementById('editor-context-menu');
  const ta   = dom.editorTextarea;
  const btnAskAi = document.getElementById('ecm-ask-ai');

  function hideMenu() { menu.classList.add('hidden'); }

  function showMenu(x, y, hasSelection) {
    btnAskAi.disabled = !hasSelection;
    menu.classList.remove('hidden');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth  - mw - 4) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - mh - 4) + 'px';
  }

  ta.addEventListener('contextmenu', e => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY, ta.selectionStart !== ta.selectionEnd);
  });

  document.getElementById('ecm-cut').onclick = () => {
    ta.focus();
    document.execCommand('cut');
    hideMenu();
  };

  document.getElementById('ecm-copy').onclick = () => {
    ta.focus();
    document.execCommand('copy');
    hideMenu();
  };

  document.getElementById('ecm-paste').onclick = () => {
    navigator.clipboard.readText().then(text => {
      const s = ta.selectionStart, e2 = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e2);
      ta.selectionStart = ta.selectionEnd = s + text.length;
      ta.dispatchEvent(new Event('input'));
    });
    hideMenu();
  };

  document.getElementById('ecm-find').onclick = () => {
    const text = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim();
    hideMenu();
    openFind(text || undefined);
  };

  btnAskAi.onclick = () => {
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value.slice(start, end);
    hideMenu();
    if (!text.trim() || start === end) return;
    askAiAboutSpan(text);
  };

  document.addEventListener('mousedown', e => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) { hideMenu(); e.stopPropagation(); }
  }, true);
})();

(function initTreeContextMenu() {
  const menu = document.getElementById('tree-context-menu');
  if (!menu) return;

  function hideMenu() { menu.classList.add('hidden'); }

  document.addEventListener('mousedown', e => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) { hideMenu(); e.stopPropagation(); }
  }, true);
  window.addEventListener('blur', hideMenu);
})();

// ---- Link hover preview (status bar) ----
(function initLinkHover() {
  function showLink(href) {
    dom.statusFile.classList.add('hidden');
    dom.statusLink.textContent = href;
    dom.statusLink.classList.remove('hidden');
  }
  function hideLink() {
    dom.statusLink.classList.add('hidden');
    dom.statusLink.textContent = '';
    dom.statusFile.classList.remove('hidden');
  }

  dom.mdContent.addEventListener('mouseover', e => {
    const a = e.target.closest('a[href]');
    if (a) showLink(a.getAttribute('href'));
  });
  dom.mdContent.addEventListener('mouseout', e => {
    if (e.target.closest('a[href]')) hideLink();
  });
})();

// ---- Find ----
let findTimeout;

function openFind(query, selectionY) {
  if (viewMode === 'edit') setViewMode('split');
  dom.findBar.classList.remove('hidden');
  const term = query ?? dom.findInput.value;
  if (term) {
    dom.findInput.value = term;
    doFind(term, selectionY);
  }
  dom.findInput.focus();
  dom.findInput.select();
}

function closeFind() {
  dom.findBar.classList.add('hidden');
  clearHighlights();
  findMatches = [];
  findIndex = 0;
  dom.findCount.textContent = '';
}

function doFind(query, selectionY) {
  clearHighlights();
  findMatches = [];
  findIndex = 0;

  if (!query || !query.trim()) { dom.findCount.textContent = ''; return; }

  // Use TreeWalker for efficiency
  const treeWalker = document.createTreeWalker(dom.mdContent, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = treeWalker.nextNode())) textNodes.push(node);

  const q = query.toLowerCase();
  // Process in reverse to preserve offsets
  const hits = [];
  textNodes.forEach(n => {
    const text = n.textContent;
    const lower = text.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(q, idx)) !== -1) {
      hits.push({ node: n, start: idx, end: idx + q.length });
      idx += q.length;
    }
  });

  // Wrap each hit in a mark (reverse order)
  [...hits].reverse().forEach(m => {
    try {
      const range = document.createRange();
      range.setStart(m.node, m.start);
      range.setEnd(m.node, m.end);
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      range.surroundContents(mark);
    } catch {}
  });

  findMatches = $$('mark.search-hit', dom.mdContent);
  dom.findCount.textContent = findMatches.length > 0 ? `1 / ${findMatches.length}` : t('noResults');

  if (findMatches.length > 0) {
    if (selectionY != null) {
      // Jump to the match closest to where the user's selection was (2D distance)
      let best = 0, bestDist = Infinity;
      for (let i = 0; i < findMatches.length; i++) {
        const r = findMatches[i].getBoundingClientRect();
        const dist = Math.hypot(r.top - selectionY.top, r.left - selectionY.left);
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      findIndex = best;
    } else {
      // Jump to first match at or below the current scroll position
      const containerTop = dom.scrollContainer.getBoundingClientRect().top;
      findIndex = 0;
      for (let i = 0; i < findMatches.length; i++) {
        if (findMatches[i].getBoundingClientRect().top >= containerTop) { findIndex = i; break; }
      }
    }
    highlightCurrent();
  }
}

function highlightCurrent() {
  $$('mark.search-hit').forEach(m => m.classList.remove('current'));
  if (findMatches.length === 0) return;
  const cur = findMatches[findIndex];
  cur.classList.add('current');
  cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
  dom.findCount.textContent = `${findIndex + 1} / ${findMatches.length}`;
}

function clearHighlights() {
  $$('mark.search-hit', dom.mdContent).forEach(m => {
    const parent = m.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    }
  });
}

function findNav(dir) {
  if (findMatches.length === 0) return;
  findIndex = (findIndex + dir + findMatches.length) % findMatches.length;
  highlightCurrent();
}

// ---- AI Chat ----
function hasOpenMarkdownDocument() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab || !activeTab.path) return false;
  return /\.(md|markdown|mdown|mkd|mdx|txt)$/i.test(activeTab.path);
}

function updateChatButtonState() {
  const btn = $('#btn-chat');
  if (!btn) return;
  btn.disabled = !hasOpenMarkdownDocument();
}

function getChatDocKey() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  return activeTab?.path || '__no_file__';
}

function getPrimaryChatContextFile() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab || !activeTab.path) return null;
  return { path: activeTab.path, name: activeTab.name || activeTab.path.split(/[/\\]/).pop() };
}

function getChatContextFiles(docKey = getChatDocKey()) {
  const list = chatContextFilesByDoc[docKey];
  return Array.isArray(list) ? list : [];
}

function setChatContextFiles(list, docKey = getChatDocKey()) {
  const uniq = [];
  const seen = new Set();
  (list || []).forEach(f => {
    if (!f?.path || seen.has(f.path)) return;
    seen.add(f.path);
    uniq.push({ path: f.path, name: f.name || f.path.split(/[/\\]/).pop() });
  });
  chatContextFilesByDoc[docKey] = uniq;
  renderChatContextFiles();
}

async function addChatContextFile(filePath, fileName, docKey = getChatDocKey()) {
  if (!filePath) return false;
  const primary = getPrimaryChatContextFile();
  if (primary && primary.path === filePath) return false;
  const list = getChatContextFiles(docKey);
  if (list.some(f => f.path === filePath)) return false;
  setChatContextFiles([...list, { path: filePath, name: fileName || filePath.split(/[/\\]/).pop() }], docKey);
  return true;
}

function removeChatContextFile(filePath, docKey = getChatDocKey()) {
  const list = getChatContextFiles(docKey);
  setChatContextFiles(list.filter(f => f.path !== filePath), docKey);
}

function closeChatPathSuggest() {
  if (!dom.chatPathSuggest) return;
  dom.chatPathSuggest.classList.add('hidden');
  if (dom.chatPathSuggestList) dom.chatPathSuggestList.innerHTML = '';
  chatPathSuggestIndex = -1;
}

function getChatPathSuggestButtons() {
  if (!dom.chatPathSuggestList) return [];
  return $$('.chat-path-item', dom.chatPathSuggestList);
}

function setChatPathSuggestActive(index) {
  const buttons = getChatPathSuggestButtons();
  if (!buttons.length) {
    chatPathSuggestIndex = -1;
    return;
  }
  const next = Math.max(0, Math.min(buttons.length - 1, index));
  chatPathSuggestIndex = next;
  buttons.forEach((btn, i) => btn.classList.toggle('active', i === next));
  buttons[next].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function moveChatPathSuggestActive(delta) {
  const buttons = getChatPathSuggestButtons();
  if (!buttons.length) return;
  if (chatPathSuggestIndex < 0 || chatPathSuggestIndex >= buttons.length) {
    setChatPathSuggestActive(0);
    return;
  }
  const next = (chatPathSuggestIndex + delta + buttons.length) % buttons.length;
  setChatPathSuggestActive(next);
}

function triggerChatPathSuggestActive() {
  const buttons = getChatPathSuggestButtons();
  if (!buttons.length) return false;
  if (chatPathSuggestIndex < 0 || chatPathSuggestIndex >= buttons.length) {
    setChatPathSuggestActive(0);
  }
  buttons[chatPathSuggestIndex]?.click();
  return true;
}

function renderChatContextFiles() {
  if (!dom.chatContextList) return;
  const primary = getPrimaryChatContextFile();
  const extras = getChatContextFiles();
  const chips = [];
  if (primary) {
    chips.push(
      `<span class="chat-context-chip chat-context-primary" title="${escapeHtml(primary.path)}"><span class="label">${escapeHtml(primary.name)}</span></span>`
    );
  }
  extras.forEach(f => {
    chips.push(
      `<span class="chat-context-chip" title="${escapeHtml(f.path)}"><span class="label">${escapeHtml(f.name)}</span><button class="chat-context-remove" data-path="${escapeHtml(f.path)}" title="${escapeHtml(t('tt.delete'))}" aria-label="${escapeHtml(t('tt.delete'))}">&times;</button></span>`
    );
  });
  dom.chatContextList.innerHTML = chips.join('');
  dom.chatContextList.querySelectorAll('.chat-context-remove').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      removeChatContextFile(btn.dataset.path);
    };
  });
}

function ensureChatHistories() {
  if (!chatHistories || typeof chatHistories !== 'object') chatHistories = {};
}

function getDocConversations(docKey = getChatDocKey()) {
  ensureChatHistories();
  const list = chatHistories[docKey];
  return Array.isArray(list) ? list : [];
}

function setDocConversations(list, docKey = getChatDocKey()) {
  ensureChatHistories();
  const next = list.slice(0, 5);
  if (next.length === 0) delete chatHistories[docKey];
  else chatHistories[docKey] = next;
  window.mandy.saveChatHistories(chatHistories);
}

function purgeDocConversationHistory(docKey, opts = {}) {
  if (!docKey) return;
  setDocConversations([], docKey);
  delete activeConversationByDoc[docKey];
  delete chatContextFilesByDoc[docKey];

  // If this is the currently open doc in chat, reset visible state too.
  if (opts.clearVisible && docKey === getChatDocKey()) {
    chatMessages = [];
    chatStreaming = false;
    chatStreamContent = '';
    renderChatMessages();
    renderChatHistoryList();
  }
}

function getConversationTitle(messages) {
  const firstUser = messages.find(m => m.role === 'user' && (m.content || '').trim());
  if (!firstUser) return t('tt.chatClear');
  const oneLine = firstUser.content.replace(/\s+/g, ' ').trim();
  return oneLine.length > 56 ? oneLine.slice(0, 56) + 'Ã¢â‚¬Â¦' : oneLine;
}

function getChatPersistableMessages() {
  return chatMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));
}

function persistCurrentConversation() {
  const docKey = getChatDocKey();
  const messages = getChatPersistableMessages();
  if (messages.length === 0) return;

  const now = Date.now();
  const list = getDocConversations(docKey);
  let conversationId = activeConversationByDoc[docKey];
  if (!conversationId) {
    conversationId = `c_${now}_${Math.random().toString(36).slice(2, 8)}`;
    activeConversationByDoc[docKey] = conversationId;
  }

  const conversation = {
    id: conversationId,
    title: getConversationTitle(messages),
    updatedAt: now,
    messages,
    contextFiles: getChatContextFiles(docKey),
  };

  const idx = list.findIndex(c => c.id === conversationId);
  if (idx >= 0) list[idx] = conversation;
  else list.unshift(conversation);
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  setDocConversations(list.slice(0, 5), docKey);
  renderChatHistoryList();
}

function restoreChatPromptHistoryFromMessages(messages) {
  const out = [];
  const list = Array.isArray(messages) ? messages : [];
  for (const m of list) {
    if (!m || m.role !== 'user') continue;
    const v = String(m.content || '').trim();
    if (!v) continue;
    if (out[out.length - 1] !== v) out.push(v);
  }
  chatPromptHistory = out.slice(-100);
  chatPromptHistoryIndex = -1;
  chatPromptDraft = '';
}

function loadConversation(conversationId, docKey = getChatDocKey()) {
  const list = getDocConversations(docKey);
  const convo = list.find(c => c.id === conversationId);
  if (!convo) return false;
  activeConversationByDoc[docKey] = convo.id;
  chatSessionDocKey = docKey;
  chatMessages = Array.isArray(convo.messages) ? convo.messages.map(m => ({ role: m.role, content: m.content })) : [];
  restoreChatPromptHistoryFromMessages(chatMessages);
  setChatContextFiles(Array.isArray(convo.contextFiles) ? convo.contextFiles : [], docKey);
  chatStreaming = false;
  chatStreamContent = '';
  dom.chatSend.disabled = false;
  renderChatMessages();
  renderChatHistoryList();
  return true;
}

function removeConversation(conversationId, docKey = getChatDocKey()) {
  const list = getDocConversations(docKey);
  const next = list.filter(c => c.id !== conversationId);
  if (next.length === list.length) return false;

  setDocConversations(next, docKey);
  if (activeConversationByDoc[docKey] === conversationId) {
    activeConversationByDoc[docKey] = null;
    if (docKey === getChatDocKey()) loadLatestConversation(docKey);
  }
  renderChatHistoryList();
  return true;
}

function loadLatestConversation(docKey = getChatDocKey()) {
  const list = getDocConversations(docKey);
  if (list.length === 0) {
    activeConversationByDoc[docKey] = null;
    chatSessionDocKey = docKey;
    chatMessages = [];
    setChatContextFiles([], docKey);
    chatStreaming = false;
    chatStreamContent = '';
    chatPromptHistory = [];
    chatPromptHistoryIndex = -1;
    chatPromptDraft = '';
    renderChatMessages();
    renderChatHistoryList();
    return;
  }
  const activeId = activeConversationByDoc[docKey];
  if (activeId && loadConversation(activeId, docKey)) return;
  loadConversation(list[0].id, docKey);
}

function closeChatHistoryMenu() {
  dom.chatHistoryMenu?.classList.add('hidden');
}

function toggleChatHistoryMenu() {
  if (!dom.chatHistoryMenu) return;
  const willOpen = dom.chatHistoryMenu.classList.contains('hidden');
  if (!willOpen) {
    closeChatHistoryMenu();
    return;
  }
  renderChatHistoryList();
  dom.chatHistoryMenu.classList.remove('hidden');
}

function renderChatHistoryList() {
  if (!dom.chatHistoryList) return;
  const docKey = getChatDocKey();
  const list = getDocConversations(docKey);
  const activeId = activeConversationByDoc[docKey];
  dom.chatHistoryList.innerHTML = '';
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'chat-history-empty';
    empty.textContent = t('chat.historyEmpty');
    dom.chatHistoryList.appendChild(empty);
    return;
  }
  list.forEach(c => {
    const item = document.createElement('div');
    item.className = 'chat-history-item';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    if (c.id === activeId) item.classList.add('active');
    const ts = c.updatedAt ? relativeTime(c.updatedAt) : '';
    item.innerHTML = `<div class="chat-history-main"><span class="chat-history-title">${escapeHtml(c.title || t('tt.chatClear'))}</span><span class="chat-history-meta">${escapeHtml(ts)}</span></div>`;
    item.onclick = () => {
      loadConversation(c.id, docKey);
      closeChatHistoryMenu();
    };
    item.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        loadConversation(c.id, docKey);
        closeChatHistoryMenu();
      }
    };

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'chat-history-remove';
    removeBtn.title = t('tt.delete');
    removeBtn.setAttribute('aria-label', t('tt.delete'));
    removeBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removeConversation(c.id, docKey);
    };

    item.appendChild(removeBtn);
    dom.chatHistoryList.appendChild(item);
  });
}

function openChat() {
  if (!hasOpenMarkdownDocument()) return;
  // If AI not configured, show config prompt instead of the chat panel
  if (!cfg.aiApiUrl || !cfg.aiApiKey) {
    $('#chat-config-overlay').classList.remove('hidden');
    return;
  }
  dom.chatOverlay.classList.remove('hidden');
  dom.body.classList.add('chat-open');
  refreshChatSessionAutoApproveState();
  const docKey = getChatDocKey();
  const hasRuntimeState = chatMessages.length > 0 || chatStreaming || !!chatStreamContent || chatPaused;
  const preserveRuntime = hasRuntimeState && chatSessionDocKey === docKey;
  if (preserveRuntime) {
    renderChatMessages();
    renderChatHistoryList();
  } else {
    loadLatestConversation(docKey);
  }
  updateChatFileBadge();
  renderChatContextFiles();
  requestAnimationFrame(() => {
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  });
  dom.chatInput.focus();
}

function closeChat() {
  dom.chatOverlay.classList.add('hidden');
  dom.body.classList.remove('chat-open');
  closeChatHistoryMenu();
  closeChatPathSuggest();
}

function clearChat() {
  const docKey = getChatDocKey();
  activeConversationByDoc[docKey] = null;
  chatSessionDocKey = docKey;
  chatMessages = [];
  chatApprovalExpanded.clear();
  setChatContextFiles([]);
  chatStreaming = false;
  chatStreamContent = '';
  chatPaused = false;
  syncChatInputPlaceholder();
  renderChatMessages();
  renderChatHistoryList();
  closeChatHistoryMenu();
  dom.chatInput.focus();
}

function updateChatFileBadge() {
  renderChatContextFiles();
}

function renderChatAutoApproveToggle() {
  if (!dom.chatAutoApproveToggle) return;
  const enabled = chatSessionAutoApprove === true;
  dom.chatAutoApproveToggle.classList.toggle('active', enabled);
  dom.chatAutoApproveToggle.textContent = enabled ? t('chat.autoApproveOn') : t('chat.autoApproveOff');
  const title = enabled ? t('chat.autoApproveTurnOff') : t('chat.autoApproveTurnOn');
  dom.chatAutoApproveToggle.title = title;
  dom.chatAutoApproveToggle.setAttribute('aria-label', title);
}

function buildApprovalPreviewLines(rawText) {
  const source = String(rawText || '').replace(/\r\n/g, '\n').trim();
  if (!source) return [];
  return source.split('\n').map(line => line.replace(/\t/g, '    '));
}

function buildChatApprovalDiffRows(msg) {
  const details = msg?.details || {};
  const actionRaw = String(details.action || 'write').toLowerCase();
  if (Array.isArray(details.diffRows) && details.diffRows.length > 0) {
    return details.diffRows
      .map(r => ({
        kind: r && (r.kind === 'del' || r.kind === 'meta') ? r.kind : 'add',
        text: String(r?.text ?? ''),
        oldLine: (() => {
          const n = Number(r?.oldLine);
          return Number.isInteger(n) && n > 0 ? n : null;
        })(),
        newLine: (() => {
          const n = Number(r?.newLine);
          return Number.isInteger(n) && n > 0 ? n : null;
        })(),
      }));
  }
  const rows = [];

  if (actionRaw === 'edit') {
    const beforeLines = buildApprovalPreviewLines(details.searchPreview);
    const afterLines = buildApprovalPreviewLines(details.replacePreview);
    beforeLines.forEach(line => rows.push({kind: 'del', text: line, oldLine: null, newLine: null}));
    afterLines.forEach(line => rows.push({kind: 'add', text: line, oldLine: null, newLine: null}));
  } else if (actionRaw === 'write' || actionRaw === 'append') {
    const addLines = buildApprovalPreviewLines(details.contentPreview);
    addLines.forEach(line => rows.push({kind: 'add', text: line, oldLine: null, newLine: null}));
  }
  return rows;
}

function renderChatApprovalDiff(msg) {
  const rows = buildChatApprovalDiffRows(msg);
  if (rows.length === 0) return '';
  const approvalId = String(msg?.approvalId || '');
  const expanded = approvalId ? chatApprovalExpanded.has(approvalId) : false;
  const collapsedLimit = 6;
  const hasOverflow = rows.length > collapsedLimit;
  const visibleRows = expanded || !hasOverflow ? rows : rows.slice(0, collapsedLimit);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);
  const htmlRows = visibleRows.map(row => (
    `<div class="chat-approval-diff-row ${row.kind === 'add' ? 'add' : (row.kind === 'meta' ? 'meta' : 'del')}">` +
      `<span class="chat-approval-diff-line old">${row.oldLine ?? ''}</span>` +
      `<span class="chat-approval-diff-line new">${row.newLine ?? ''}</span>` +
      `<span class="chat-approval-diff-sign">${row.kind === 'meta' ? '' : (row.kind === 'add' ? '+' : '-')}</span>` +
      `<code>${escapeHtml(row.text)}</code>` +
    `</div>`
  )).join('');

  const toggle = hasOverflow
    ? `<button type="button" class="chat-approval-diff-toggle" data-id="${escapeHtml(approvalId)}" data-expanded="${expanded ? '1' : '0'}">` +
        `${escapeHtml(expanded ? t('chat.perm.showLess') : tf('chat.perm.showMoreLines', {count: hiddenCount}))}` +
      `</button>`
    : '';

  return `<div class="chat-approval-diff">${htmlRows}</div>${toggle}`;
}

async function refreshChatSessionAutoApproveState() {
  try {
    const res = await window.mandy.getSessionAutoApprove();
    if (typeof res?.enabled === 'boolean') chatSessionAutoApprove = res.enabled;
  } catch {}
  renderChatAutoApproveToggle();
}

function renderChatApprovalCard(msg) {
  const details = msg?.details || {};
  const actionRaw = String(details.action || 'write').toLowerCase();
  const actionKey = `chat.perm.action.${actionRaw}`;
  const actionLabel = escapeHtml(t(actionKey) === actionKey ? actionRaw : t(actionKey));
  const filePath = escapeHtml(String(details.path || t('chat.perm.unknownPath')));
  const status = String(msg?.status || 'pending').toLowerCase();
  const canAct = status === 'pending';

  let meta = '';
  if (actionRaw === 'edit') {
    const planned = Number(details.replacements);
    if (Number.isFinite(planned) && planned > 0) {
      meta = tf('chat.perm.metaReplaceCount', {count: planned});
    } else if (details.searchPreview || details.replacePreview) {
      meta = t('chat.perm.metaReplaceText');
    }
  } else {
    const chars = Number(details.contentLength);
    if (Number.isFinite(chars) && chars > 0) meta = tf('chat.perm.metaChars', {count: chars.toLocaleString()});
  }
  const diffPreviewHtml = renderChatApprovalDiff(msg);

  const statusText = status === 'approved'
    ? t('chat.perm.statusApproved')
    : status === 'denied'
      ? t('chat.perm.statusDenied')
      : status === 'timeout'
        ? t('chat.perm.statusTimeout')
        : status === 'cancelled'
          ? t('chat.perm.statusCancelled')
          : status === 'processing'
            ? t('chat.perm.statusProcessing')
            : t('chat.perm.statusPending');
  const statusClass = `status-${escapeHtml(status)}`;

  const buttons = canAct
    ? `<div class="chat-approval-actions">` +
        `<button type="button" class="chat-approval-action allow-session" data-id="${escapeHtml(msg.approvalId || '')}" data-decision="allow-session">${escapeHtml(t('chat.perm.allowSession'))}</button>` +
        `<button type="button" class="chat-approval-action allow" data-id="${escapeHtml(msg.approvalId || '')}" data-decision="allow">${escapeHtml(t('chat.perm.allow'))}</button>` +
        `<button type="button" class="chat-approval-action deny" data-id="${escapeHtml(msg.approvalId || '')}" data-decision="deny">${escapeHtml(t('chat.perm.deny'))}</button>` +
      `</div>`
    : '';

  return (
    `<div class="chat-approval-card">` +
      `<div class="chat-approval-head">` +
        `<div class="chat-approval-head-left">` +
          `<span class="chat-approval-icon" aria-hidden="true">` +
            `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 5.2-3.4 8.7-7 10-3.6-1.3-7-4.8-7-10V6l7-3z" stroke="currentColor" stroke-width="1.7"/><path d="M9.2 12.3l1.9 1.9 3.7-3.9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
          `</span>` +
          `<span class="chat-approval-title">${escapeHtml(t('chat.perm.title'))}</span>` +
        `</div>` +
        `<span class="chat-approval-status ${statusClass}">${escapeHtml(statusText)}</span>` +
      `</div>` +
      `<div class="chat-approval-body">` +
        `<div class="chat-approval-action-line"><span class="verb">${actionLabel}</span></div>` +
        `<div class="chat-approval-path"><code>${filePath}</code></div>` +
        (meta ? `<div class="chat-approval-meta">${escapeHtml(meta)}</div>` : '') +
        diffPreviewHtml +
      `</div>` +
      buttons +
    `</div>`
  );
}

function renderChatMutationCard(msg) {
  const filePath = String(msg?.path || '');
  const fileName = basenameOf(filePath);
  return (
    `<div class="chat-mutation-card">` +
      `<div class="chat-mutation-title">${escapeHtml(t('chat.fileMutatedTitle'))}</div>` +
      `<div class="chat-mutation-desc">${escapeHtml(fileName || filePath)}</div>` +
      `<div class="chat-mutation-path"><code>${escapeHtml(filePath)}</code></div>` +
      `<button type="button" class="chat-mutation-open" data-path="${escapeHtml(filePath)}">${escapeHtml(t('btn.openFile'))}</button>` +
    `</div>`
  );
}

// Lightweight update during streaming — only touches the streaming bubble,
// avoiding a full DOM rebuild on every chunk.
let _streamingRafPending = false;
function updateStreamingContent() {
  if (_streamingRafPending) return;
  _streamingRafPending = true;
  requestAnimationFrame(() => {
    _streamingRafPending = false;
    if (!chatStreaming) return;

    const distanceFromBottom = dom.chatMessages.scrollHeight - dom.chatMessages.scrollTop - dom.chatMessages.clientHeight;
    const wasNearBottom = distanceFromBottom < 40;

    // Find or create the streaming element
    let streamEl = dom.chatMessages.querySelector('.chat-msg-streaming');
    const typing = dom.chatMessages.querySelector('.chat-typing');

    if (chatStreamContent) {
      if (!streamEl) {
        // Remove typing dots if present, replace with streaming message
        if (typing) typing.remove();
        streamEl = document.createElement('div');
        streamEl.className = 'chat-msg chat-msg-assistant chat-msg-streaming';
        // Insert before the agent-working status if it exists, else append
        const workingEl = dom.chatMessages.querySelector('.chat-agent-working');
        if (workingEl) dom.chatMessages.insertBefore(streamEl, workingEl);
        else dom.chatMessages.appendChild(streamEl);
      }
      streamEl.innerHTML = formatStreamingAssistantMessage(chatStreamContent);
    }

    if (wasNearBottom) {
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    }
  });
}

function renderChatMessages() {
  const i18nSafe = (key, fallback) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const distanceFromBottom = dom.chatMessages.scrollHeight - dom.chatMessages.scrollTop - dom.chatMessages.clientHeight;
  const wasNearBottom = distanceFromBottom < 40;

  // Keep the empty state element, clear everything else
  const children = [...dom.chatMessages.children];
  children.forEach(c => { if (c.id !== 'chat-empty') c.remove(); });

  if (chatMessages.length === 0 && !chatStreaming) {
    dom.chatEmpty.classList.remove('hidden');
    // Show config hint if AI not configured
    const hint = $('#chat-empty-hint');
    const cfgBtn = $('#chat-open-settings');
    const isConfigured = cfg.aiApiUrl && cfg.aiApiKey;
    if (hint) {
      hint.textContent = isConfigured
        ? t('chat.emptyHint')
        : t('chat.configNeeded');
    }
    if (cfgBtn) cfgBtn.classList.toggle('hidden', !!isConfigured);
    return;
  }
  dom.chatEmpty.classList.add('hidden');

  chatMessages.forEach(msg => {
    const el = document.createElement('div');
    if (msg.role === 'user') {
      el.className = 'chat-msg chat-msg-user';
      el.textContent = msg.content;
    } else if (msg.role === 'error') {
      el.className = 'chat-msg chat-msg-error';
      el.innerHTML = renderChatErrorCard(msg.error || normalizeChatError(msg.content));
    } else if (msg.role === 'approval') {
      el.className = 'chat-msg chat-msg-approval';
      el.innerHTML = renderChatApprovalCard(msg);
    } else if (msg.role === 'mutation') {
      el.className = 'chat-msg chat-msg-mutation';
      el.innerHTML = renderChatMutationCard(msg);
    } else {
      el.className = 'chat-msg chat-msg-assistant';
      el.innerHTML = formatAssistantMessage(msg.content);
    }
    dom.chatMessages.appendChild(el);
  });

  // If currently streaming, add a partial message or typing indicator
  const hasPendingApproval = chatMessages.some(m => m.role === 'approval' && (m.status === 'pending' || m.status === 'processing'));
  if (chatStreaming && !hasPendingApproval) {
    const gap = document.createElement('div');
    gap.className = 'chat-stream-gap';
    dom.chatMessages.appendChild(gap);

    if (chatStreamContent) {
      const el = document.createElement('div');
      el.className = 'chat-msg chat-msg-assistant chat-msg-streaming';
      el.innerHTML = formatStreamingAssistantMessage(chatStreamContent);
      dom.chatMessages.appendChild(el);
    } else {
      const dots = document.createElement('div');
      dots.className = 'chat-typing';
      dots.innerHTML = '<span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span>';
      dom.chatMessages.appendChild(dots);
    }
  }
  if (chatStreaming) {
    const status = document.createElement('div');
    status.className = 'chat-agent-working';
    status.innerHTML = `<span class="chat-agent-working-dot"></span><span>${escapeHtml(i18nSafe('chat.agentWorking', 'Agent is still working...'))}</span>`;
    dom.chatMessages.appendChild(status);
  }
  if (chatPaused && !chatStreaming) {
    const paused = document.createElement('div');
    paused.className = 'chat-agent-paused';
    paused.innerHTML =
      `<span class="chat-agent-paused-row">` +
        `<span class="chat-agent-paused-dot"></span>` +
        `<span class="chat-agent-paused-title">${escapeHtml(i18nSafe('chat.agentPaused', 'Agent paused'))}</span>` +
      `</span>`;
    dom.chatMessages.appendChild(paused);
  }

  // Keep sticky scroll whenever user is near the bottom (including streaming).
  if (wasNearBottom) {
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }
}

function normalizeChatError(raw) {
  const msg = String(raw || '').trim();
  const lower = msg.toLowerCase();

  if (!msg || lower.includes('please configure ai api url') || lower.includes('invalid api url')) {
    return {
      title: t('chat.err.configTitle'),
      description: t('chat.err.configDesc'),
      technical: msg || '',
      canOpenSettings: true,
    };
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('api key') || lower.includes('invalid_api_key')) {
    return {
      title: t('chat.err.authTitle'),
      description: t('chat.err.authDesc'),
      technical: msg,
      canOpenSettings: true,
    };
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      title: t('chat.err.rateTitle'),
      description: t('chat.err.rateDesc'),
      technical: msg,
      canOpenSettings: true,
    };
  }
  if (/(enotfound|econnrefused|econnreset|etimedout|network|fetch failed|socket hang up)/i.test(msg)) {
    return {
      title: t('chat.err.networkTitle'),
      description: t('chat.err.networkDesc'),
      technical: msg,
      canOpenSettings: true,
    };
  }
  if (/(denied by user|timed out and denied|write action denied|edit action denied)/i.test(msg)) {
    return {
      title: t('chat.perm.errorTitle'),
      description: t('chat.perm.errorDesc'),
      technical: msg || '',
      canOpenSettings: false,
    };
  }
  return {
    title: t('chat.err.genericTitle'),
    description: t('chat.err.genericDesc'),
    technical: msg || '',
    canOpenSettings: true,
  };
}

function renderChatErrorCard(err) {
  const e = err || {};
  const title = escapeHtml(e.title || t('chat.err.genericTitle'));
  const desc = escapeHtml(e.description || t('chat.err.genericDesc'));
  const tech = escapeHtml(e.technical || '');
  const action = e.canOpenSettings
    ? `<button type="button" class="chat-error-action">${escapeHtml(t('chat.openSettings'))}</button>`
    : '';
  return (
    `<div class="chat-error-card">` +
      `<div class="chat-error-title">${title}</div>` +
      `<div class="chat-error-desc">${desc}</div>` +
      (tech ? `<div class="chat-error-tech">${tech}</div>` : '') +
      action +
    `</div>`
  );
}

function formatChatInlineMarkdown(input) {
  let text = escapeHtml(input || '');
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.push(`<code>${code}</code>`) - 1;
    return `@@CHATCODE${idx}@@`;
  });
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return text.replace(/@@CHATCODE(\d+)@@/g, (_, i) => inlineCodes[Number(i)] || '');
}

function formatChatBlockMarkdown(mdText) {
  const raw = (mdText || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';

  const blocks = [];
  const lines = raw.split('\n');
  const scanned = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceOpen = line.match(/^\s*(`{3,}|~{3,})([^\n]*)$/);
    if (fenceOpen) {
      const marker = fenceOpen[1][0];
      const markerLen = fenceOpen[1].length;
      const language = (fenceOpen[2] || '').trim();
      i += 1;
      const codeLines = [];
      while (i < lines.length) {
        const close = lines[i].match(/^\s*(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === marker && close[1].length >= markerLen) {
          break;
        }
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      const body = codeLines.join('\n').replace(/\n$/, '');
      const html = `<pre><code class="${language ? `language-${escapeHtml(language)}` : ''}">${escapeHtml(body)}</code></pre>`;
      const idx = blocks.push(html) - 1;
      scanned.push(`@@CHATBLOCK${idx}@@`);
      continue;
    }

    const indented = line.match(/^(?:\t| {4})(.*)$/);
    if (indented) {
      const codeLines = [indented[1]];
      i += 1;
      while (i < lines.length) {
        const nextIndented = lines[i].match(/^(?:\t| {4})(.*)$/);
        if (!nextIndented) break;
        codeLines.push(nextIndented[1]);
        i += 1;
      }
      const body = codeLines.join('\n');
      const html = `<pre><code>${escapeHtml(body)}</code></pre>`;
      const idx = blocks.push(html) - 1;
      scanned.push(`@@CHATBLOCK${idx}@@`);
      continue;
    }

    scanned.push(line);
    i += 1;
  }
  const withCodePlaceholders = scanned.join('\n');

  const chunks = withCodePlaceholders.split(/\n{2,}/);
  const html = chunks.map(chunk => {
    const block = chunk.trim();
    if (!block) return '';
    const heading = block.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const lvl = heading[1].length;
      return `<h${lvl}>${formatChatInlineMarkdown(heading[2].trim())}</h${lvl}>`;
    }
    const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length > 0 && lines.every(l => /^[-*+]\s+/.test(l))) {
      return `<ul>${lines.map(l => `<li>${formatChatInlineMarkdown(l.replace(/^[-*+]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    if (lines.length > 0 && lines.every(l => /^\d+\.\s+/.test(l))) {
      return `<ol>${lines.map(l => `<li>${formatChatInlineMarkdown(l.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
    }
    if (lines.length > 0 && lines.every(l => /^>\s?/.test(l))) {
      return `<blockquote>${lines.map(l => `<p>${formatChatInlineMarkdown(l.replace(/^>\s?/, ''))}</p>`).join('')}</blockquote>`;
    }
    if (/^@@CHATBLOCK\d+@@$/.test(block)) return block;
    return `<p>${formatChatInlineMarkdown(block).replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('');

  return html.replace(/@@CHATBLOCK(\d+)@@/g, (_, i) => blocks[Number(i)] || '');
}

function formatStreamingAssistantMessage(text) {
  const src = (text || '').replace(/\r\n/g, '\n');
  if (!src) return '';

  const fenceMatches = [...src.matchAll(/^```.*$/gm)];
  const hasUnclosedFence = fenceMatches.length % 2 === 1;
  const lastFenceStart = hasUnclosedFence ? fenceMatches[fenceMatches.length - 1].index : -1;

  // Consider fully completed lines as stable during streaming.
  let stableEnd = src.lastIndexOf('\n');
  stableEnd = stableEnd >= 0 ? stableEnd + 1 : 0;
  if (hasUnclosedFence && lastFenceStart >= 0 && stableEnd > lastFenceStart) stableEnd = lastFenceStart;
  if (stableEnd < 0) stableEnd = 0;

  const stable = src.slice(0, stableEnd);
  const tail = src.slice(stableEnd);
  const stableHtml = stable.trim() ? formatChatBlockMarkdown(stable) : '';
  const tailHtml = tail ? `<p>${escapeHtml(tail).replace(/\n/g, '<br>')}</p>` : '';
  return stableHtml + tailHtml;
}

function formatAssistantMessage(text) {
  const key = text || '';
  if (chatMarkdownCache.has(key)) return chatMarkdownCache.get(key);
  queueAssistantMarkdownRender(key);
  return formatChatBlockMarkdown(key);
}

function normalizeChatHtml(html) {
  return html || '';
}

function queueAssistantMarkdownRender(text) {
  const key = text || '';
  if (!key || chatMarkdownCache.has(key) || chatMarkdownInFlight.has(key)) return;
  chatMarkdownInFlight.add(key);
  window.mandy.renderMarkdown(key, null)
    .then(html => {
      chatMarkdownCache.set(key, normalizeChatHtml(html));
      renderChatMessages();
    })
    .catch(() => {})
    .finally(() => chatMarkdownInFlight.delete(key));
}

async function buildChatContextPayload() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  const files = [];
  if (activeTab && activeTab.path) {
    files.push({
      path: activeTab.path,
      name: activeTab.name,
      content: activeTab.content || dom.editorTextarea.value || '',
      primary: true,
    });
  }
  const extras = getChatContextFiles().filter(f => !activeTab || f.path !== activeTab.path);
  for (const f of extras) {
    try {
      const res = await window.mandy.readFile(f.path);
      if (!res?.error && typeof res.content === 'string') {
        files.push({ path: f.path, name: f.name, content: res.content, primary: false });
      }
    } catch {}
  }
  const primaryPath = files[0]?.path || '';
  const primaryDir = primaryPath ? primaryPath.replace(/[\\/][^\\/]+$/, '') : '';
  const workingDir = loadedFolderPath || primaryDir || '';
  return {
    primaryPath,
    workingDir,
    files,
  };
}

async function submitChatPrompt(text, opts = {}) {
  const clearInput = opts.clearInput !== false;
  const prompt = (text || '').trim();
  if (!prompt || chatStreaming) return false;

  // Require AI config before sending
  if (!cfg.aiApiUrl || !cfg.aiApiKey) {
    openChat();
    if (!dom.chatOverlay.classList.contains('hidden')) {
      chatMessages.push({ role: 'error', content: t('chat.configNeeded') });
      renderChatMessages();
    }
    return false;
  }

  chatMessages.push({ role: 'user', content: prompt });
  chatSessionDocKey = getChatDocKey();
  chatPaused = false;
  syncChatInputPlaceholder();
  if (clearInput) {
    dom.chatInput.value = '';
    dom.chatInput.style.height = 'auto';
  }
  chatStreaming = true;
  chatStreamContent = '';
  dom.chatSend.disabled = true;
  renderChatMessages();
  persistCurrentConversation();

  // Send only user/assistant messages (not error)
  const apiMessages = chatMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  const contextPayload = await buildChatContextPayload();
  window.mandy.sendChat(apiMessages, contextPayload);
  return true;
}

async function processQueuedChatPrompts() {
  if (chatStreaming) return;
  const next = chatQueuedPrompts.shift();
  if (!next) return;
  await submitChatPrompt(next, { clearInput: false });
}

function setChatInputValue(value) {
  if (!dom.chatInput) return;
  dom.chatInput.value = value || '';
  dom.chatInput.style.height = 'auto';
  dom.chatInput.style.height = Math.min(dom.chatInput.scrollHeight, 120) + 'px';
}

function rememberChatPrompt(prompt) {
  const v = String(prompt || '').trim();
  if (!v) return;
  if (chatPromptHistory[chatPromptHistory.length - 1] !== v) {
    chatPromptHistory.push(v);
    if (chatPromptHistory.length > 100) chatPromptHistory = chatPromptHistory.slice(-100);
  }
  chatPromptHistoryIndex = -1;
  chatPromptDraft = '';
}

function navigateChatPromptHistory(direction) {
  if (!dom.chatInput || chatPromptHistory.length === 0) return false;
  const ta = dom.chatInput;
  if (ta.selectionStart !== ta.selectionEnd) return false;

  if (direction < 0) {
    if (ta.selectionStart !== 0) return false;
    if (chatPromptHistoryIndex === -1) {
      chatPromptDraft = ta.value || '';
      chatPromptHistoryIndex = chatPromptHistory.length - 1;
    } else if (chatPromptHistoryIndex > 0) {
      chatPromptHistoryIndex -= 1;
    }
    setChatInputValue(chatPromptHistory[chatPromptHistoryIndex] || '');
    return true;
  }

  if (chatPromptHistoryIndex === -1) return false;
  if (ta.selectionStart !== ta.value.length) return false;
  if (chatPromptHistoryIndex < chatPromptHistory.length - 1) {
    chatPromptHistoryIndex += 1;
    setChatInputValue(chatPromptHistory[chatPromptHistoryIndex] || '');
  } else {
    chatPromptHistoryIndex = -1;
    setChatInputValue(chatPromptDraft || '');
  }
  return true;
}

async function sendChatMessage() {
  const text = dom.chatInput.value.trim();
  if (!text) return;
  rememberChatPrompt(text);
  if (chatStreaming) {
    chatQueuedPrompts.push(text);
    dom.chatInput.value = '';
    dom.chatInput.style.height = 'auto';
    return;
  }
  await submitChatPrompt(text, { clearInput: true });
}

function getChatPathQuery() {
  const raw = dom.chatInput?.value || '';
  const m = raw.match(/^\s*(\/[^\s]*)$/);
  return m ? m[1] : '';
}

async function refreshChatPathSuggestions() {
  const query = getChatPathQuery();
  if (!query) {
    closeChatPathSuggest();
    return;
  }
  const primary = getPrimaryChatContextFile();
  if (!primary?.path) {
    closeChatPathSuggest();
    return;
  }
  const reqId = ++chatSuggestReqId;
  let items = [];
  try {
    items = await window.mandy.suggestChatContextFiles(query, primary.path);
  } catch {}
  if (reqId !== chatSuggestReqId) return;
  if (!dom.chatPathSuggest || !dom.chatPathSuggestList) return;

  dom.chatPathSuggestList.innerHTML = '';
  chatPathSuggestIndex = -1;
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'chat-path-empty';
    empty.textContent = t('chat.pathNoMatch');
    dom.chatPathSuggestList.appendChild(empty);
    dom.chatPathSuggest.classList.remove('hidden');
    return;
  }
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-path-item';
    btn.textContent = item.relPath || item.name || item.path;
    btn.onclick = async () => {
      if (item.type === 'dir') {
        dom.chatInput.value = item.relPath || '/';
        dom.chatInput.style.height = 'auto';
        dom.chatInput.style.height = Math.min(dom.chatInput.scrollHeight, 120) + 'px';
        dom.chatInput.focus();
        refreshChatPathSuggestions();
      } else {
        const added = await addChatContextFile(item.path, item.name);
        if (added) {
          dom.chatInput.value = (dom.chatInput.value || '').replace(/^\s*\/[^\s]*\s*/, '');
          dom.chatInput.style.height = 'auto';
          dom.chatInput.style.height = Math.min(dom.chatInput.scrollHeight, 120) + 'px';
        }
        closeChatPathSuggest();
        dom.chatInput.focus();
      }
    };
    btn.addEventListener('mouseenter', () => {
      const buttons = getChatPathSuggestButtons();
      const idx = buttons.indexOf(btn);
      if (idx >= 0) setChatPathSuggestActive(idx);
    });
    dom.chatPathSuggestList.appendChild(btn);
  });
  setChatPathSuggestActive(0);
  dom.chatPathSuggest.classList.remove('hidden');
}

function prefillChatInput(text) {
  if (!dom.chatInput) return;
  dom.chatInput.value = text || '';
  dom.chatInput.style.height = 'auto';
  dom.chatInput.style.height = Math.min(dom.chatInput.scrollHeight, 120) + 'px';
  dom.chatInput.focus();
  const end = dom.chatInput.value.length;
  dom.chatInput.setSelectionRange(end, end);
}

function askAiAboutSpan(selectionText) {
  if (!selectionText || !selectionText.trim()) return;
  openChat();
  if (dom.chatOverlay.classList.contains('hidden')) return;
  prefillChatInput(buildAskAiSpanPrompt(selectionText));
}

function setupChatListeners() {
  window.mandy.onChatChunk(delta => {
    chatStreamContent += delta;
    updateStreamingContent();
  });

  window.mandy.onChatDone(() => {
    if (chatStreamContent) {
      chatMessages.push({ role: 'assistant', content: chatStreamContent });
    }
    chatStreaming = false;
    chatStreamContent = '';
    dom.chatSend.disabled = false;
    persistCurrentConversation();
    renderChatMessages();
    processQueuedChatPrompts();
  });

  window.mandy.onChatError(msg => {
    chatMessages.push({ role: 'error', error: normalizeChatError(msg), content: msg });
    chatStreaming = false;
    chatStreamContent = '';
    dom.chatSend.disabled = false;
    renderChatMessages();
    processQueuedChatPrompts();
  });

  window.mandy.onChatPermissionRequest(({ id, details }) => {
    if (!id) return;
    if (dom.chatOverlay.classList.contains('hidden')) openChat();
    const existing = chatMessages.find(m => m.role === 'approval' && m.approvalId === id);
    if (existing) {
      existing.status = 'pending';
      existing.details = details || existing.details || {};
    } else {
      chatMessages.push({
        role: 'approval',
        approvalId: id,
        status: 'pending',
        details: details || {},
      });
    }
    renderChatMessages();
  });

  window.mandy.onChatPermissionResolved(({ id, approved, reason }) => {
    if (!id) return;
    const msg = chatMessages.find(m => m.role === 'approval' && m.approvalId === id);
    if (!msg) return;
    if (approved) msg.status = 'approved';
    else if (reason === 'timeout') msg.status = 'timeout';
    else if (reason === 'cancelled') msg.status = 'cancelled';
    else msg.status = 'denied';
    renderChatMessages();
  });
}

function setupChatResizer() {
  const resizer = dom.chatResizer;
  const panel = dom.chatPanel;
  if (!resizer || !panel || resizer.dataset.bound === '1') return;
  resizer.dataset.bound = '1';

  function clampWidth(w) {
    const minW = 320;
    const maxW = Math.min(900, window.innerWidth - 40);
    return Math.max(minW, Math.min(maxW, w));
  }

  function setChatWidth(w) {
    document.documentElement.style.setProperty('--chat-w', clampWidth(w) + 'px');
  }

  resizer.addEventListener('mousedown', e => {
    const startX = e.clientX;
    const startW = panel.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      // Chat is right-anchored, so moving left increases width.
      const w = clampWidth(startW - (ev.clientX - startX));
      setChatWidth(w);
    }
    function onUp() {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      cfg.chatWidth = clampWidth(panel.offsetWidth || 420);
      autosave();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });

  window.addEventListener('resize', () => {
    const currentW = parseFloat(getComputedStyle(panel).width) || cfg.chatWidth || 420;
    setChatWidth(currentW);
  });
}

// ---- Settings ----
function openSettings() {
  dom.settingsOverlay.classList.remove('hidden');
  syncSettingsUI();
}

function closeSettings() {
  dom.settingsOverlay.classList.add('hidden');
  closeAiModelMenu();
}

function setAiModelActiveOption() {
  const current = ($('#cfg-ai-model')?.value || '').trim().toLowerCase();
  $$('#cfg-ai-model-menu .model-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.model.toLowerCase() === current);
  });
}

function openAiModelMenu() {
  const menu = $('#cfg-ai-model-menu');
  const toggle = $('#cfg-ai-model-toggle');
  if (!menu || !toggle) return;
  setAiModelActiveOption();
  menu.classList.remove('hidden');
  toggle.setAttribute('aria-expanded', 'true');
}

function closeAiModelMenu() {
  const menu = $('#cfg-ai-model-menu');
  const toggle = $('#cfg-ai-model-toggle');
  if (!menu || !toggle) return;
  menu.classList.add('hidden');
  toggle.setAttribute('aria-expanded', 'false');
}

function setupAiModelPicker() {
  const picker = $('#ai-model-picker');
  const input = $('#cfg-ai-model');
  const toggle = $('#cfg-ai-model-toggle');
  const menu = $('#cfg-ai-model-menu');
  if (!picker || !input || !toggle || !menu || picker.dataset.bound === '1') return;
  picker.dataset.bound = '1';

  input.addEventListener('focus', openAiModelMenu);
  input.addEventListener('click', openAiModelMenu);
  input.addEventListener('input', setAiModelActiveOption);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); openAiModelMenu(); }
    if (e.key === 'Escape') { e.preventDefault(); closeAiModelMenu(); }
  });

  toggle.onclick = () => {
    if (menu.classList.contains('hidden')) openAiModelMenu();
    else closeAiModelMenu();
    input.focus();
  };

  menu.addEventListener('mousedown', e => e.preventDefault());
  menu.addEventListener('click', e => {
    const option = e.target.closest('.model-option');
    if (!option) return;
    input.value = option.dataset.model || '';
    setAiModelActiveOption();
    closeAiModelMenu();
    autosave();
    input.focus();
  });

  document.addEventListener('mousedown', e => {
    if (!picker.contains(e.target)) closeAiModelMenu();
  });
}

function syncSettingsUI() {
  $$('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === cfg.theme));
  $$('.font-btn').forEach(b => b.classList.toggle('active', b.dataset.font === cfg.fontFamily));
  $$('.palette-btn').forEach(b => b.classList.toggle('active', b.dataset.palette === (cfg.palette || 'amber')));
  const langEl = $('#cfg-language');
  if (langEl) langEl.value = cfg.language || 'en';
  $('#cfg-font-size').value = cfg.fontSize || 18;
  $('#val-font-size').textContent = (cfg.fontSize || 18) + 'px';
  $('#cfg-line-height').value = cfg.lineHeight || 1.8;
  $('#val-line-height').textContent = (cfg.lineHeight || 1.8).toFixed(2);
  $('#cfg-content-width').value = cfg.contentWidth ?? 80;
  $('#val-content-width').textContent = (cfg.contentWidth ?? 80) + '%';
  $('#cfg-code-theme').value = cfg.codeTheme || 'github-dark';
  $('#cfg-live-reload').checked = liveReload;
  $('#cfg-word-count').checked = cfg.showWordCount !== false;
  $('#cfg-smooth-scroll').checked = cfg.smoothScroll !== false;
  $('#cfg-remember-scroll-pos').checked = cfg.rememberScrollPos !== false;
  // AI settings
  $('#cfg-ai-api-url').value = cfg.aiApiUrl || 'https://api.openai.com';
  $('#cfg-ai-api-key').value = cfg.aiApiKey || '';
  $('#cfg-ai-model').value = cfg.aiModel || 'gpt-4o-mini';
  setAiModelActiveOption();
}

function applyConfig() {
  dom.body.dataset.theme = cfg.theme || 'dark';
  dom.body.dataset.font = cfg.fontFamily || 'serif';
  const pal = cfg.palette || 'amber';
  if (pal === 'amber') delete dom.body.dataset.palette;
  else dom.body.dataset.palette = pal;
  const fs = (cfg.fontSize || 18) + 'px';
  const lh = cfg.lineHeight || 1.8;
  // Migrate legacy px values (> 100 means old px-based setting)
  if ((cfg.contentWidth || 0) > 100) cfg.contentWidth = 80;
  const cw = (cfg.contentWidth ?? 80) + '%';
  document.documentElement.style.setProperty('--font-size', fs);
  document.documentElement.style.setProperty('--line-height', lh);
  document.documentElement.style.setProperty('--content-width', cw);
  dom.mdContent.style.fontSize = fs;
  dom.mdContent.style.lineHeight = lh;
  dom.scrollContainer.classList.toggle('no-smooth', !cfg.smoothScroll);
  const chatW = Math.max(320, Math.min(Math.min(900, window.innerWidth - 40), cfg.chatWidth || 420));
  document.documentElement.style.setProperty('--chat-w', chatW + 'px');
  applyHljsTheme(cfg.codeTheme || 'github-dark'); // fire-and-forget, CSS injection
}

// Auto-save: debounced, called after every control change
let _saveTimer;
function autosave() {
  const settingsOpen = !dom.settingsOverlay.classList.contains('hidden');
  cfg.theme        = $('button.theme-btn.active')?.dataset.theme    || cfg.theme;
  cfg.fontFamily   = $('button.font-btn.active')?.dataset.font      || cfg.fontFamily;
  cfg.palette      = $('button.palette-btn.active')?.dataset.palette || cfg.palette || 'amber';
  cfg.language     = $('#cfg-language')?.value                       || cfg.language || 'en';
  cfg.fontSize     = parseInt($('#cfg-font-size').value)             || 18;
  cfg.lineHeight   = parseFloat($('#cfg-line-height').value)         || 1.8;
  cfg.contentWidth = parseInt($('#cfg-content-width').value)         ?? 80;
  cfg.codeTheme    = $('#cfg-code-theme').value;
  cfg.liveReload   = liveReload;
  const aiUrlVal   = $('#cfg-ai-api-url')?.value ?? '';
  const aiKeyVal   = $('#cfg-ai-api-key')?.value ?? '';
  const aiModelVal = $('#cfg-ai-model')?.value ?? '';

  // Prevent unrelated autosaves from wiping AI settings before Settings is opened.
  if (settingsOpen || aiUrlVal) cfg.aiApiUrl = aiUrlVal || 'https://api.openai.com';
  else cfg.aiApiUrl = cfg.aiApiUrl || 'https://api.openai.com';

  if (settingsOpen || aiKeyVal) cfg.aiApiKey = aiKeyVal;
  else cfg.aiApiKey = cfg.aiApiKey || '';

  if (settingsOpen || aiModelVal) cfg.aiModel = aiModelVal || 'gpt-4o-mini';
  else cfg.aiModel = cfg.aiModel || 'gpt-4o-mini';

  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => window.mandy.saveConfig(cfg), 400);
}

// ---- Zoom ----
function applyZoom(z) {
  cfg.zoom = Math.min(2.0, Math.max(0.5, parseFloat(z.toFixed(1))));
  document.body.style.zoom = cfg.zoom;
}

// ---- Focus mode ----
function toggleFocus() {
  dom.body.classList.toggle('focus-mode');
}

// ---- Sidebar toggle ----
function toggleSidebar(forceOpen = false) {
  if (forceOpen && !dom.sidebar.classList.contains('hidden')) return;
  if (forceOpen) { dom.sidebar.classList.remove('hidden'); return; }
  dom.sidebar.classList.toggle('hidden');
}

// ---- Copy code (accessible from HTML onclick) ----
window.__copyCode = function(btn) {
  const code = btn.closest('.code-block-wrap').querySelector('code');
  if (!code) return;
  navigator.clipboard.writeText(code.textContent).then(() => {
    const orig = btn.innerHTML;
    btn.textContent = t('copied');
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {});
};

// ---- Drag and drop ----
function setupDragDrop() {
  const overlay = document.createElement('div');
  overlay.id = 'drop-overlay';
  overlay.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <p data-i18n="drop.title">Drop to open</p>
    <span data-i18n="drop.sub">Markdown &amp; text files accepted</span>
  `;
  document.body.appendChild(overlay);

  const isFileDrag = e => e.dataTransfer.types.includes('Files');
  let dragCount = 0;
  document.addEventListener('dragenter', e => { if (!isFileDrag(e)) return; dragCount++; overlay.classList.add('active'); });
  document.addEventListener('dragleave', () => { if (--dragCount <= 0) { dragCount = 0; overlay.classList.remove('active'); } });
  document.addEventListener('dragover', e => { if (isFileDrag(e)) e.preventDefault(); });
  document.addEventListener('drop', async e => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCount = 0;
    overlay.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const path = window.mandy.getPathForFile(file);
    if (path) window.mandy.openFileFromPath(path);
  });
}

// ---- Platform ----
async function detectPlatform() {
  const platform = await window.mandy.getPlatform();
  dom.body.classList.add(`platform-${platform}`);
  if (platform === 'darwin') {
    document.getElementById('titlebar').style.paddingLeft = '80px';
    document.getElementById('win-controls').style.display = 'none';
  }
}

// ---- Window controls ----
function setupWindowControls() {
  $('#btn-min').onclick = () => window.mandy.minimize();
  $('#btn-max').onclick = () => window.mandy.maximize();
  $('#btn-close').onclick = () => window.mandy.close();
  window.mandy.onWindowState(() => {});
}

// ---- Keyboard shortcuts ----
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    const inEditor = document.activeElement === dom.editorTextarea;

    // Tab management
    if (mod && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); return; }
    if (mod && e.key === 't') { e.preventDefault(); newWelcomeTab(); return; }
    if (mod && e.key === 'Tab') {
      e.preventDefault();
      if (tabs.length < 2) return;
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx === -1) return;
      const next = e.shiftKey
        ? (idx - 1 + tabs.length) % tabs.length
        : (idx + 1) % tabs.length;
      activateTab(tabs[next].id);
      return;
    }

    if (mod && e.key === 'o') { e.preventDefault(); window.mandy.openFileDialog(); }
    if (mod && e.key === 'n') { e.preventDefault(); newFile(); }
    if (mod && e.key === 's') { e.preventDefault(); saveFile(); }
    if (mod && e.key === ',') { e.preventDefault(); openSettings(); }
    // Ctrl+F: open find; pre-fill with selection and jump to that exact instance
    if (mod && e.key === 'f') {
      e.preventDefault();
      let sel = '', selectionY = null;
      if (inEditor) {
        sel = dom.editorTextarea.value.slice(dom.editorTextarea.selectionStart, dom.editorTextarea.selectionEnd).trim();
      } else {
        const s = window.getSelection();
        sel = s?.toString()?.trim() || '';
        if (sel && s.rangeCount > 0) {
          const r = s.getRangeAt(0).getBoundingClientRect();
          selectionY = { top: r.top, left: r.left };
        }
      }
      openFind(sel || undefined, selectionY);
    }
    if (mod && e.key === 'b' && !inEditor) { e.preventDefault(); toggleSidebar(); }
    if (mod && e.key === '=' && !inEditor) { e.preventDefault(); applyZoom((cfg.zoom || 1) + 0.1); }
    if (mod && e.key === '-' && !inEditor) { e.preventDefault(); applyZoom((cfg.zoom || 1) - 0.1); }
    if (mod && e.key === '0' && !inEditor) { e.preventDefault(); applyZoom(1); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFocus(); }
    // View mode shortcuts
    if (mod && e.key === 'e' && !e.shiftKey) { e.preventDefault(); setViewMode(viewMode === 'edit' ? 'preview' : 'edit'); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); setViewMode('split'); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setViewMode('preview'); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); openChat(); }

    if (e.key === 'Escape') {
      const cfgOverlay = $('#chat-config-overlay');
      if (cfgOverlay && !cfgOverlay.classList.contains('hidden')) { cfgOverlay.classList.add('hidden'); return; }
      if (!dom.chatOverlay.classList.contains('hidden')) {
        if (chatStreaming) {
          e.preventDefault();
          window.mandy.cancelChat();
          chatQueuedPrompts = [];
          chatPaused = true;
          syncChatInputPlaceholder();
          renderChatMessages();
        }
        return;
      }
      if (!dom.settingsOverlay.classList.contains('hidden')) { closeSettings(); return; }
      if (!dom.findBar.classList.contains('hidden')) { closeFind(); return; }
      if (inEditor && viewMode === 'edit') { setViewMode('preview'); return; }
      // Clear any active text selection
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) { sel.removeAllRanges(); return; }
      if (inEditor) { dom.editorTextarea.setSelectionRange(dom.editorTextarea.selectionStart, dom.editorTextarea.selectionStart); }
    }
    if (!dom.findBar.classList.contains('hidden')) {
      if (e.key === 'Enter') { e.shiftKey ? findNav(-1) : findNav(1); }
      if (e.key === 'F3') { e.preventDefault(); e.shiftKey ? findNav(-1) : findNav(1); }
    }
  });
}

// ---- Main init ----
async function init() {
  cfg = await window.mandy.getConfig();
  chatHistories = await window.mandy.getChatHistories();
  liveReload = cfg.liveReload ?? true;

  applyConfig();
  setLanguage(cfg.language || 'en');
  await detectPlatform();
  setupWindowControls();
  setupKeyboard();
  setupEditorKeyboard();
  setupDragDrop();

  // Load recents
  const recents = await window.mandy.getRecents();
  updateRecentsList(recents);

  // Sidebar tabs
  $$('.tab-btn').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));

  // Sidebar toggle button
  $('#sidebar-toggle').onclick = () => toggleSidebar();

  // Sidebar resize handle
  (function() {
    const resizer = $('#sidebar-resizer');
    let startX, startW;
    resizer.addEventListener('mousedown', e => {
      startX = e.clientX;
      startW = dom.sidebar.offsetWidth;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      function onMove(e) {
        const w = Math.min(480, Math.max(160, startW + (e.clientX - startX)));
        document.documentElement.style.setProperty('--sidebar-w', w + 'px');
      }
      function onUp() {
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const w = dom.sidebar.offsetWidth;
        cfg.sidebarWidth = w;
        autosave();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Restore saved sidebar width
    if (cfg.sidebarWidth) {
      document.documentElement.style.setProperty('--sidebar-w', cfg.sidebarWidth + 'px');
    }
  })();

  // Titlebar buttons
  $('#btn-find').onclick = () => openFind();
  $('#btn-settings').onclick = openSettings;
  $('#btn-open-file').onclick = () => window.mandy.openFileDialog();
  $('#btn-new-folder-file').onclick = () => startInlineCreateInWorkingDirectory('file');
  $('#btn-refresh-folder').onclick = () => refreshFolderTree();
  $('#btn-open-folder').onclick = () => window.mandy.openFolderDialog();
  $('#btn-parent-folder').onclick = async () => {
    const parentPath = getParentFolderPath(loadedFolderPath);
    if (!parentPath) return;
    await openFolder(parentPath);
  };
  dom.openFileDirBtn.onclick = async () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab?.path || loadedFolderPath) return;
    const dirPath = activeTab.path.replace(/[\\/][^\\/]+$/, '');
    if (!dirPath) return;
    await openFolder(dirPath);
  };
  dom.folderList.addEventListener('contextmenu', e => {
    if (!loadedFolderPath) return;
    if (e.target.closest('.tree-dir-header, .tree-file, .tree-inline-create')) return;
    e.preventDefault();
    e.stopPropagation();
    showWorkingDirContextMenu(e.clientX, e.clientY);
  });
  dom.folderEmpty.addEventListener('contextmenu', e => {
    if (!loadedFolderPath) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    showWorkingDirContextMenu(e.clientX, e.clientY);
  });
  updateRefreshFolderButtonState();
  updateNewFolderFileButtonState();
  updateParentFolderButtonState();
  updateFolderEmptyActions();
  $('#tab-new-btn').onclick = () => newWelcomeTab();
  dom.tabBar?.addEventListener('scroll', updateTabScrollButtons, { passive: true });
  dom.tabScrollLeft?.addEventListener('click', () => {
    scrollTabBarByDirection(-1);
  });
  dom.tabScrollRight?.addEventListener('click', () => {
    scrollTabBarByDirection(1);
  });
  window.addEventListener('resize', updateTabScrollButtons);

  // Welcome buttons
  $('#welcome-open').onclick = () => window.mandy.openFileDialog();
  $('#welcome-folder').onclick = () => window.mandy.openFolderDialog();
  $('#welcome-new').onclick = () => newFile();

  // Find bar
  dom.findInput.addEventListener('input', () => {
    clearTimeout(findTimeout);
    findTimeout = setTimeout(() => doFind(dom.findInput.value), 180);
  });
  $('#find-prev').onclick = () => findNav(-1);
  $('#find-next').onclick = () => findNav(1);
  $('#find-close').onclick = closeFind;

  // Settings
  $('#settings-close').onclick = closeSettings;
  $('#settings-reset').onclick = () => {
    cfg = { theme:'dark', fontFamily:'sans', fontSize:18, lineHeight:1.8, contentWidth:80, codeTheme:'github-dark', showWordCount:true, smoothScroll:true, zoom:1, liveReload:true, palette:'amber', language:'en', aiApiUrl:'https://api.openai.com', aiApiKey:'', aiModel:'gpt-4o-mini', chatWidth:420 };
    liveReload = false;
    setLanguage('en');
    applyConfig();
    syncSettingsUI();
    window.mandy.saveConfig(cfg);
    if (currentContent) { renderMarkdown(currentContent).then(h => { dom.mdContent.innerHTML = h; _previewHtmlDirty = true; buildTOC(); }); }
  };
  dom.settingsOverlay.onclick = e => { if (e.target === dom.settingsOverlay) closeSettings(); };

  // Settings Ã¢â‚¬â€ live apply on every change
  $('#cfg-font-size').oninput = function() {
    const v = parseInt(this.value);
    $('#val-font-size').textContent = v + 'px';
    document.documentElement.style.setProperty('--font-size', v + 'px');
    dom.mdContent.style.fontSize = v + 'px';
    autosave();
  };
  $('#cfg-line-height').oninput = function() {
    const v = parseFloat(this.value);
    $('#val-line-height').textContent = v.toFixed(2);
    document.documentElement.style.setProperty('--line-height', v);
    dom.mdContent.style.lineHeight = v;
    autosave();
  };
  $('#cfg-content-width').oninput = function() {
    const v = parseInt(this.value);
    $('#val-content-width').textContent = v + '%';
    document.documentElement.style.setProperty('--content-width', v + '%');
    $('#content-wrap').style.maxWidth = v + '%';
    autosave();
  };
  $('#cfg-code-theme').onchange = function() {
    applyHljsTheme(this.value);
    autosave();
  };
  $('#cfg-smooth-scroll').onchange = function() {
    cfg.smoothScroll = this.checked;
    dom.scrollContainer.classList.toggle('no-smooth', !this.checked);
    autosave();
  };
  $('#cfg-remember-scroll-pos').onchange = function() {
    cfg.rememberScrollPos = this.checked;
    autosave();
  };
  $('#cfg-word-count').onchange = function() {
    cfg.showWordCount = this.checked;
    $('#doc-meta').style.display = this.checked ? '' : 'none';
    autosave();
  };
  $('#cfg-live-reload').onchange = function() {
    liveReload = this.checked;
    autosave();
  };

  $$('.theme-btn').forEach(btn => btn.onclick = () => {
    $$('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    dom.body.dataset.theme = btn.dataset.theme;
    autosave();
  });
  $$('.font-btn').forEach(btn => btn.onclick = () => {
    $$('.font-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    dom.body.dataset.font = btn.dataset.font;
    autosave();
  });
  $$('.palette-btn').forEach(btn => btn.onclick = () => {
    $$('.palette-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const pal = btn.dataset.palette;
    if (pal === 'amber') delete dom.body.dataset.palette;
    else dom.body.dataset.palette = pal;
    autosave();
  });
  $('#cfg-language').onchange = function() {
    setLanguage(this.value);
    autosave();
  };

  // AI settings Ã¢â‚¬â€ save on change
  setupAiModelPicker();
  $('#cfg-ai-api-url').onchange = autosave;
  $('#cfg-ai-api-key').onchange = autosave;
  $('#cfg-ai-model').onchange   = autosave;

  // Chat config prompt
  const chatConfigOverlay = $('#chat-config-overlay');
  chatConfigOverlay.onclick = e => { if (e.target === chatConfigOverlay) chatConfigOverlay.classList.add('hidden'); };
  $('#chat-config-go').onclick = () => {
    chatConfigOverlay.classList.add('hidden');
    openAiSettingsFromChat();
  };

  // Chat panel
  updateChatButtonState();
  $('#btn-chat').onclick = () => openChat();
  $('#chat-open-settings').onclick = () => {
    openAiSettingsFromChat();
  };
  $('#chat-close').onclick = closeChat;
  $('#chat-clear').onclick = clearChat;
  dom.chatHistoryBtn.onclick = e => {
    e.stopPropagation();
    toggleChatHistoryMenu();
  };
  dom.chatAutoApproveToggle.onclick = async () => {
    try {
      const res = await window.mandy.setSessionAutoApprove(!chatSessionAutoApprove);
      if (typeof res?.enabled === 'boolean') chatSessionAutoApprove = res.enabled;
      else chatSessionAutoApprove = !chatSessionAutoApprove;
    } catch {}
    renderChatAutoApproveToggle();
  };
  dom.chatOverlay.onclick = e => { if (e.target === dom.chatOverlay) closeChat(); };
  document.addEventListener('mousedown', e => {
    if (!dom.chatOverlay.classList.contains('hidden') &&
        !dom.chatHistoryMenu.classList.contains('hidden') &&
        !dom.chatHistoryMenu.contains(e.target) &&
        !dom.chatHistoryBtn.contains(e.target)) {
      closeChatHistoryMenu();
    }
    if (!dom.chatOverlay.classList.contains('hidden') &&
        dom.chatPathSuggest &&
        !dom.chatPathSuggest.classList.contains('hidden') &&
        !dom.chatPathSuggest.contains(e.target) &&
        e.target !== dom.chatInput) {
      closeChatPathSuggest();
    }
  });
  dom.chatSend.onclick = sendChatMessage;
  dom.chatContextAdd.onclick = async () => {
    const primary = getPrimaryChatContextFile();
    const startDir = primary?.path ? primary.path.replace(/[\\/][^\\/]+$/, '') : '';
    const picked = await window.mandy.pickChatContextFiles(startDir);
    if (Array.isArray(picked)) {
      for (const p of picked) await addChatContextFile(p);
    }
  };
  dom.chatInput.addEventListener('keydown', e => {
    const suggestOpen = dom.chatPathSuggest && !dom.chatPathSuggest.classList.contains('hidden');
    if (suggestOpen && e.key === 'ArrowDown') {
      e.preventDefault();
      moveChatPathSuggestActive(1);
      return;
    }
    if (suggestOpen && e.key === 'ArrowUp') {
      e.preventDefault();
      moveChatPathSuggestActive(-1);
      return;
    }
    if (!suggestOpen && e.key === 'ArrowUp') {
      if (navigateChatPromptHistory(-1)) {
        e.preventDefault();
        return;
      }
    }
    if (!suggestOpen && e.key === 'ArrowDown') {
      if (navigateChatPromptHistory(1)) {
        e.preventDefault();
        return;
      }
    }
    if (suggestOpen && e.key === 'Enter' && !e.shiftKey) {
      if (triggerChatPathSuggestActive()) {
        e.preventDefault();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    if (e.key === 'Escape') closeChatPathSuggest();
  });
  dom.chatInput.addEventListener('input', () => {
    dom.chatInput.style.height = 'auto';
    dom.chatInput.style.height = Math.min(dom.chatInput.scrollHeight, 120) + 'px';
    refreshChatPathSuggestions();
  });
  dom.chatPathSuggest?.addEventListener('mousedown', e => {
    // Keep textarea focus while clicking suggestions so nested navigation works.
    e.preventDefault();
  });
  dom.chatMessages.addEventListener('click', e => {
    const diffToggle = e.target.closest('.chat-approval-diff-toggle');
    if (diffToggle) {
      e.preventDefault();
      const id = diffToggle.dataset.id || '';
      if (!id) return;
      if (chatApprovalExpanded.has(id)) chatApprovalExpanded.delete(id);
      else chatApprovalExpanded.add(id);
      renderChatMessages();
      return;
    }
    const permBtn = e.target.closest('.chat-approval-action');
    if (permBtn) {
      e.preventDefault();
      const id = permBtn.dataset.id || '';
      const action = permBtn.dataset.decision || '';
      const decision = action === 'allow' || action === 'allow-session';
      const msg = chatMessages.find(m => m.role === 'approval' && m.approvalId === id);
      if (!id || !msg || msg.status !== 'pending') return;
      msg.status = 'processing';
      renderChatMessages();
      const submit = () => window.mandy.respondChatPermission(id, decision);
      const chain = action === 'allow-session'
        ? window.mandy.setSessionAutoApprove(true).then(s => {
            if (typeof s?.enabled === 'boolean') chatSessionAutoApprove = s.enabled;
            else chatSessionAutoApprove = true;
            renderChatAutoApproveToggle();
            return submit();
          })
        : submit();
      chain.then(res => {
        if (!res?.ok) {
          msg.status = 'pending';
          chatMessages.push({ role: 'error', content: t('chat.perm.submitFailed') });
          renderChatMessages();
        }
      }).catch(() => {
        msg.status = 'pending';
        chatMessages.push({ role: 'error', content: t('chat.perm.submitFailed') });
        renderChatMessages();
      });
      return;
    }
    const settingsBtn = e.target.closest('.chat-error-action');
    if (settingsBtn) {
      e.preventDefault();
      openAiSettingsFromChat();
      return;
    }
    const openMutatedBtn = e.target.closest('.chat-mutation-open');
    if (openMutatedBtn) {
      e.preventDefault();
      const p = openMutatedBtn.dataset.path || '';
      if (p) window.mandy.openFileFromPath(p);
      return;
    }
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    window.mandy.handleLink(href, currentFile);
  });
  setupChatResizer();
  setupChatListeners();

  // View mode buttons
  $$('.view-mode-btn').forEach(btn => btn.onclick = () => setViewMode(btn.dataset.mode));

  // Editor toolbar buttons
  $$('.toolbar-btn').forEach(btn => btn.onclick = () => applyFormat(btn.dataset.action));

  // Link clicks in rendered markdown
  dom.mdContent.addEventListener('mousedown', e => {
    if (e.detail !== 2) return;
    e.preventDefault();
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return;
    const node = range.startContainer;
    const text = node.textContent;
    let s = range.startOffset, end = s;
    while (s > 0 && /\w/.test(text[s - 1])) s--;
    while (end < text.length && /\w/.test(text[end])) end++;
    if (s === end) return;
    const r = document.createRange();
    r.setStart(node, s);
    r.setEnd(node, end);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  });

  dom.mdContent.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    // Internal anchor (#section) Ã¢â€ â€™ scroll the container to the target element
    if (href.startsWith('#')) {
      const target = document.querySelector(href);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.mandy.handleLink(href, currentFile);
  });

  // Scroll events (throttled to one update per animation frame)
  let _scrollRafPending = false;
  dom.scrollContainer.addEventListener('scroll', () => {
    if (_scrollRafPending) return;
    _scrollRafPending = true;
    requestAnimationFrame(() => {
      _scrollRafPending = false;
      syncPreviewToEditor();
      updateProgress();
      updateScrollThumb();
    });
  }, { passive: true });

  // Recalculate thumb on container resize (window resize, sidebar toggle, etc.)
  new ResizeObserver(() => updateScrollThumb()).observe(dom.scrollContainer);

  // Drag-to-scroll on the scroll indicator (flex item, full height)
  $('#scroll-indicator').addEventListener('mousedown', e => {
    e.preventDefault();
    const sc          = dom.scrollContainer;
    const scrollRange = sc.scrollHeight - sc.clientHeight;
    const thumbH      = dom.scrollThumb.offsetHeight;
    const indicatorH  = e.currentTarget.getBoundingClientRect().height;
    const thumbRange  = indicatorH - thumbH;

    // Disable smooth scroll for instant drag feedback
    sc.classList.add('no-smooth');

    // Jump to clicked position centred on the thumb
    const relY = e.clientY - e.currentTarget.getBoundingClientRect().top;
    sc.scrollTop = Math.min(scrollRange, Math.max(0, ((relY - thumbH / 2) / thumbRange) * scrollRange));

    const startY   = e.clientY;
    const startTop = sc.scrollTop;
    function onMove(ev) {
      const delta = ev.clientY - startY;
      sc.scrollTop = Math.min(scrollRange, Math.max(0, startTop + (delta / thumbRange) * scrollRange));
    }
    function onUp() {
      sc.classList.remove('no-smooth');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // IPC from main process
  window.mandy.onFileOpened(data => openDocument(data));
  window.mandy.onFileChanged(({ content, html }) => {
    if (!liveReload) return;
    currentContent = content;
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) { activeTab.content = content; activeTab.html = html || ''; activeTab._wordCountCached = null; }
    dom.mdContent.innerHTML = html || '';
    _previewHtmlDirty = false; // Stored directly on tab above
    addHeadingIds();
    buildTOC();
    const words = countWords(content);
    dom.docStats.words.textContent = `${words.toLocaleString()} ${t('words')}`;
    dom.docStats.read.textContent  = `~${Math.max(1, Math.round(words / 200))} ${t('minRead')}`;
    dom.docStats.chars.textContent = `${content.length.toLocaleString()} ${t('chars')}`;
  });
  window.mandy.onAgentFileMutated(async ({ path: filePath }) => {
    if (!filePath) return;
    try { await refreshExpandedFolderForPath(filePath); } catch {}
    const filePathLower = String(filePath).toLowerCase();
    const affectedTabs = tabs.filter(t => t.path && t.path.toLowerCase() === filePathLower);
    let latestRead = null;
    try {
      latestRead = await window.mandy.readFile(filePath);
    } catch {
      latestRead = {error: 'read-failed'};
    }
    const wasDeleted = !!latestRead?.error;
    if (wasDeleted) {
      for (const tab of [...affectedTabs]) {
        await closeTab(tab.id);
      }
      try {
        const updatedRecents = await window.mandy.removeRecent(filePath);
        purgeDocConversationHistory(filePath, { clearVisible: true });
        updateRecentsList(updatedRecents);
      } catch {}
      return;
    }

    const activeTab = tabs.find(t => t.id === activeTabId);
    const isActiveFile = !!activeTab?.path && activeTab.path.toLowerCase() === String(filePath).toLowerCase();
    if (!isActiveFile) {
      chatMessages.push({ role: 'mutation', path: filePath });
      renderChatMessages();
      persistCurrentConversation();
      return;
    }
    if (activeTab.unsaved) return; // Never clobber unsaved local edits.

    try {
      const res = latestRead || await window.mandy.readFile(activeTab.path);
      if (res?.error || typeof res?.content !== 'string') return;
      const html = await window.mandy.renderMarkdown(res.content, activeTab.path);
      currentContent = res.content;
      activeTab.content = res.content;
      activeTab.html = html || '';
      activeTab._wordCountCached = null;
      dom.editorTextarea.value = res.content;
      dom.mdContent.innerHTML = html || '';
      _previewHtmlDirty = false; // Stored directly on tab above
      addHeadingIds();
      buildTOC();
      const words = countWords(res.content);
      dom.docStats.words.textContent = `${words.toLocaleString()} ${t('words')}`;
      dom.docStats.read.textContent  = `~${Math.max(1, Math.round(words / 200))} ${t('minRead')}`;
      dom.docStats.chars.textContent = `${res.content.length.toLocaleString()} ${t('chars')}`;
    } catch {}
  });
  window.mandy.onOpenFolder(folderPath => openFolder(folderPath));
  window.mandy.onAction(action => {
    switch (action) {
      case 'open-settings': openSettings(); break;
      case 'find': openFind(); break;
      case 'toggle-toc': switchTab('toc'); toggleSidebar(true); break;
      case 'toggle-focus': toggleFocus(); break;
      case 'zoom-in': applyZoom((cfg.zoom || 1) + 0.1); break;
      case 'zoom-out': applyZoom((cfg.zoom || 1) - 0.1); break;
      case 'zoom-reset': applyZoom(1); break;
      case 'print': window.mandy.print(); break;
      case 'save': saveFile(); break;
      case 'new-file': newFile(); break;
      case 'new-tab':   newWelcomeTab(); break;
      case 'close-tab': closeTab(activeTabId); break;
      case 'mode-preview': setViewMode('preview'); break;
      case 'mode-split': setViewMode('split'); break;
      case 'mode-edit': setViewMode('edit'); break;
    }
  });

  // Show sidebar unless hidden
  if (cfg.showTOC === false) dom.sidebar.classList.add('hidden');
  updateFolderEmptyActions();

  // Start with no tabs Ã¢â‚¬â€ just show the welcome screen
  dom.viewer.classList.add('hidden');
  dom.welcome.classList.remove('hidden');
  renderTabBar();

  // Pull any file that was passed at launch (e.g. double-clicking a .md file).
  // We do this here, after onFileOpened is registered, to avoid the timing race
  // where ready-to-show fires before the listener is set up.
  const pendingFile = await window.mandy.getPendingFile();
  if (pendingFile) window.mandy.openFileFromPath(pendingFile);

  // Save all scroll positions before window closes
  window.addEventListener('beforeunload', () => {
    if (cfg.rememberScrollPos !== false) {
      // Save current active tab state first to update scroll values
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        activeTab.previewScroll = dom.scrollContainer.scrollTop;
        activeTab.editorScroll = dom.editorTextarea.scrollTop;
      }
      // Batch save all tabs' scroll positions
      const positions = tabs.filter(t => t.path).map(t => ({
        path: t.path,
        previewScroll: t.previewScroll,
        editorScroll: t.editorScroll
      }));
      if (positions.length > 0) {
        window.mandy.saveAllScrollPositions(positions);
      }
    }
  });

  window.mandy.signalReady();
}

init().catch(console.error);

