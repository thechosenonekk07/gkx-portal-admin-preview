import { createColumnScale, columnRatio } from './event-behavior-chart.js';

// Behavior charts share one successful statistics snapshot with the host page.
export function createEventBehavior({ React }) {
  const h = React.createElement;
  const empty = [];
  const number = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  const rateText = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
  const average = row => row.visits > 0 && Number.isFinite(row.averageVisibleMs) ? Math.max(0, row.averageVisibleMs) : null;
  const rate = row => row.exposureVisits > 0 && Number.isFinite(row.rate) ? row.rate : null;
  const seconds = value => value == null ? '—' : `${number(value / 1000)} 秒`;
  const duration = value => {
    if (!Number.isFinite(value)) return '—';
    const totalSeconds = Math.max(0, value / 1000);
    if (totalSeconds < 60) return `${number(totalSeconds)} 秒`;
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = Math.round((totalSeconds % 60) * 10) / 10;
    return `${number(minutes)} 分${remainder ? ` ${number(remainder)} 秒` : ''}`;
  };
  const byId = (left, right) => String(left.id).localeCompare(String(right.id), 'en', { numeric: true });

  // Place absolute popovers in the actually visible scroll area, not inside
  // the chart's height. This also allows a single-row chart to show a full tip.
  function clippingBounds(element) {
    const viewport = window.visualViewport;
    const bounds = {
      left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
      right: (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth),
      bottom: (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight),
    };
    const clips = value => /(?:auto|scroll|hidden|clip|overlay)/.test(value);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = window.getComputedStyle(parent);
      const paint = /(?:paint|strict|content)/.test(style.contain || '');
      if (!paint && !clips(style.overflowX) && !clips(style.overflowY)) continue;
      const rect = parent.getBoundingClientRect();
      const scaleX = parent.offsetWidth ? rect.width / parent.offsetWidth : 1;
      const scaleY = parent.offsetHeight ? rect.height / parent.offsetHeight : 1;
      const left = rect.left + parent.clientLeft * scaleX;
      const top = rect.top + parent.clientTop * scaleY;
      if (paint || clips(style.overflowX)) {
        bounds.left = Math.max(bounds.left, left);
        bounds.right = Math.min(bounds.right, left + parent.clientWidth * scaleX);
      }
      if (paint || clips(style.overflowY)) {
        bounds.top = Math.max(bounds.top, top);
        bounds.bottom = Math.min(bounds.bottom, top + parent.clientHeight * scaleY);
      }
    }
    return bounds;
  }

  function useFloatingPosition(open, getAnchor, floatingRef, sourceKey, align = 'end', help = false) {
    const anchorGetter = React.useRef(getAnchor);
    anchorGetter.current = getAnchor;
    const [position, setPosition] = React.useState({ top: 0, left: 0, maxWidth: 312, maxHeight: 600, placement: 'below', visible: false });
    React.useLayoutEffect(() => {
      if (!open || !floatingRef.current) return;
      const floating = floatingRef.current;
      let frame = null;
      const measure = () => {
        const anchor = anchorGetter.current();
        if (!anchor?.isConnected || !floating.isConnected) return;
        const bounds = clippingBounds(floating);
        const target = anchor.getBoundingClientRect();
        const parent = floating.offsetParent;
        const parentRect = parent?.getBoundingClientRect();
        const scaleX = parent?.offsetWidth ? parentRect.width / parent.offsetWidth : 1;
        const scaleY = parent?.offsetHeight ? parentRect.height / parent.offsetHeight : 1;
        const maxWidth = Math.max(0, bounds.right - bounds.left - 16);
        const maxHeight = Math.max(0, bounds.bottom - bounds.top - 16);
        const rect = floating.getBoundingClientRect();
        const style = window.getComputedStyle(floating);
        const borderHeight = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
        const width = Math.min(rect.width, maxWidth);
        const height = Math.min(Math.max(rect.height, (floating.scrollHeight + borderHeight) * scaleY), maxHeight);
        const below = bounds.bottom - 8 - target.bottom - 8;
        const above = target.top - 8 - bounds.top - 8;
        const placement = below >= height ? 'below' : above >= height ? 'above' : below >= above ? 'below' : 'above';
        const preferredTop = placement === 'below' ? target.bottom + 8 : target.top - height - 8;
        const viewportTop = Math.max(bounds.top + 8, Math.min(preferredTop, bounds.bottom - height - 8));
        const staticHelp = help && window.getComputedStyle(anchor.parentElement).position === 'static';
        const preferredLeft = staticHelp && parentRect ? parentRect.left + (parent.clientLeft || 0) * scaleX
          : align === 'start' ? target.left : target.right - width - (help ? 0 : 8);
        const viewportLeft = Math.max(bounds.left + 8, Math.min(preferredLeft, bounds.right - width - 8));
        const anchorBounds = clippingBounds(anchor);
        const visible = maxWidth > 0 && maxHeight > 0 && target.right > Math.max(bounds.left, anchorBounds.left)
          && target.left < Math.min(bounds.right, anchorBounds.right)
          && target.bottom > Math.max(bounds.top, anchorBounds.top) && target.top < Math.min(bounds.bottom, anchorBounds.bottom);
        const next = {
          top: parentRect ? (viewportTop - parentRect.top - parent.clientTop * scaleY) / scaleY + parent.scrollTop : viewportTop + window.scrollY,
          left: parentRect ? (viewportLeft - parentRect.left - parent.clientLeft * scaleX) / scaleX + parent.scrollLeft : viewportLeft + window.scrollX,
          maxWidth: maxWidth / scaleX, maxHeight: maxHeight / scaleY, placement, visible,
        };
        setPosition(current => Object.keys(next).every(key => current[key] === next[key]) ? current : next);
      };
      const schedule = () => {
        if (frame != null) return;
        frame = window.requestAnimationFrame(() => { frame = null; measure(); });
      };
      measure();
      window.addEventListener('scroll', schedule, true);
      window.addEventListener('resize', schedule);
      window.visualViewport?.addEventListener('scroll', schedule);
      window.visualViewport?.addEventListener('resize', schedule);
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
      observer?.observe(floating);
      const anchor = anchorGetter.current();
      if (anchor) observer?.observe(anchor);
      if (floating.offsetParent) observer?.observe(floating.offsetParent);
      return () => {
        window.removeEventListener('scroll', schedule, true);
        window.removeEventListener('resize', schedule);
        window.visualViewport?.removeEventListener('scroll', schedule);
        window.visualViewport?.removeEventListener('resize', schedule);
        if (frame != null) window.cancelAnimationFrame(frame);
        observer?.disconnect();
      };
    }, [open, sourceKey, align, help]);
    return { ...position, style: {
      top: position.top, left: position.left, right: 'auto', maxWidth: position.maxWidth, maxHeight: position.maxHeight,
      overflowY: 'auto', overflowX: 'hidden', visibility: position.visible ? 'visible' : 'hidden',
    } };
  }

  function Info({ label, lines, loading, align }) {
    const [interaction, setInteraction] = React.useState({ hover: false, focus: false, dismissed: false });
    const id = React.useId();
    const anchorRef = React.useRef(null);
    const floatingRef = React.useRef(null);
    const open = !loading && !interaction.dismissed && (interaction.hover || interaction.focus);
    const floating = useFloatingPosition(open, () => anchorRef.current, floatingRef, label, align, true);
    const shown = open && floating.visible;
    React.useEffect(() => {
      if (loading) setInteraction({ hover: false, focus: false, dismissed: false });
    }, [loading]);
    return h('div', { className: `behavior-help${floating.placement === 'above' ? ' is-above' : ''}`,
      onMouseEnter: () => setInteraction(state => ({ ...state, hover: true, dismissed: false })),
      onMouseLeave: () => setInteraction(state => ({ ...state, hover: false })),
      onFocus: () => setInteraction(state => ({ ...state, focus: true, dismissed: false })),
      onBlur: () => setInteraction(state => ({ ...state, focus: false })),
    }, h('button', { type: 'button', className: 'behavior-info-button', disabled: loading, ref: anchorRef,
      'aria-label': `查看${label}计算口径`, 'aria-expanded': shown, 'aria-controls': shown ? id : undefined,
      'aria-describedby': shown ? id : undefined,
      onClick: () => setInteraction(state => ({ ...state, dismissed: false })),
      onKeyDown: event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setInteraction(state => ({ ...state, dismissed: true }));
      },
    }, h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
      h('circle', { cx: 8, cy: 8, r: 6, stroke: 'currentColor', strokeWidth: 1.5 }),
      h('path', { d: 'M8 7v4M8 4.5v.1', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }))),
    open && h('div', { ref: floatingRef, className: 'behavior-help-tooltip', id, role: 'tooltip', style: floating.style, 'aria-hidden': !floating.visible },
      h('strong', null, '计算口径'), lines.map((line, index) => h('p', { key: index }, line))));
  }

  const explanation = clicks => clicks ? [
    '点击率 = 点击访问数 ÷ 有效曝光访问数。',
    '同一次页面访问内，每个按钮的有效曝光和点击各计一次。',
    '没有有效曝光时显示“—”，不参与最低点击率排序。',
    '按访问开始日期归属，统计已结束的有效访问。',
  ] : [
    '平均有效停留时长 = 总有效停留时长 ÷ 有效访问次数。',
    '累计页面处于前台且可见的时间，切换到后台期间不计入。',
    '跨日、月、年按总时长与访问次数重新计算平均值。',
    '按访问开始日期归属，统计已结束的有效访问。',
  ];

  function Chart({ kind, rows, loading, lowIds, activeButtonId, selectedButtonId, onButtonHover, onButtonFocus, onButtonSelect, buttonRefs }) {
    const clicks = kind === 'clicks';
    const [hovered, setHovered] = React.useState(null);
    const [focused, setFocused] = React.useState(null);
    const [tabIndex, setTabIndex] = React.useState(0);
    const [dismissed, setDismissed] = React.useState(false);
    const hoverCloseRef = React.useRef(null);
    const keyboardMode = React.useRef(false);
    const rowRefs = React.useRef(new Map());
    const tooltipRef = React.useRef(null);
    const tooltipId = React.useId();
    const instructionsId = React.useId();
    const activeIndex = hovered ?? focused;
    const activeRow = activeIndex == null ? null : rows[activeIndex];
    const tooltipOpen = !loading && !dismissed && !!activeRow;
    const values = rows.map(row => clicks ? rate(row) : average(row) == null ? null : average(row) / 1000);
    const scale = createColumnScale(values, { kind });
    const floating = useFloatingPosition(tooltipOpen,
      () => rowRefs.current.get(activeRow?.id)?.querySelector('.behavior-column-fill, .behavior-column-marker'),
      tooltipRef, activeRow?.id);
    const cancelHoverClose = () => { if (hoverCloseRef.current != null) clearTimeout(hoverCloseRef.current); hoverCloseRef.current = null; };
    const leaveChart = () => {
      cancelHoverClose();
      hoverCloseRef.current = setTimeout(() => {
        hoverCloseRef.current = null; setHovered(null); if (clicks) onButtonHover(null, 'chart');
      }, 140);
    };
    React.useEffect(() => () => cancelHoverClose(), []);
    React.useEffect(() => {
      cancelHoverClose(); setHovered(null); setFocused(null); setTabIndex(0); setDismissed(false);
    }, [rows, loading]);
    const keydown = (event, index) => {
      keyboardMode.current = true;
      if (event.key === 'Escape') {
        event.preventDefault(); setDismissed(true); setHovered(null);
        if (clicks) { onButtonHover(null, 'chart'); onButtonFocus(null, 'chart'); }
        return;
      }
      const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1
        : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0;
      if (!direction && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, index + direction));
      setTabIndex(next); setHovered(null); setDismissed(false);
      if (clicks) { onButtonHover(null, 'chart'); onButtonFocus(rows[next]?.id ?? null, 'chart'); }
      rowRefs.current.get(rows[next]?.id)?.focus({ preventScroll: true });
      rowRefs.current.get(rows[next]?.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    };
    const tooltipLine = (label, value) => h('div', { className: 'behavior-tooltip-line' }, h('span', null, label), h('b', null, value));
    const title = clicks ? '按钮点击率' : '页面停留时长';
    return h('section', { className: clicks ? 'behavior-plot-section behavior-clicks' : 'behavior-panel behavior-duration' },
      !clicks && h('div', { className: 'behavior-panel-head' },
        h('div', { className: 'behavior-title' }, h('h3', null, title), h(Info, { label: title, lines: explanation(false), loading, align: 'start' })),
        h('span', { className: 'behavior-panel-sub' }, '按平均时长从高到低')),
      clicks && h('div', { className: 'behavior-plot-caption' }, h('span', null, '点击率分布'), h('span', null, '按点击率从低到高')),
      !rows.length ? h('div', { className: 'behavior-empty' }, loading ? '\u00a0' : `所选时间区间暂无${clicks ? '按钮点击' : '页面停留'}数据`)
        : h('div', { className: 'behavior-chart', onMouseEnter: cancelHoverClose, onMouseLeave: leaveChart },
        h('p', { className: 'behavior-sr-only', id: instructionsId }, `使用方向键查看相邻项目，Home、End 跳至首尾，Esc 关闭提示${clicks ? '，Enter 或空格选中按钮并查看建议' : ''}。`),
        h('div', { className: 'behavior-chart-scroll', tabIndex: -1 },
          h('div', { className: 'behavior-column-canvas', style: { '--behavior-count': rows.length } },
            h('div', { className: 'behavior-axis-unit', 'aria-hidden': true }, clicks ? '点击率（%）' : '平均有效停留（秒）'),
            h('div', { className: 'behavior-coordinate' },
              h('div', { className: 'behavior-grid', 'aria-hidden': true }, scale.ticks.map(tick =>
                h('div', { className: `behavior-grid-line${tick === 0 ? ' is-baseline' : ''}`, key: tick, style: { bottom: `${tick / scale.maximum * 100}%` } },
                  h('span', null, number(clicks ? tick * 100 : tick))))),
              h('ol', { className: 'behavior-columns', 'aria-label': clicks ? '按钮点击率柱状图' : '页面平均有效停留时长柱状图' }, rows.map((row, index) => {
                const value = values[index];
                const ratio = columnRatio(value, scale.maximum);
                const displayed = clicks ? rateText(value) : value == null ? '—' : `${number(value)} 秒`;
                const active = clicks ? activeButtonId === row.id : activeIndex === index;
                const selected = clicks && selectedButtonId === row.id;
                const lowRank = clicks ? lowIds.indexOf(row.id) : -1;
                return h('li', { key: row.id, className: 'behavior-column-item' },
                  h('button', { type: 'button', disabled: loading,
                    ref: element => {
                      if (element) { rowRefs.current.set(row.id, element); if (clicks) buttonRefs.current.set(row.id, element); }
                      else { rowRefs.current.delete(row.id); if (clicks) buttonRefs.current.delete(row.id); }
                    },
                    className: `behavior-column-target${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}${lowRank >= 0 ? ' is-low' : ''}`,
                    tabIndex: tabIndex === index ? 0 : -1,
                    'data-button-id': clicks ? row.id : undefined,
                    'aria-pressed': clicks ? selected : undefined,
                    'aria-label': `${row.label}，${clicks ? `${row.pageLabel || row.path || ''}，点击率${displayed}，有效曝光访问${number(row.exposureVisits)}次，点击访问${number(row.clickedVisits)}次` : `平均有效停留${displayed}，有效访问${number(row.visits)}次`}${lowRank >= 0 ? `，最低点击率第${lowRank + 1}项` : ''}`,
                    'aria-describedby': `${instructionsId}${tooltipOpen && floating.visible && activeIndex === index ? ` ${tooltipId}` : ''}`,
                    onMouseEnter: () => { if (!keyboardMode.current) { cancelHoverClose(); setHovered(index); setDismissed(false); if (clicks) onButtonHover(row.id, 'chart'); } },
                    onMouseMove: () => { if (keyboardMode.current) { keyboardMode.current = false; cancelHoverClose(); setHovered(index); setDismissed(false); if (clicks) onButtonHover(row.id, 'chart'); } },
                    onPointerDown: () => { keyboardMode.current = false; },
                    onFocus: () => { setTabIndex(index); setHovered(null); setFocused(index); setDismissed(false); if (clicks) onButtonFocus(row.id, 'chart'); },
                    onBlur: () => { setFocused(null); if (clicks) onButtonFocus(null, 'chart'); },
                    onClick: () => { setTabIndex(index); setDismissed(false); if (clicks) onButtonSelect(row.id); },
                    onKeyDown: event => keydown(event, index),
                  }, h('span', { className: 'behavior-column-slot' },
                    h('strong', { className: 'behavior-column-value', style: { bottom: `calc(${(ratio || 0) * 100}% + 6px)` } }, displayed),
                    ratio > 0 ? h('i', { className: 'behavior-column-fill', 'aria-hidden': true, style: { height: `${ratio * 100}%` } })
                      : h('i', { className: `behavior-column-marker${ratio == null ? ' is-missing' : ''}`, 'aria-hidden': true })),
                  h('span', { className: 'behavior-column-label' },
                    h('span', { className: 'behavior-label-name' }, row.label),
                    clicks && h('small', { className: 'behavior-label-context' }, row.pageLabel))));
              }))))),
        tooltipOpen && h('div', { ref: tooltipRef, className: 'behavior-tooltip', role: 'tooltip', id: tooltipId, style: floating.style, 'aria-hidden': !floating.visible, onMouseEnter: cancelHoverClose },
          h('strong', { className: 'behavior-tooltip-title' }, activeRow.label),
          clicks && h('span', { className: 'behavior-tooltip-page' }, activeRow.pageLabel),
          h('p', { className: 'behavior-tooltip-path' }, activeRow.path),
          clicks ? h(React.Fragment, null,
            tooltipLine('有效曝光访问数', `${number(activeRow.exposureVisits)} 次`),
            tooltipLine('点击访问数', `${number(activeRow.clickedVisits)} 次`),
            tooltipLine('点击率', rateText(rate(activeRow))),
            h('p', { className: 'behavior-tooltip-formula' }, activeRow.exposureVisits > 0
              ? `${number(activeRow.clickedVisits)} ÷ ${number(activeRow.exposureVisits)} × 100% = ${rateText(rate(activeRow))}` : '暂无有效曝光，点击率暂无法计算'))
            : h(React.Fragment, null,
              tooltipLine('有效访问次数', `${number(activeRow.visits)} 次`),
              tooltipLine('总有效停留时长', duration(activeRow.totalVisibleMs)),
              tooltipLine('平均有效停留时长', seconds(average(activeRow))),
              h('p', { className: 'behavior-tooltip-formula' }, activeRow.visits > 0
                ? `${number(activeRow.totalVisibleMs / 1000)} 秒 ÷ ${number(activeRow.visits)} 次 = ${seconds(average(activeRow))}` : '暂无有效访问，平均时长暂无法计算')))));
  }

  return function BehaviorAnalysis({ data, loading = false, renderModule = (_, content) => content }) {
    const pages = data?.pages || empty;
    const buttons = data?.buttons || empty;
    const candidates = data?.lowButtons || empty;
    const pageRows = React.useMemo(() => [...pages].sort((left, right) => (average(right) ?? -1) - (average(left) ?? -1) || byId(left, right)), [pages]);
    const buttonRows = React.useMemo(() => [...buttons].sort((left, right) => {
      const a = rate(left), b = rate(right);
      if (a == null || b == null) return a == null && b == null ? byId(left, right) : a == null ? 1 : -1;
      return a - b || right.exposureVisits - left.exposureVisits || byId(left, right);
    }), [buttons]);
    const lowButtons = React.useMemo(() => candidates.filter(row => rate(row) != null && row.optimizationEligible !== false).slice(0, 3), [candidates]);
    const lowIds = lowButtons.map(row => row.id);
    const [selectedId, setSelectedId] = React.useState(null);
    const [interaction, setInteraction] = React.useState({ hover: null, focus: null });
    const fallbackId = lowButtons[0]?.id ?? buttonRows[0]?.id ?? null;
    const selectedButtonId = buttonRows.some(row => row.id === selectedId) ? selectedId : fallbackId;
    const activeButtonId = loading ? null : interaction.hover?.id ?? interaction.focus?.id ?? selectedButtonId;
    const activeRow = buttonRows.find(row => row.id === activeButtonId);
    const advice = lowButtons.find(row => row.id === activeButtonId)?.advice;
    const detailId = React.useId();
    const buttonRefs = React.useRef(new Map());
    const suggestionRefs = React.useRef(new Map());
    React.useEffect(() => setInteraction({ hover: null, focus: null }), [data, loading]);
    React.useEffect(() => setSelectedId(selectedButtonId), [selectedButtonId]);
    const preview = (kind, id, source) => setInteraction(state => ({ ...state,
      [kind]: id != null ? { id, source } : state[kind]?.source === source ? null : state[kind],
    }));
    const onButtonHover = (id, source) => preview('hover', id, source);
    const onButtonFocus = (id, source) => {
      if (id != null) setInteraction({ hover: null, focus: { id, source } });
      else preview('focus', null, source);
    };
    const onButtonSelect = id => { setSelectedId(id); setInteraction({ hover: null, focus: null }); };
    const suggestionKeydown = (event, index) => {
      if (event.key === 'Escape') { event.preventDefault(); setInteraction({ hover: null, focus: null }); return; }
      const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0;
      if (!direction && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? lowButtons.length - 1
        : Math.max(0, Math.min(lowButtons.length - 1, index + direction));
      onButtonFocus(lowButtons[next]?.id ?? null, 'advice');
      suggestionRefs.current.get(lowButtons[next]?.id)?.focus({ preventScroll: true });
    };
    const suggestionItems = lowButtons.map((row, index) => h('li', { key: row.id },
      h('button', { type: 'button', className: `behavior-suggestion-target${activeButtonId === row.id ? ' is-active' : ''}${selectedButtonId === row.id ? ' is-selected' : ''}`, disabled: loading,
        ref: element => { if (element) suggestionRefs.current.set(row.id, element); else suggestionRefs.current.delete(row.id); },
        'data-button-id': row.id, 'aria-pressed': selectedButtonId === row.id, 'aria-controls': detailId,
        'aria-label': `查看${row.pageLabel || ''}的${row.label}优化建议，点击率${rateText(rate(row))}`,
        onMouseEnter: () => onButtonHover(row.id, 'advice'), onMouseLeave: () => onButtonHover(null, 'advice'),
        onFocus: () => onButtonFocus(row.id, 'advice'), onBlur: () => onButtonFocus(null, 'advice'),
        onClick: () => {
          onButtonSelect(row.id);
          const column = buttonRefs.current.get(row.id);
          const viewport = column?.closest('.behavior-chart-scroll');
          if (viewport) {
            const target = column.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
            const shift = target.left < bounds.left ? target.left - bounds.left - 44 : target.right > bounds.right ? target.right - bounds.right + 8 : 0;
            if (shift) viewport.scrollTo({ left: viewport.scrollLeft + shift, behavior: 'instant' });
          }
        }, onKeyDown: event => suggestionKeydown(event, index),
      }, h('span', { className: 'behavior-suggestion-rank', 'aria-hidden': true }, String(index + 1).padStart(2, '0')),
      h('span', { className: 'behavior-suggestion-name' }, row.label, h('small', null, row.pageLabel)),
      h('strong', { className: 'behavior-suggestion-rate' }, rateText(rate(row))))));
    const suggestions = h('aside', { className: 'behavior-suggestions', 'aria-label': '关键功能优化建议' },
      h('div', { className: 'behavior-suggestions-head' }, h('h4', null, '关键功能优化建议'),
        lowButtons.length > 0 && h('span', null, `最低 ${lowButtons.length} 项`)),
      !lowButtons.length ? h('div', { className: 'behavior-empty' }, loading ? '\u00a0' : '所选时间区间暂无可分析的按钮数据')
        : h('ol', { className: 'behavior-suggestion-list' }, suggestionItems),
      activeRow && h('div', { className: 'behavior-button-detail', id: detailId, 'data-button-id': activeRow.id },
        h('div', { className: 'behavior-detail-title' }, h('strong', null, activeRow.label), h('span', null, activeRow.pageLabel)),
        h('dl', { className: 'behavior-detail-measures' },
          [['有效曝光', number(activeRow.exposureVisits)], ['点击访问', number(activeRow.clickedVisits)], ['点击率', rateText(rate(activeRow))]].map(([label, value]) =>
            h('div', { key: label }, h('dt', null, label), h('dd', null, value)))),
        advice && h('div', { className: 'behavior-suggestion-copy' }, h('strong', null, advice.title), h('p', null, advice.body))),
      h('span', { className: 'behavior-sr-only', role: 'status', 'aria-live': 'polite' },
        !loading && selectedButtonId ? `已选择${buttonRows.find(row => row.id === selectedButtonId)?.label}` : ''));
    return h('div', { className: 'behavior-analysis' },
      renderModule('页面停留时长', h(Chart, { kind: 'duration', rows: pageRows, loading, lowIds: empty })),
      renderModule('按钮点击率与优化建议', h('section', { className: 'behavior-panel behavior-engagement' },
        h('div', { className: 'behavior-panel-head' },
          h('div', { className: 'behavior-title' }, h('h3', null, '按钮点击率'), h(Info, { label: '按钮点击率', lines: explanation(true), loading, align: 'start' })),
          h('div', { className: 'behavior-legend', 'aria-hidden': true }, h('span', null, h('i', null), '关键按钮'), h('span', null, h('i', { className: 'is-low' }), '最低点击率'))),
        h('div', { className: 'behavior-engagement-layout' },
          h(Chart, { kind: 'clicks', rows: buttonRows, loading, lowIds, activeButtonId, selectedButtonId, onButtonHover, onButtonFocus, onButtonSelect, buttonRefs }),
          suggestions))));
  };
}
