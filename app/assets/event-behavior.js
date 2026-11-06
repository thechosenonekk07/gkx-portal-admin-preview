import { createColumnScale, columnRatio } from './event-behavior-chart.js';

// Behavior charts share one successful statistics snapshot with the host page.
export function createEventBehavior({ React }) {
  const h = React.createElement;
  const empty = [];
  const number = value => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  const rateText = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
  const average = row => row.visits > 0 && Number.isFinite(row.averageVisibleMs) ? Math.max(0, row.averageVisibleMs) : null;
  const rate = row => row.exposureVisits > 0 && Number.isFinite(row.rate) ? row.rate : null;
  const byId = (left, right) => String(left.id).localeCompare(String(right.id), 'en', { numeric: true });

  function Chart({ kind, rows, loading, lowIds, activeButtonId, selectedButtonId, onButtonHover, onButtonFocus, onButtonSelect, buttonRefs }) {
    const clicks = kind === 'clicks';
    const [hovered, setHovered] = React.useState(null);
    const [focused, setFocused] = React.useState(null);
    const [tabIndex, setTabIndex] = React.useState(0);
    const keyboardMode = React.useRef(false);
    const rowRefs = React.useRef(new Map());
    const instructionsId = React.useId();
    const activeIndex = hovered ?? focused;
    const values = rows.map(row => clicks ? rate(row) : average(row) == null ? null : average(row) / 1000);
    const scale = createColumnScale(values, { kind });
    const leaveChart = () => { setHovered(null); if (clicks) onButtonHover(null, 'chart'); };
    React.useEffect(() => { setHovered(null); setFocused(null); setTabIndex(0); }, [rows, loading]);
    const keydown = (event, index) => {
      keyboardMode.current = true;
      if (event.key === 'Escape') {
        event.preventDefault(); setHovered(null); setFocused(null);
        if (clicks) { onButtonHover(null, 'chart'); onButtonFocus(null, 'chart'); }
        return;
      }
      const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1
        : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0;
      if (!direction && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, index + direction));
      setTabIndex(next); setHovered(null); setFocused(next);
      if (clicks) { onButtonHover(null, 'chart'); onButtonFocus(rows[next]?.id ?? null, 'chart'); }
      rowRefs.current.get(rows[next]?.id)?.focus({ preventScroll: true });
      rowRefs.current.get(rows[next]?.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    };
    const title = clicks ? '按钮点击率' : '页面停留时长';
    return h('section', { className: clicks ? 'behavior-plot-section behavior-clicks' : 'behavior-panel behavior-duration' },
      !clicks && h('div', { className: 'behavior-panel-head' },
        h('div', { className: 'behavior-title' }, h('h3', null, title))),
      !rows.length ? h('div', { className: 'behavior-empty' }, loading ? '\u00a0' : `所选时间区间暂无${clicks ? '按钮点击' : '页面停留'}数据`)
        : h('div', { className: 'behavior-chart', onMouseLeave: leaveChart },
        h('p', { className: 'behavior-sr-only', id: instructionsId }, `使用方向键查看相邻项目，Home、End 跳至首尾，Esc 取消临时高亮${clicks ? '，Enter 或空格选中按钮并查看建议' : ''}。`),
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
                    'aria-describedby': instructionsId,
                    onMouseEnter: () => { if (!keyboardMode.current) { setHovered(index); if (clicks) onButtonHover(row.id, 'chart'); } },
                    onMouseMove: () => { if (keyboardMode.current) { keyboardMode.current = false; setHovered(index); if (clicks) onButtonHover(row.id, 'chart'); } },
                    onPointerDown: () => { keyboardMode.current = false; },
                    onFocus: () => { setTabIndex(index); setHovered(null); setFocused(index); if (clicks) onButtonFocus(row.id, 'chart'); },
                    onBlur: () => { setFocused(null); if (clicks) onButtonFocus(null, 'chart'); },
                    onClick: () => { setTabIndex(index); if (clicks) onButtonSelect(row.id); },
                    onKeyDown: event => keydown(event, index),
                  }, h('span', { className: 'behavior-column-slot' },
                    h('strong', { className: 'behavior-column-value', style: { bottom: `calc(${(ratio || 0) * 100}% + 6px)` } }, displayed),
                    ratio > 0 ? h('i', { className: 'behavior-column-fill', 'aria-hidden': true, style: { height: `${ratio * 100}%` } })
                      : h('i', { className: `behavior-column-marker${ratio == null ? ' is-missing' : ''}`, 'aria-hidden': true })),
                  h('span', { className: 'behavior-column-label' },
                    h('span', { className: 'behavior-label-name' }, row.label))));
              })))))));
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
      activeRow && h('div', { className: `behavior-button-detail${advice ? ' has-advice' : ''}`, id: detailId, 'data-button-id': activeRow.id },
        h('div', { className: 'behavior-detail-title' }, h('strong', null, activeRow.label), h('span', null, activeRow.pageLabel)),
        advice && h('div', { className: 'behavior-suggestion-copy' }, h('strong', null, advice.title), h('p', null, advice.body))),
      h('span', { className: 'behavior-sr-only', role: 'status', 'aria-live': 'polite' },
        !loading && selectedButtonId ? `已选择${buttonRows.find(row => row.id === selectedButtonId)?.label}` : ''));
    return h('div', { className: 'behavior-analysis' },
      renderModule('页面停留时长', h(Chart, { kind: 'duration', rows: pageRows, loading, lowIds: empty })),
      renderModule('按钮点击率与优化建议', h('section', { className: 'behavior-panel behavior-engagement' },
        h('div', { className: 'behavior-panel-head' },
          h('div', { className: 'behavior-title' }, h('h3', null, '按钮点击率'))),
        h('div', { className: 'behavior-engagement-layout' },
          h(Chart, { kind: 'clicks', rows: buttonRows, loading, lowIds, activeButtonId, selectedButtonId, onButtonHover, onButtonFocus, onButtonSelect, buttonRefs }),
          suggestions))));
  };
}
