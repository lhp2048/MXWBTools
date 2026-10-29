(() => {
  'use strict';

  if (globalThis.__MFIND_LOADED__) return;
  if (!globalThis.MFSearch) return;
  globalThis.__MFIND_LOADED__ = true;

  const PALETTE = [
    { name: 'mfind-k0', bg: '#ffe14a', fg: '#1a1a1a' },
    { name: 'mfind-k1', bg: '#7ee0a8', fg: '#1a1a1a' },
    { name: 'mfind-k2', bg: '#8ecaff', fg: '#1a1a1a' },
    { name: 'mfind-k3', bg: '#ffb3d1', fg: '#1a1a1a' },
    { name: 'mfind-k4', bg: '#ffc48a', fg: '#1a1a1a' },
    { name: 'mfind-k5', bg: '#cbb7ff', fg: '#1a1a1a' }
  ];
  const CURRENT = { name: 'mfind-current', bg: '#f04e23', fg: '#ffffff' };
  const HOST_ID = 'mfind-host';
  const STYLE_ID = 'mfind-style';
  const LIST_SIZE = 60;
  const INLINE = new Set([
    'SPAN', 'A', 'B', 'STRONG', 'EM', 'I', 'U', 'FONT', 'SMALL', 'LABEL', 'CODE',
    'CITE', 'Q', 'ABBR', 'SUB', 'SUP', 'TIME', 'MARK', 'S', 'DEL', 'INS', 'KBD',
    'SAMP', 'VAR', 'WBR', 'NOBR', 'BDO', 'BDI', 'RUBY', 'RT', 'RP'
  ]);
  const SKIP_TAG = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE', 'IFRAME', 'OBJECT', 'APPLET'
  ]);
  const DEFAULT_OPTIONS = {
    caseSensitive: false,
    wholeWord: false,
    splitSpace: true,
    mode: 'any'
  };

  const state = {
    open: false,
    loaded: false,
    query: '',
    options: { ...DEFAULT_OPTIONS },
    history: [],
    pos: null,
    shortcut: '',
    keywords: [],
    counts: [],
    matches: [],
    index: 0,
    restoreIndex: 0,
    listStart: 0,
    keywordTruncated: false,
    matchTruncated: false,
    useCss: null,
    host: null,
    refs: null,
    observer: null,
    applying: false,
    timer: 0,
    rememberTimer: 0,
    pendingReason: '',
    composing: false,
    historyOpen: false,
    drag: null,
    moved: false,
    modeOpen: false,
    hasSearched: false
  };

  let opening = null;

  function canHighlight() {
    if (state.useCss == null) {
      state.useCss = typeof Highlight !== 'undefined' && !!(window.CSS && CSS.highlights);
    }
    return state.useCss;
  }

  function highlightCss() {
    const parts = PALETTE.map((item, index) => (
      `::highlight(${item.name}){background-color:${item.bg};color:${item.fg}}` +
      `mark.mfind-k${index}{background:${item.bg}!important;color:${item.fg}!important}`
    ));
    parts.push(`::highlight(${CURRENT.name}){background-color:${CURRENT.bg};color:${CURRENT.fg}}`);
    parts.push(`mark.mfind-current{background:${CURRENT.bg}!important;color:${CURRENT.fg}!important}`);
    parts.push('mark.mfind-mark{border-radius:2px;padding:0;margin:0;font:inherit;}');
    return parts.join('\n');
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = highlightCss();
    (document.head || document.documentElement).appendChild(style);
  }

  function removeStyle() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  function svgIcon(paths) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach((d) => {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.6');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
    });
    return svg;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function keepFocus(node) {
    node.addEventListener('mousedown', (event) => event.preventDefault());
  }

  function formatShortcut(value) {
    if (!value) return '';
    return value.replace(/MacCtrl/g, 'Ctrl').replace(/Command/g, '⌘');
  }

  function formatTime(ts) {
    const delta = Date.now() - Number(ts || 0);
    if (delta < 45000) return '刚刚';
    if (delta < 3600000) return `${Math.floor(delta / 60000)} 分钟前`;
    if (delta < 86400000) return `${Math.floor(delta / 3600000)} 小时前`;
    const date = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getMonth() + 1}-${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function cleanSnippet(value) {
    return value.replace(/\s+/g, ' ');
  }

  function makeSnippet(text, start, end) {
    const pad = 20;
    const from = Math.max(0, start - pad);
    const to = Math.min(text.length, end + pad);
    return {
      before: (from > 0 ? '…' : '') + cleanSnippet(text.slice(from, start)),
      mid: cleanSnippet(text.slice(start, end)),
      after: cleanSnippet(text.slice(end, to)) + (to < text.length ? '…' : '')
    };
  }

  function saveSession() {
    try {
      sessionStorage.setItem('mfind-session', JSON.stringify({
        query: state.query,
        index: state.index,
        options: state.options
      }));
    } catch (e) {}
  }

  function saveOptions() {
    chrome.storage.local.set({ mfindOptions: state.options }).catch(() => {});
    saveSession();
  }

  function persistHistory() {
    chrome.storage.local.set({ mfindHistory: state.history }).catch(() => {});
  }

  function normalizeQuery(query) {
    return String(query || '').replace(/\s+/g, ' ').trim();
  }

  function historyIdentity(item) {
    if (!item || typeof item.q !== 'string') return '';
    const options = {
      caseSensitive: !!item.caseSensitive,
      splitSpace: !!item.splitSpace
    };
    const parsed = MFSearch.parseKeywords(normalizeQuery(item.q), options);
    if (!parsed.keywords.length) return '';
    return parsed.keywords.map((keyword) => (
      options.caseSensitive ? keyword : keyword.toLowerCase()
    )).join('\u0000');
  }

  function dedupeHistory(list) {
    const seenKeywords = new Set();
    const seenQueries = new Set();
    const out = [];
    (list || []).forEach((item) => {
      const next = {
        q: normalizeQuery(item && item.q),
        caseSensitive: !!(item && item.caseSensitive),
        wholeWord: !!(item && item.wholeWord),
        splitSpace: !!(item && item.splitSpace),
        mode: item && item.mode === 'all' ? 'all' : 'any',
        t: item && item.t
      };
      const key = historyIdentity(next);
      if (!key || seenKeywords.has(key) || seenQueries.has(next.q)) return;
      seenKeywords.add(key);
      seenQueries.add(next.q);
      out.push(next);
    });
    return out.slice(0, 30);
  }

  function rememberNow() {
    clearTimeout(state.rememberTimer);
    const query = normalizeQuery(state.query);
    if (!historyIdentity({ q: query, caseSensitive: state.options.caseSensitive, splitSpace: state.options.splitSpace })) return;
    const entry = {
      q: query,
      caseSensitive: !!state.options.caseSensitive,
      wholeWord: !!state.options.wholeWord,
      splitSpace: !!state.options.splitSpace,
      mode: state.options.mode === 'all' ? 'all' : 'any',
      t: Date.now()
    };
    const key = historyIdentity(entry);
    state.history = [entry].concat(state.history.filter((item) => (
      historyIdentity(item) !== key && normalizeQuery(item.q) !== entry.q
    ))).slice(0, 30);
    persistHistory();
    if (state.refs) renderHistory();
  }

  function rememberSoon() {
    clearTimeout(state.rememberTimer);
    state.rememberTimer = setTimeout(rememberNow, 700);
  }

  async function loadPersisted() {
    if (state.loaded) return;
    const data = await chrome.storage.local.get({ mfindOptions: {}, mfindHistory: [], mfindPos: null });
    state.options = { ...DEFAULT_OPTIONS, ...(data.mfindOptions || {}) };
    if (state.options.mode !== 'all') state.options.mode = 'any';
    state.history = dedupeHistory(data.mfindHistory);
    if (JSON.stringify(state.history) !== JSON.stringify(data.mfindHistory || [])) persistHistory();
    state.pos = data.mfindPos;
    try {
      const raw = sessionStorage.getItem('mfind-session');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved.query === 'string') state.query = saved.query;
        if (saved && saved.options && typeof saved.options === 'object') {
          state.options = { ...state.options, ...saved.options };
          if (state.options.mode !== 'all') state.options.mode = 'any';
        }
        if (saved && Number.isInteger(saved.index) && saved.index >= 0) state.restoreIndex = saved.index;
      }
    } catch (e) {}
    state.loaded = true;
  }

  function computeBlock(element) {
    const semantic = element.closest('p,li,td,th,h1,h2,h3,h4,h5,h6,blockquote,pre,dd,dt,figcaption,summary,caption');
    if (semantic) return semantic;
    let current = element;
    while (current.parentElement && INLINE.has(current.tagName)) current = current.parentElement;
    return current;
  }

  function collectBlocks() {
    const blocks = [];
    const blockMap = new Map();
    const blockOfCache = new Map();
    if (!document.body) return blocks;

    const walk = (root) => {
      if (!root || (root.nodeType === 1 && root.id === HOST_ID)) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAG.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest(`#${HOST_ID}, [hidden]`)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        let blockEl = blockOfCache.get(parent);
        if (!blockEl) {
          blockEl = computeBlock(parent);
          blockOfCache.set(parent, blockEl);
        }
        let block = blockMap.get(blockEl);
        if (!block) {
          block = { segments: [], text: '' };
          blockMap.set(blockEl, block);
          blocks.push(block);
        }
        const text = node.nodeValue;
        block.segments.push({ node, text, offset: block.text.length });
        block.text += text;
      }
      if (!root.querySelectorAll) return;
      const all = root.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const element = all[i];
        if (element.shadowRoot && element.id !== HOST_ID) walk(element.shadowRoot);
      }
    };

    walk(document.body);
    return blocks;
  }

  function rangesFor(segments, start, end) {
    const ranges = [];
    segments.forEach((segment) => {
      const segStart = segment.offset;
      const segEnd = segment.offset + segment.text.length;
      if (end <= segStart || start >= segEnd) return;
      const from = Math.max(start, segStart) - segStart;
      const to = Math.min(end, segEnd) - segStart;
      if (to <= from) return;
      try {
        const range = document.createRange();
        range.setStart(segment.node, from);
        range.setEnd(segment.node, to);
        ranges.push(range);
      } catch (e) {}
    });
    return ranges;
  }

  function firstRect(range) {
    try {
      const rects = range.getClientRects();
      if (rects.length) return rects[0];
      return range.getBoundingClientRect();
    } catch (e) {
      return null;
    }
  }

  function reveal(range) {
    if (!range) return;
    const origin = range.startContainer.nodeType === 1
      ? range.startContainer
      : range.startContainer.parentElement;
    if (!origin) return;
    const nodes = [];
    for (let node = origin.parentElement; node; node = node.parentElement) nodes.push(node);
    nodes.forEach((node) => {
      if (node === document.body || node === document.documentElement || node === document.scrollingElement) return;
      let style;
      try { style = getComputedStyle(node); } catch (e) { return; }
      const canY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
      const canX = /(auto|scroll|overlay)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 2;
      if (!canY && !canX) return;
      const rect = firstRect(range);
      if (!rect || (rect.width === 0 && rect.height === 0)) return;
      const parentRect = node.getBoundingClientRect();
      if (canY && (rect.top < parentRect.top + 8 || rect.bottom > parentRect.bottom - 8)) {
        node.scrollTop += rect.top - (parentRect.top + node.clientHeight * 0.3);
      }
      if (canX && (rect.left < parentRect.left + 8 || rect.right > parentRect.right - 8)) {
        node.scrollLeft += rect.left - (parentRect.left + 40);
      }
    });
    const rect = firstRect(range);
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    if (rect.top < 72 || rect.bottom > window.innerHeight - 24) {
      window.scrollBy(0, rect.top - window.innerHeight * 0.3);
    }
  }

  function clearMarks(root, parents) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('mark[data-mfind="1"]').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      if (parent.nodeType === 1) parents.push(parent);
    });
    root.querySelectorAll('*').forEach((element) => {
      if (element.shadowRoot && element.id !== HOST_ID) clearMarks(element.shadowRoot, parents);
    });
  }

  function clearHighlights() {
    if (canHighlight()) {
      PALETTE.forEach((item) => CSS.highlights.delete(item.name));
      CSS.highlights.delete(CURRENT.name);
    }
    const parents = [];
    if (document.body) clearMarks(document.body, parents);
    parents.forEach((parent) => {
      try { parent.normalize(); } catch (e) {}
    });
  }

  function applyCssHighlights() {
    const groups = PALETTE.map(() => []);
    state.matches.forEach((match) => {
      const bucket = groups[match.keywordIndex % PALETTE.length];
      match.ranges.forEach((range) => bucket.push(range));
    });
    groups.forEach((ranges, index) => {
      if (!ranges.length) return;
      const highlight = new Highlight();
      ranges.forEach((range) => highlight.add(range));
      try { highlight.priority = 1; } catch (e) {}
      CSS.highlights.set(PALETTE[index].name, highlight);
    });
    paintCurrent();
  }

  function applyMarkHighlights() {
    const jobs = [];
    state.matches.forEach((match, index) => {
      match.ranges.forEach((range) => {
        jobs.push({ range, index, keywordIndex: match.keywordIndex });
      });
    });
    jobs.sort((a, b) => -a.range.compareBoundaryPoints(Range.START_TO_START, b.range));
    jobs.forEach((job) => {
      const mark = document.createElement('mark');
      mark.className = `mfind-mark mfind-k${job.keywordIndex % PALETTE.length}`;
      mark.dataset.mfind = '1';
      mark.dataset.mfindI = String(job.index);
      if (job.index === state.index) mark.classList.add('mfind-current');
      try {
        job.range.surroundContents(mark);
      } catch (e) {}
    });
  }

  function applyHighlights() {
    ensureStyle();
    if (canHighlight()) applyCssHighlights();
    else applyMarkHighlights();
  }

  function visitRoots(callback) {
    const visit = (root) => {
      if (!root || !root.querySelectorAll) return;
      callback(root);
      root.querySelectorAll('*').forEach((element) => {
        if (element.shadowRoot && element.id !== HOST_ID) visit(element.shadowRoot);
      });
    };
    if (document.body) visit(document.body);
  }

  function paintCurrent() {
    const match = state.matches[state.index];
    if (canHighlight()) {
      CSS.highlights.delete(CURRENT.name);
      if (!match) return;
      const highlight = new Highlight();
      match.ranges.forEach((range) => highlight.add(range));
      try { highlight.priority = 10; } catch (e) {}
      CSS.highlights.set(CURRENT.name, highlight);
      return;
    }
    visitRoots((root) => {
      root.querySelectorAll('mark.mfind-current').forEach((mark) => mark.classList.remove('mfind-current'));
      if (!match) return;
      root.querySelectorAll(`mark[data-mfind-i="${state.index}"]`).forEach((mark) => {
        mark.classList.add('mfind-current');
      });
    });
  }

  function badge(count) {
    try {
      chrome.runtime.sendMessage({ type: 'BADGE', count: count || 0 });
    } catch (e) {}
  }

  function updateShortcutLabel() {
    const refs = state.refs;
    if (!refs) return;
    const label = formatShortcut(state.shortcut);
    refs.kbd.hidden = !label;
    refs.kbd.textContent = label;
  }

  function placeholderText() {
    return state.options.splitSpace
      ? '多个关键字用空格、| 或逗号分隔'
      : '多个关键字用 | 或逗号分隔';
  }

  function syncOptionUI() {
    const refs = state.refs;
    if (!refs) return;
    refs.caseBtn.setAttribute('aria-pressed', state.options.caseSensitive ? 'true' : 'false');
    refs.wordBtn.setAttribute('aria-pressed', state.options.wholeWord ? 'true' : 'false');
    refs.spaceBtn.setAttribute('aria-pressed', state.options.splitSpace ? 'true' : 'false');
    const mode = state.options.mode === 'all' ? 'all' : 'any';
    refs.modeLabel.textContent = mode === 'all' ? '同一段包含全部' : '匹配任一关键字';
    refs.modeMenu.querySelectorAll('.mode-item').forEach((item) => {
      item.setAttribute('aria-selected', item.dataset.value === mode ? 'true' : 'false');
    });
    refs.input.placeholder = placeholderText();
  }

  function updateCount() {
    const refs = state.refs;
    const total = state.matches.length;
    const hasQuery = state.keywords.length > 0;
    if (!hasQuery) refs.count.textContent = '输入关键字';
    else if (!total) refs.count.textContent = '无匹配';
    else refs.count.textContent = `${state.index + 1} / ${total}`;
    const disabled = total === 0;
    refs.prev.disabled = disabled;
    refs.next.disabled = disabled;
    badge(state.open && total ? total : 0);
  }

  function renderChips() {
    const refs = state.refs;
    refs.chips.replaceChildren();
    state.keywords.forEach((keyword, index) => {
      const count = state.counts[index] || 0;
      const chip = el('span', 'chip' + (count === 0 ? ' is-zero' : ''));
      const dot = el('i', 'dot');
      dot.style.background = PALETTE[index % PALETTE.length].bg;
      const name = el('span', 'name', keyword);
      name.title = keyword;
      const num = el('b', '', String(count));
      chip.append(dot, name, num);
      refs.chips.appendChild(chip);
    });
  }

  function renderHint() {
    const bits = [];
    if (!canHighlight()) bits.push('当前环境用不了原生高亮，已改用标记高亮');
    if (state.keywordTruncated) bits.push('最多 20 个关键字，其余已忽略');
    if (state.matchTruncated) bits.push('匹配较多，只标注前 5000 处');
    if (state.options.mode === 'all' && state.keywords.length > 1) {
      bits.push('只保留同一段落里同时出现全部关键字的结果');
    }
    state.refs.hint.textContent = bits.join(' · ');
  }

  function scrollListTo(node) {
    const list = state.refs.list;
    const itemRect = node.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
    else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
  }

  function renderItem(match, index) {
    const button = el('button', 'item' + (index === state.index ? ' is-current' : ''));
    button.type = 'button';
    button.tabIndex = -1;
    button.dataset.i = String(index);
    const idx = el('span', 'idx', String(index + 1));
    const snip = el('span', 'snip');
    const mid = el('span', 'mid', match.mid || match.keyword);
    mid.style.background = PALETTE[match.keywordIndex % PALETTE.length].bg;
    snip.append(el('span', '', match.before), mid, el('span', '', match.after));
    button.append(idx, snip);
    keepFocus(button);
    button.addEventListener('click', () => goTo(index));
    return button;
  }

  function renderList() {
    const refs = state.refs;
    const total = state.matches.length;
    refs.list.replaceChildren();
    if (!state.keywords.length) {
      state.listStart = 0;
      refs.listMeta.textContent = '';
      return;
    }
    if (!total) {
      state.listStart = 0;
      refs.listMeta.textContent = '';
      refs.list.appendChild(el('div', 'emptyline', '没有找到匹配'));
      return;
    }
    if (state.index < state.listStart || state.index >= state.listStart + LIST_SIZE) {
      state.listStart = total <= LIST_SIZE ? 0 : Math.max(0, Math.min(state.index - 12, total - LIST_SIZE));
    }
    const end = Math.min(total, state.listStart + LIST_SIZE);
    refs.listMeta.textContent = total > LIST_SIZE ? `显示 ${state.listStart + 1}–${end}，共 ${total} 处` : '';
    const fragment = document.createDocumentFragment();
    for (let i = state.listStart; i < end; i++) fragment.appendChild(renderItem(state.matches[i], i));
    refs.list.appendChild(fragment);
    const current = refs.list.querySelector('.is-current');
    if (current) scrollListTo(current);
  }

  function syncListCurrent() {
    const total = state.matches.length;
    if (!total) {
      renderList();
      return;
    }
    if (state.index < state.listStart || state.index >= state.listStart + LIST_SIZE) {
      renderList();
      return;
    }
    const prev = state.refs.list.querySelector('.is-current');
    if (prev) prev.classList.remove('is-current');
    const current = state.refs.list.querySelector(`[data-i="${state.index}"]`);
    if (!current) {
      renderList();
      return;
    }
    current.classList.add('is-current');
    scrollListTo(current);
  }

  function renderHistory() {
    const cleaned = dedupeHistory(state.history);
    if (JSON.stringify(cleaned) !== JSON.stringify(state.history)) {
      state.history = cleaned;
      persistHistory();
    }
    const refs = state.refs;
    refs.histBtn.textContent = `历史 (${state.history.length})`;
    refs.histBtn.setAttribute('aria-expanded', state.historyOpen ? 'true' : 'false');
    refs.history.hidden = !state.historyOpen;
    refs.history.replaceChildren();
    if (!state.historyOpen) return;
    if (!state.history.length) {
      refs.history.appendChild(el('div', 'emptyline', '还没有搜索历史'));
      return;
    }
    state.history.forEach((item) => {
      const row = el('div', 'hrow');
      const main = el('button', 'hmain');
      main.type = 'button';
      const query = el('span', 'hq', item.q);
      query.title = item.q;
      main.append(query, el('span', 'ht', formatTime(item.t)));
      keepFocus(main);
      main.addEventListener('click', () => applyHistory(item));
      const del = el('button', 'hdel', '×');
      del.type = 'button';
      del.setAttribute('aria-label', '删除这条历史');
      keepFocus(del);
      del.addEventListener('click', () => {
        const key = historyIdentity(item);
        const queryKey = normalizeQuery(item.q);
        state.history = state.history.filter((entry) => (
          historyIdentity(entry) !== key && normalizeQuery(entry.q) !== queryKey
        ));
        persistHistory();
        renderHistory();
      });
      row.append(main, del);
      refs.history.appendChild(row);
    });
    const clear = el('button', 'hclear', '清除全部历史');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      if (clear.dataset.arm !== '1') {
        clear.dataset.arm = '1';
        clear.textContent = '再点一次确认清除';
        setTimeout(() => {
          if (!clear.isConnected) return;
          clear.dataset.arm = '0';
          clear.textContent = '清除全部历史';
        }, 2500);
        return;
      }
      state.history = [];
      persistHistory();
      renderHistory();
    });
    refs.history.appendChild(clear);
  }

  function applyHistory(item) {
    state.query = item.q || '';
    state.options = {
      caseSensitive: !!item.caseSensitive,
      wholeWord: !!item.wholeWord,
      splitSpace: !!item.splitSpace,
      mode: item.mode === 'all' ? 'all' : 'any'
    };
    state.refs.input.value = state.query;
    state.refs.clear.hidden = !state.query;
    syncOptionUI();
    saveOptions();
    state.historyOpen = false;
    runSearch('input');
  }

  function setOption(key, value) {
    state.options[key] = value;
    syncOptionUI();
    saveOptions();
    scheduleSearch('option');
  }

  function bindOption(button, key) {
    button.addEventListener('click', () => setOption(key, !state.options[key]));
  }

  function trapWheel(event) {
    const scroller = event.target.closest('.list, .history, .body');
    if (!scroller) {
      event.preventDefault();
      return;
    }
    const delta = event.deltaY;
    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if ((delta < 0 && atTop) || (delta > 0 && atBottom) || scroller.scrollHeight <= scroller.clientHeight + 1) {
      event.preventDefault();
    }
  }

  function centerHost() {
    const host = state.host;
    if (!host) return;
    const width = host.offsetWidth || Math.min(560, window.innerWidth - 32);
    const height = host.offsetHeight;
    const left = Math.max(8, Math.round((window.innerWidth - width) / 2));
    const top = height
      ? Math.max(8, Math.round((window.innerHeight - height) / 2))
      : Math.max(8, Math.round((window.innerHeight - 280) / 2));
    host.style.transform = 'none';
    host.style.right = 'auto';
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  }

  function clampHost() {
    const host = state.host;
    if (!host || host.hidden) return;
    if (!state.moved) {
      centerHost();
      return;
    }
    const rect = host.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - rect.width - 8));
    const top = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - Math.min(rect.height, window.innerHeight - 16) - 8));
    if (Math.abs(left - rect.left) > 1 || Math.abs(top - rect.top) > 1) {
      host.style.transform = 'none';
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      host.style.right = 'auto';
    }
  }

  async function loadPanelCss() {
    if (loadPanelCss.cache) return loadPanelCss.cache;
    const response = await fetch(chrome.runtime.getURL('panel.css'));
    if (!response.ok) throw new Error('panel.css');
    loadPanelCss.cache = await response.text();
    return loadPanelCss.cache;
  }

  async function buildPanel() {
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.hidden = true;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    try {
      style.textContent = await loadPanelCss();
    } catch (e) {}
    const panel = el('div', 'panel');
    const header = el('div', 'hd');
    header.appendChild(el('span', 'grip'));
    const title = el('div', 'title');
    title.append(document.createTextNode('页面查找'), el('span', 'kbd'));
    const close = el('button', 'iconbtn');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    close.appendChild(svgIcon(['M4.5 4.5 L11.5 11.5', 'M11.5 4.5 L4.5 11.5']));
    header.append(title, close);

    const body = el('div', 'body');
    const search = el('div', 'search');
    const field = el('div', 'field');
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', '查找关键字');
    input.placeholder = placeholderText();
    const clear = el('button', 'clear');
    clear.type = 'button';
    clear.hidden = true;
    clear.setAttribute('aria-label', '清除输入');
    clear.appendChild(svgIcon(['M4.5 4.5 L11.5 11.5', 'M11.5 4.5 L4.5 11.5']));
    field.append(input, clear);
    const prev = el('button', 'nav');
    prev.type = 'button';
    prev.setAttribute('aria-label', '上一处');
    prev.appendChild(svgIcon(['M3.5 10.5 L8 5.5 L12.5 10.5']));
    const next = el('button', 'nav next');
    next.type = 'button';
    next.setAttribute('aria-label', '下一处');
    next.appendChild(svgIcon(['M3.5 5.5 L8 10.5 L12.5 5.5']));
    search.append(field, prev, next);

    const meta = el('div', 'meta');
    const count = el('div', 'count', '输入关键字');
    count.setAttribute('aria-live', 'polite');
    const chips = el('div', 'chips');
    meta.append(count, chips);

    const opts = el('div', 'opts');
    const caseBtn = el('button', 'opt', '区分大小写');
    caseBtn.type = 'button';
    caseBtn.title = '英文大小写按原样匹配';
    const wordBtn = el('button', 'opt', '全词匹配');
    wordBtn.type = 'button';
    wordBtn.title = '避免匹配到更长的英文单词；中文仍按原文匹配';
    const spaceBtn = el('button', 'opt', '空格分隔');
    spaceBtn.type = 'button';
    spaceBtn.title = '把空格也当作关键字分隔符';
    const mode = el('div', 'mode');
    const modeBtn = el('button', 'mode-btn');
    modeBtn.type = 'button';
    modeBtn.setAttribute('aria-haspopup', 'listbox');
    modeBtn.setAttribute('aria-expanded', 'false');
    modeBtn.setAttribute('aria-label', '匹配方式');
    const modeLabel = el('span', 'mode-label', '匹配任一关键字');
    modeBtn.append(modeLabel, svgIcon(['M3.5 6 L8 10.5 L12.5 6']));
    mode.appendChild(modeBtn);
    const modeMenu = el('div', 'mode-menu');
    modeMenu.hidden = true;
    modeMenu.setAttribute('role', 'listbox');
    modeMenu.setAttribute('aria-label', '匹配方式');
    opts.append(caseBtn, wordBtn, spaceBtn, mode);

    const hint = el('div', 'hint');
    const listMeta = el('div', 'listmeta');
    const list = el('div', 'list');
    const tools = el('div', 'tools');
    const histBtn = el('button', 'histbtn', '历史 (0)');
    histBtn.type = 'button';
    histBtn.setAttribute('aria-expanded', 'false');
    tools.appendChild(histBtn);
    const history = el('div', 'history');
    history.hidden = true;
    body.append(search, meta, opts, hint, listMeta, list, tools, history);

    const foot = el('div', 'foot', 'Enter / F3 下一处 · Shift+Enter 上一处 · Esc 关闭');
    panel.append(header, body, foot);
    panel.addEventListener('wheel', trapWheel, { passive: false });
    shadow.append(style, panel, modeMenu);
    document.documentElement.appendChild(host);

    state.host = host;
    state.refs = {
      kbd: title.querySelector('.kbd'),
      input,
      clear,
      prev,
      next,
      count,
      chips,
      caseBtn,
      wordBtn,
      spaceBtn,
      modeBtn,
      modeLabel,
      modeMenu,
      hint,
      listMeta,
      list,
      histBtn,
      history
    };

    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      const rect = host.getBoundingClientRect();
      state.drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, pointerId: event.pointerId };
      header.setPointerCapture(event.pointerId);
    });
    header.addEventListener('pointermove', (event) => {
      if (!state.drag || event.pointerId !== state.drag.pointerId) return;
      const width = host.getBoundingClientRect().width;
      const x = Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - state.drag.dx));
      const y = Math.max(8, Math.min(window.innerHeight - 48, event.clientY - state.drag.dy));
      host.style.transform = 'none';
      host.style.left = `${x}px`;
      host.style.top = `${y}px`;
      host.style.right = 'auto';
    });
    const endDrag = (event) => {
      if (!state.drag || (event && event.pointerId !== state.drag.pointerId)) return;
      state.drag = null;
      state.moved = true;
    };
    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);

    close.addEventListener('click', closePanel);
    keepFocus(prev);
    keepFocus(next);
    keepFocus(clear);
    prev.addEventListener('click', () => {
      rememberNow();
      goTo(state.index - 1);
    });
    next.addEventListener('click', () => {
      rememberNow();
      goTo(state.index + 1);
    });
    clear.addEventListener('click', () => {
      input.value = '';
      state.query = '';
      input.focus();
      scheduleSearch('input');
    });
    input.addEventListener('input', () => {
      state.refs.clear.hidden = !input.value;
      if (state.composing) return;
      state.query = input.value;
      scheduleSearch('input');
    });
    input.addEventListener('compositionstart', () => { state.composing = true; });
    input.addEventListener('compositionend', () => {
      state.composing = false;
      state.query = input.value;
      state.refs.clear.hidden = !input.value;
      scheduleSearch('input');
    });
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.key === 'Process') return;
      if (event.key !== 'Enter') return;
      event.preventDefault();
      rememberNow();
      goTo(state.index + (event.shiftKey ? -1 : 1));
    });
    bindOption(caseBtn, 'caseSensitive');
    bindOption(wordBtn, 'wholeWord');
    bindOption(spaceBtn, 'splitSpace');
    modeMenu.append(
      modeChoice('any', '匹配任一关键字', '标出每一个关键字'),
      modeChoice('all', '同一段包含全部', '只保留同一段落里同时出现的结果')
    );
    modeBtn.addEventListener('click', () => {
      if (state.modeOpen) closeModeMenu();
      else openModeMenu();
    });
    histBtn.addEventListener('click', () => {
      state.historyOpen = !state.historyOpen;
      renderHistory();
    });

    input.value = state.query;
    state.refs.clear.hidden = !state.query;
    syncOptionUI();
    updateShortcutLabel();
    renderHistory();
  }

  function resetResults() {
    state.keywords = [];
    state.counts = [];
    state.matches = [];
    state.index = 0;
    state.keywordTruncated = false;
    state.matchTruncated = false;
  }

  function runSearch(reason) {
    if (!state.open || !state.refs) return;
    stopObserve();
    state.applying = true;
    try {
      clearHighlights();
      const parsed = MFSearch.parseKeywords(state.query, state.options);
      if (!parsed.keywords.length) {
        resetResults();
        state.keywordTruncated = parsed.truncated;
        renderChips();
        renderHint();
        renderList();
        updateCount();
        state.refs.clear.hidden = !state.refs.input.value;
        saveSession();
        return;
      }
      const blocks = collectBlocks();
      const result = MFSearch.searchBlocks(blocks.map((block) => block.text), state.query, state.options);
      state.keywords = result.keywords;
      state.counts = result.counts;
      state.keywordTruncated = result.keywordTruncated;
      state.matchTruncated = result.truncated;
      state.matches = [];
      result.matches.forEach((item) => {
        const block = blocks[item.blockIndex];
        if (!block) return;
        const ranges = rangesFor(block.segments, item.start, item.end);
        if (!ranges.length) return;
        const snippet = makeSnippet(block.text, item.start, item.end);
        state.matches.push({
          keywordIndex: item.keywordIndex,
          keyword: item.keyword,
          ranges,
          before: snippet.before,
          mid: snippet.mid,
          after: snippet.after
        });
      });
      const total = state.matches.length;
      if (reason === 'mutate') {
        if (state.index >= total) state.index = 0;
      } else if (reason === 'open') {
        const preferred = state.hasSearched ? state.index : state.restoreIndex;
        state.index = total ? Math.min(Math.max(0, preferred || 0), total - 1) : 0;
      } else {
        state.index = 0;
      }
      state.hasSearched = true;
      if (total) applyHighlights();
      renderChips();
      renderHint();
      renderList();
      updateCount();
      state.refs.clear.hidden = !state.refs.input.value;
      if (reason !== 'mutate' && total) reveal(state.matches[state.index].ranges[0]);
      if (reason !== 'mutate') rememberSoon();
      saveSession();
    } catch (e) {
      state.refs.hint.textContent = '这一页暂时无法完成查找';
    } finally {
      state.applying = false;
      if (state.open) startObserve();
    }
  }

  function scheduleSearch(reason) {
    if (reason === 'input' || reason === 'option') state.pendingReason = reason;
    else if (state.pendingReason !== 'input' && state.pendingReason !== 'option') state.pendingReason = reason;
    const delay = state.pendingReason === 'mutate' ? 450 : 70;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      const next = state.pendingReason || reason;
      state.pendingReason = '';
      runSearch(next);
    }, delay);
  }

  function goTo(index) {
    const total = state.matches.length;
    if (!total) return;
    state.index = ((index % total) + total) % total;
    paintCurrent();
    updateCount();
    syncListCurrent();
    reveal(state.matches[state.index].ranges[0]);
    saveSession();
  }

  function startObserve() {
    if (state.observer || !document.documentElement) return;
    state.observer = new MutationObserver(() => {
      if (!state.open || state.applying) return;
      scheduleSearch('mutate');
    });
    state.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  function stopObserve() {
    if (!state.observer) return;
    state.observer.disconnect();
    state.observer = null;
  }

  function focusInput() {
    const input = state.refs && state.refs.input;
    if (!input) return;
    input.focus();
    input.select();
  }

  function modeChoice(value, title, desc) {
    const button = el('button', 'mode-item');
    button.type = 'button';
    button.dataset.value = value;
    button.setAttribute('role', 'option');
    const text = el('span', 'mode-text');
    text.append(el('span', 'mode-title', title), el('span', 'mode-desc', desc));
    const check = el('span', 'mode-check');
    check.appendChild(svgIcon(['M3.5 8.2 L6.6 11.2 L12.5 4.8']));
    button.append(text, check);
    button.addEventListener('click', () => {
      setOption('mode', value);
      closeModeMenu();
    });
    return button;
  }

  function openModeMenu() {
    const refs = state.refs;
    if (!refs) return;
    state.modeOpen = true;
    refs.modeBtn.setAttribute('aria-expanded', 'true');
    refs.modeMenu.hidden = false;
    const btn = refs.modeBtn.getBoundingClientRect();
    const menu = refs.modeMenu;
    menu.style.minWidth = `${Math.max(220, Math.round(btn.width))}px`;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let top = btn.bottom + 8;
    if (top + height > window.innerHeight - 8) top = Math.max(8, btn.top - height - 8);
    let left = btn.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function closeModeMenu() {
    state.modeOpen = false;
    if (!state.refs) return;
    state.refs.modeBtn.setAttribute('aria-expanded', 'false');
    state.refs.modeMenu.hidden = true;
  }

  function closePanel() {
    closeModeMenu();
    state.open = false;
    clearTimeout(state.timer);
    state.pendingReason = '';
    saveSession();
    if (state.query.trim()) rememberNow();
    stopObserve();
    state.applying = true;
    try { clearHighlights(); } finally { state.applying = false; }
    removeStyle();
    if (state.host) state.host.hidden = true;
    badge(0);
  }

  async function openFresh(options) {
    await loadPersisted();
    if (!state.host) await buildPanel();
    ensureStyle();
    state.host.hidden = false;
    state.open = true;
    state.refs.input.value = state.query;
    state.refs.clear.hidden = !state.query;
    syncOptionUI();
    updateShortcutLabel();
    renderHistory();
    state.moved = false;
    runSearch('open');
    centerHost();
    if (options.focus) focusInput();
  }

  function ensureOpen(options) {
    const opts = options || {};
    if (state.open && state.host) {
      state.host.hidden = false;
      updateShortcutLabel();
      if (opts.focus) focusInput();
      return Promise.resolve();
    }
    if (opening) return opening.then(() => ensureOpen(opts));
    opening = openFresh(opts).finally(() => { opening = null; });
    return opening;
  }

  function nudge(delta) {
    if (!state.open) {
      ensureOpen({ focus: false }).catch(() => {});
      return;
    }
    goTo(state.index + delta);
  }

  window.addEventListener('keydown', (event) => {
    if (!state.open) return;
    if (event.key === 'F3') {
      event.preventDefault();
      event.stopPropagation();
      goTo(state.index + (event.shiftKey ? -1 : 1));
      return;
    }
    if (event.key !== 'Escape') return;
    if (state.modeOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeModeMenu();
      return;
    }
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (state.host && path.indexOf(state.host) !== -1) {
      event.preventDefault();
      event.stopPropagation();
      closePanel();
    }
  }, true);

  window.addEventListener('pointerdown', (event) => {
    if (!state.modeOpen || !state.refs) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.indexOf(state.refs.modeMenu) !== -1 || path.indexOf(state.refs.modeBtn) !== -1) return;
    closeModeMenu();
  }, true);

  window.addEventListener('resize', () => {
    if (state.open) clampHost();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.shortcut) state.shortcut = msg.shortcut;
    if (msg.type === 'TOGGLE') {
      if (state.open) closePanel();
      else ensureOpen({ focus: true }).catch(() => {});
    } else if (msg.type === 'NEXT') {
      nudge(1);
    } else if (msg.type === 'PREV') {
      nudge(-1);
    }
  });
})();
