// Plain rendered table text only. Never inspect row data or form-control values.
export function installTableOverflowTooltips() {
  const installation = Symbol.for('gkx.tableOverflowTooltips');
  if (window[installation]) return window[installation];

  const sensitive = '.token-value-cell,.masked-token,[data-overflow-sensitive],[data-overflow-ignore]';
  const controls = 'button,input,select,textarea,[role="button"],[role="checkbox"],[role="radio"],[contenteditable="true"]';
  const excludedCells = '.table-action-cell,.table-select-cell,.resource-picker-select-col,.inline-actions';
  const decoration = 'img,picture,svg,canvas,video,audio,iframe,[role="img"],[class*="avatar" i],[class*="logo" i]';
  const hidden = '[hidden],[aria-hidden="true"],.sr-only,.visually-hidden,script,style,template';
  const knownText = '[data-overflow-text],.table-cell-text,.report-version-cell,.page-tree-label-text,.page-route-text,.arco-table-th-item-title,.sortable-table-header>span:first-child';
  const secretHeading = /token|密钥|秘钥|密码|认证凭证|令牌(?:字符串|值)/i;
  let candidates = new Map();
  const addedTabStops = new Set();
  let active = null, tooltip = null, showTimer = 0, hideTimer = 0, frame = 0, focusFrame = 0;
  let stopped = false, serial = 0;
  let restoredTitles = [];

  const normalize = text => String(text ?? '').replace(/\s+/g, ' ').trim();
  const isOurNode = node => {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return !!element?.closest('[data-table-overflow-tooltip]');
  };
  const rendered = element => {
    if (!element?.isConnected || !element.getClientRects().length || element.closest(hidden)) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.display !== 'none' && style.opacity !== '0';
  };

  function displayedText(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const chunks = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent && rendered(parent) && !parent.closest(`${controls},${sensitive},${decoration}`)) chunks.push(node.nodeValue);
    }
    return chunks.join('').trim();
  }

  function isSensitiveCell(cell) {
    if (cell.closest(sensitive) || cell.querySelector(sensitive)) return true;
    const table = cell.closest('table');
    if (!table) return true;
    const rowLabel = Array.from(cell.parentElement?.children ?? []).find(node => node.tagName === 'TH' && node !== cell);
    if (cell.tagName === 'TD' && rowLabel && secretHeading.test(displayedText(rowLabel))) return true;
    const start = Array.from(cell.parentElement.children).slice(0, cell.cellIndex).reduce((sum, node) => sum + (node.colSpan || 1), 0);
    const end = start + (cell.colSpan || 1);
    const rows = table.tHead ? Array.from(table.tHead.rows) : Array.from(table.rows).slice(0, 1);
    // Row-spanning sensitive schemas are ambiguous; prefer excluding the table.
    if (table.querySelector('[rowspan]:not([rowspan="1"])') && rows.some(row => secretHeading.test(displayedText(row)))) return true;
    for (const row of rows) {
      if (row.closest('table') !== table) continue;
      let column = 0;
      for (const heading of row.cells) {
        const next = column + (heading.colSpan || 1);
        if (next > start && column < end && secretHeading.test(displayedText(heading))) return true;
        column = next;
      }
    }
    return false;
  }

  function actualClipping(element, cell) {
    let bounds;
    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      bounds = range.getBoundingClientRect();
    } catch { return false; }
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      const clipsX = /^(hidden|clip|auto|scroll)$/.test(style.overflowX);
      const clipsY = /^(hidden|clip|auto|scroll)$/.test(style.overflowY);
      if (clipsX && node.clientWidth && node.scrollWidth > node.clientWidth + 1) return true;
      if (clipsY && node.clientHeight && node.scrollHeight > node.clientHeight + 1) return true;
      const left = rect.left + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0);
      const right = rect.right - (parseFloat(style.borderRightWidth) || 0) - (parseFloat(style.paddingRight) || 0);
      const top = rect.top + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0);
      const bottom = rect.bottom - (parseFloat(style.borderBottomWidth) || 0) - (parseFloat(style.paddingBottom) || 0);
      if (clipsX && bounds.width && (bounds.left < left - 1 || bounds.right > right + 1)) return true;
      if (clipsY && bounds.height && (bounds.top < top - 1 || bounds.bottom > bottom + 1)) return true;
      if (node === cell) break;
    }
    return false;
  }

  function inspectCell(cell) {
    if (!rendered(cell) || cell.matches(excludedCells) || cell.closest(excludedCells) || cell.querySelector('table') || isSensitiveCell(cell)) return [];
    const possible = [...cell.querySelectorAll(knownText), cell];
    const found = [];
    for (const element of possible) {
      if (element.closest('td,th') !== cell || !rendered(element) || element.closest(`${controls},${sensitive},${decoration}`)) continue;
      if (element.querySelector(`${controls},${sensitive},${decoration}`)) continue;
      // Prefer a specific text wrapper over a duplicate tooltip on its parent cell.
      if (element === cell && found.length) continue;
      const shown = displayedText(element);
      const full = element.hasAttribute('data-overflow-text') ? element.getAttribute('data-overflow-text').trim() : shown;
      if (!normalize(full)) continue;
      const explicitlyShortened = element.hasAttribute('data-overflow-text') && normalize(full) !== normalize(shown);
      if (explicitlyShortened || actualClipping(element, cell)) found.push({ element, cell, text: full });
    }
    return found.filter(candidate => !found.some(other => other !== candidate && candidate.element.contains(other.element)
      && (normalize(candidate.text) === normalize(other.text) || other.element.hasAttribute('data-overflow-text'))));
  }

  function clearTimers() {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    showTimer = hideTimer = 0;
  }

  function hideTooltip() {
    clearTimers();
    if (active && tooltip) {
      const tokens = (active.element.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== tooltip.id);
      if (tokens.length) active.element.setAttribute('aria-describedby', tokens.join(' '));
      else active.element.removeAttribute('aria-describedby');
    }
    for (const [element, title] of restoredTitles) if (!element.hasAttribute('title')) element.setAttribute('title', title);
    restoredTitles = [];
    tooltip?.remove(); tooltip = null; active = null;
  }

  function showTooltip(candidate) {
    clearTimers();
    if (stopped || !candidate || !rendered(candidate.element) || isSensitiveCell(candidate.cell)) return;
    candidate = inspectCell(candidate.cell).find(item => item.element === candidate.element);
    if (!candidate) { hideTooltip(); return; }
    if (active?.element === candidate.element && active.text === candidate.text) return;
    hideTooltip();
    active = candidate;
    tooltip = document.createElement('div');
    tooltip.className = 'table-cell-tooltip gkx-table-overflow-tooltip';
    tooltip.dataset.tableOverflowTooltip = '';
    tooltip.id = `gkx-table-overflow-${++serial}`;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = candidate.text;
    // Suppress existing native titles only while the custom tooltip is visible.
    for (const element of [candidate.cell, ...candidate.cell.querySelectorAll('[title]')]) {
      if (!element.hasAttribute('title')) continue;
      restoredTitles.push([element, element.getAttribute('title')]);
      element.removeAttribute('title');
    }
    document.body.appendChild(tooltip);
    const described = (candidate.element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    candidate.element.setAttribute('aria-describedby', [...new Set([...described, tooltip.id])].join(' '));
    const anchor = candidate.element.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
    const gutter = 8, gap = 8;
    const below = window.innerHeight - anchor.bottom - gutter;
    const top = below >= box.height + gap || anchor.top < box.height + gap
      ? Math.min(anchor.bottom + gap, window.innerHeight - box.height - gutter)
      : anchor.top - box.height - gap;
    tooltip.style.left = `${Math.max(gutter, Math.min(anchor.left, window.innerWidth - box.width - gutter))}px`;
    tooltip.style.top = `${Math.max(gutter, top)}px`;
  }

  function findCandidate(target) {
    let element = target?.nodeType === 1 ? target : target?.parentElement;
    if (!element || isOurNode(element)) return null;
    const cell = element.closest('td,th');
    if (!cell?.closest('table')) return null;
    if (element.closest(`${controls},${decoration}`)) return null;
    for (let node = element; node && node !== cell.parentElement; node = node.parentElement) {
      if (candidates.has(node)) return candidates.get(node);
    }
    const fresh = inspectCell(cell);
    for (const item of fresh) candidates.set(item.element, item);
    for (let node = element; node && node !== cell.parentElement; node = node.parentElement) {
      if (candidates.has(node)) return candidates.get(node);
    }
    // Padding belongs to the same cell even when its tooltip anchor is a text span.
    return fresh.find(item => item.element.hasAttribute('data-overflow-text')) || fresh[0] || null;
  }

  function delayedHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (active?.element.matches(':hover') || tooltip?.matches(':hover') || active?.element.contains(document.activeElement) || tooltip?.contains(document.activeElement)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && tooltip?.contains(selection.anchorNode)) return;
      hideTooltip();
    }, 180);
  }

  function onPointerOver(event) {
    if (isOurNode(event.target)) { clearTimeout(hideTimer); return; }
    const candidate = findCandidate(event.target);
    if (!candidate) return;
    clearTimeout(hideTimer); clearTimeout(showTimer);
    showTimer = setTimeout(() => showTooltip(candidate), 160);
  }
  function onPointerOut(event) {
    const next = event.relatedTarget;
    if (active?.element.contains(next) || tooltip?.contains(next)) return;
    clearTimeout(showTimer); delayedHide();
  }
  function onFocusIn(event) {
    if (isOurNode(event.target)) { clearTimeout(hideTimer); return; }
    cancelAnimationFrame(focusFrame);
    const candidate = findCandidate(event.target);
    if (candidate) {
      // Focus may scroll its table before this frame; open only after that move.
      focusFrame = requestAnimationFrame(() => {
        focusFrame = 0;
        if (!stopped && candidate.element.contains(document.activeElement)) showTooltip(candidate);
      });
    }
  }
  function onFocusOut(event) {
    cancelAnimationFrame(focusFrame); focusFrame = 0;
    if (active?.element.contains(event.relatedTarget) || tooltip?.contains(event.relatedTarget)) return;
    delayedHide();
  }
  function onKeyDown(event) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key !== 'Escape' || !tooltip) return;
    event.preventDefault(); event.stopImmediatePropagation(); hideTooltip();
  }
  function onScroll(event) {
    if (!isOurNode(event.target)) hideTooltip();
  }
  function onResize() { hideTooltip(); scheduleScan(); }
  function onPointerDown(event) {
    if (active && !active.element.contains(event.target) && !tooltip?.contains(event.target)) hideTooltip();
  }

  function scan() {
    frame = 0;
    if (stopped) return;
    const next = new Map();
    for (const cell of document.querySelectorAll('table td,table th')) {
      for (const candidate of inspectCell(cell)) next.set(candidate.element, candidate);
    }
    for (const element of addedTabStops) {
      if (next.has(element)) continue;
      if (element.getAttribute('tabindex') === '0') element.removeAttribute('tabindex');
      addedTabStops.delete(element);
    }
    for (const element of next.keys()) {
      if (!element.hasAttribute('tabindex')) { element.setAttribute('tabindex', '0'); addedTabStops.add(element); }
    }
    candidates = next;
    if (active && (!next.has(active.element) || next.get(active.element).text !== active.text)) hideTooltip();
  }
  function scheduleScan() {
    if (!frame && !stopped) frame = requestAnimationFrame(scan);
  }
  const observer = new MutationObserver(records => {
    if (active && !active.element.isConnected) hideTooltip();
    const relevant = records.some(record => {
      if (isOurNode(record.target)) return false;
      if (record.type === 'childList') return [...record.addedNodes, ...record.removedNodes].some(node => !isOurNode(node));
      return true;
    });
    if (relevant) scheduleScan();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-overflow-text', 'colspan', 'rowspan'] });
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  scheduleScan();

  const uninstall = () => {
    stopped = true; hideTooltip(); observer.disconnect(); cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame);
    for (const element of addedTabStops) if (element.getAttribute('tabindex') === '0') element.removeAttribute('tabindex');
    addedTabStops.clear(); candidates.clear();
    document.removeEventListener('pointerover', onPointerOver, true);
    document.removeEventListener('pointerout', onPointerOut, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    delete window[installation];
  };
  window[installation] = uninstall;
  return uninstall;
}
