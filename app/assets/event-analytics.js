import { GRANULARITIES, FLOWS, defaultRange, validateRange, summarizeAnalytics } from './event-analytics-model.js';
import { createAnalyticsQueryController, createPreviewAnalyticsLoader } from './event-analytics-query.js';
import { buildFunnelGeometry } from './event-analytics-funnel.js';

// Inject the captured application's runtime and established controls.
export function createEventAnalytics({ React, Button, Select, DatePicker }) {
  const h = React.createElement;
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  const percentage = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
  const today = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  function RangeField({ label, value, granularity, onChange, asOf, disabled }) {
    const id = React.useId();
    const years = Array.from({ length: Number(asOf.slice(0, 4)) - 2020 + 2 }, (_, index) => String(2020 + index));
    if (value && !years.includes(value.slice(0, 4))) years.push(value.slice(0, 4));
    return h('div', { className: `analytics-range-field analytics-range-${granularity}` },
      h('span', { className: 'analytics-sr-only', id }, label),
      granularity === 'day' ? h(DatePicker, { value, onChange, ariaLabel: label, disabled })
        : granularity === 'year' ? h(Select, {
          ariaLabel: label, value, onChange, disabled, options: years.map(year => ({ value: year, label: `${year}年` })),
        }) : h('div', { className: 'analytics-month-fields', role: 'group', 'aria-labelledby': id },
          h(Select, {
            ariaLabel: `${label}的年份`, value: value.slice(0, 4), disabled,
            onChange: year => onChange(`${year}-${value.slice(5) || '01'}`),
            options: years.map(year => ({ value: year, label: `${year}年` })),
          }), h(Select, {
            ariaLabel: `${label}的月份`, value: value.slice(5), disabled,
            onChange: month => onChange(`${value.slice(0, 4) || asOf.slice(0, 4)}-${month}`),
            options: Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: `${index + 1}月` })),
          })),
    );
  }

  function ResultModule({ loading, label, children }) {
    return h('div', { className: 'analytics-result-module', role: 'region', 'aria-label': label, 'aria-busy': loading },
      h('div', { className: 'analytics-module-content', inert: loading || undefined }, children),
      loading && h('div', { className: 'analytics-module-loading', 'aria-hidden': true },
        h('span', { className: 'analytics-spinner' }), h('span', null, '加载中')));
  }

  function Metric({ label, value, description, image, empty }) {
    return h('article', { className: 'analytics-metric' },
      h('img', { src: `./assets/${image}`, alt: '', 'aria-hidden': true }),
      h('div', { className: 'analytics-metric-main' },
        h('h3', null, label), h('strong', { className: 'analytics-metric-value' }, empty ? '—' : number(value)),
        empty && h('div', { className: 'analytics-metric-empty' }, '所选时间区间暂无数据'),
        h('p', null, description)),
    );
  }

  function Trend({ data, rangeLabel, loading }) {
    const [active, setActive] = React.useState(null);
    const [visible, setVisible] = React.useState({ events: true, users: true });
    const chartRef = React.useRef(null);
    const [size, setSize] = React.useState({ width: 900, height: 260 });
    React.useEffect(() => setActive(null), [data, loading]);
    React.useLayoutEffect(() => {
      if (!chartRef.current) return;
      const observer = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        setSize(current => current.width === width && current.height === height ? current : { width, height });
      });
      observer.observe(chartRef.current);
      return () => observer.disconnect();
    }, [data.length > 0]);
    const { width, height } = size;
    const left = 48, right = 48, top = 22, bottom = 44;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const maximum = key => {
      const max = Math.max(1, ...data.map(row => row[key]));
      const unit = 10 ** Math.floor(Math.log10(max));
      return Math.ceil(max / unit) * unit;
    };
    const eventMax = maximum('events'), userMax = maximum('users');
    const x = index => left + (data.length === 1 ? .5 : index / (data.length - 1)) * plotWidth;
    const y = (row, key) => top + plotHeight * (1 - row[key] / (key === 'events' ? eventMax : userMax));
    const tick = value => value >= 10000 ? `${+(value / 10000).toFixed(1)}万` : number(value);
    const indexFromPointer = event => {
      const rect = event.currentTarget.getBoundingClientRect();
      const proportion = ((event.clientX - rect.left) / rect.width * width - left) / plotWidth;
      setActive(Math.max(0, Math.min(data.length - 1, Math.round(proportion * (data.length - 1)))));
    };
    const keydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      setActive(index => event.key === 'Escape' ? null : event.key === 'Home' ? 0 : event.key === 'End' ? data.length - 1
        : Math.max(0, Math.min(data.length - 1, (index ?? 0) + (event.key === 'ArrowLeft' ? -1 : 1))));
    };
    const row = active == null ? null : data[active];
    const sameYear = data.length > 0 && data.every(point => point.label.slice(0, 4) === data[0].label.slice(0, 4));
    const tickLabel = point => sameYear && /^\d{4}-\d{2}-\d{2}$/.test(point.label) ? point.label.slice(5) : point.label;
    const labelIndices = new Set(data.length ? [0, data.length - 1] : []);
    let lastRight = x(0) + (data[0] ? tickLabel(data[0]).length * 7.5 : 0);
    const endLeft = x(data.length - 1) - (data.length ? tickLabel(data.at(-1)).length * 7.5 : 0);
    data.forEach((point, index) => {
      const halfWidth = tickLabel(point).length * 3.75;
      if (index > 0 && index < data.length - 1 && x(index) - halfWidth > lastRight + 16 && x(index) + halfWidth < endLeft - 16) {
        labelIndices.add(index); lastRight = x(index) + halfWidth;
      }
    });
    return h('section', { className: 'analytics-panel analytics-trend' },
      h('div', { className: 'analytics-panel-head' },
        h('div', null, h('h3', null, '事件增长趋势'), h('span', { className: 'analytics-panel-sub' }, rangeLabel)),
        h('div', { className: 'analytics-legend', 'aria-label': '趋势图指标' },
          [['events', '事件总量'], ['users', '活跃用户数']].map(([key, label]) => h('button', {
            key, type: 'button', className: `analytics-legend-item ${key}${visible[key] ? '' : ' is-muted'}`,
            disabled: visible[key] && !visible[key === 'events' ? 'users' : 'events'],
            'aria-pressed': visible[key], onClick: () => setVisible(state => {
              if (state[key] && !state[key === 'events' ? 'users' : 'events']) return state;
              return { ...state, [key]: !state[key] };
            }),
          }, h('i', { 'aria-hidden': true }), label))),
      ),
      !data.length ? h('div', { className: 'analytics-empty' }, '所选时间区间暂无数据') : h(React.Fragment, null,
        h('div', { className: 'analytics-axis-titles', 'aria-hidden': true },
          h('span', null, '事件总量（次）'), h('span', null, '活跃用户数（人）')),
        h('div', {
          ref: chartRef, className: 'analytics-chart', tabIndex: 0, role: 'group',
          'aria-label': '事件增长趋势，使用左右方向键查看时间点，Home、End 跳至首尾，Esc 关闭提示',
          onKeyDown: keydown, onFocus: () => setActive(0), onBlur: () => setActive(null),
          onMouseMove: indexFromPointer, onMouseLeave: () => setActive(null), onClick: indexFromPointer,
        },
        h('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', 'aria-hidden': true },
          [0, 1, 2, 3, 4].map(index => {
            const cy = top + plotHeight * index / 4;
            return h('g', { key: `grid-${index}` },
              h('line', { x1: left, x2: width - right, y1: cy, y2: cy, className: 'analytics-chart-grid' }),
              h('text', { x: left - 10, y: cy + 4, textAnchor: 'end' }, tick(eventMax * (1 - index / 4))),
              h('text', { x: width - right + 10, y: cy + 4 }, tick(userMax * (1 - index / 4))));
          }),
          ['events', 'users'].map(key => visible[key] && h('g', { key, className: `analytics-series ${key}` },
            h('polyline', { points: data.map((point, index) => `${x(index)},${y(point, key)}`).join(' ') }),
            data.length <= 45 && data.map((point, index) => h('circle', { key: index, cx: x(index), cy: y(point, key), r: 3 })))),
          data.map((point, index) => labelIndices.has(index) && h('text', {
            key: `label-${index}`, x: x(index), y: height - 14, textAnchor: data.length === 1 ? 'middle' : index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle',
          }, tickLabel(point))),
          row && h('g', null,
            h('line', { className: 'analytics-chart-guide', x1: x(active), x2: x(active), y1: top, y2: height - bottom }),
            ['events', 'users'].map(key => visible[key] && h('circle', { key, className: `analytics-highlight ${key}`, cx: x(active), cy: y(row, key), r: 5 }))),
        ),
        row && h('div', { className: 'analytics-chart-tooltip', role: 'status', style: {
          left: Math.max(8, Math.min(width - 212, x(active) - 102)),
        } }, h('strong', null, row.label),
          visible.events && h('span', null, '事件总量', h('b', null, number(row.events))),
          visible.users && h('span', null, '活跃用户数', h('b', null, number(row.users)))),
        ),
      ),
    );
  }

  function Ranking({ rows }) {
    return h('section', { className: 'analytics-panel analytics-ranking' },
      h('div', { className: 'analytics-panel-head' }, h('h3', null, '事件排行'), h('span', { className: 'analytics-panel-sub' }, 'TOP 10 · 按触发次数')),
      h('div', { className: 'analytics-table-scroll', role: 'region', 'aria-label': '事件排行，可横向滚动', tabIndex: 0 },
        h('table', { className: 'analytics-table arco-table' },
          h('colgroup', null, [56, 200, 112, 220, 108, 138].map((width, index) => h('col', { key: index, style: { width } }))),
          h('thead', null, h('tr', null, ['排名', '事件ID', '所属功能模块', '埋点路径', '触发次数', '占比'].map(label => h('th', { key: label, scope: 'col' }, label)))),
          h('tbody', null, !rows.length ? h('tr', null, h('td', { colSpan: 6, className: 'analytics-table-empty' }, '所选时间区间暂无数据'))
            : rows.map((row, index) => h('tr', { key: row.id },
              h('td', null, h('span', { className: `analytics-rank${index < 3 ? ' top' : ''}` }, index + 1)),
              h('td', null, h('span', { className: 'table-cell-text' }, row.id)),
              h('td', null, row.module), h('td', null, h('span', { className: 'table-cell-text' }, row.path)),
              h('td', { className: 'analytics-numeric' }, number(row.count)),
              h('td', null, h('span', { className: 'analytics-share' },
                h('span', { className: 'analytics-share-track', 'aria-hidden': true }, h('i', { style: { width: `${row.share * 100}%` } })),
                percentage(row.share))))))),
      ),
    );
  }

  function Funnel({ steps, flow, onFlowChange, loading }) {
    const first = steps[0]?.count || 0;
    const overall = first ? steps.at(-1).count / first : null;
    const geometry = buildFunnelGeometry(steps);
    const [help, setHelp] = React.useState({ hover: false, focus: false, dismissed: false });
    const helpOpen = !help.dismissed && (help.hover || help.focus);
    const [hovered, setHovered] = React.useState(null);
    const [focused, setFocused] = React.useState(null);
    const active = hovered ?? focused;
    const helpId = React.useId();
    React.useEffect(() => { setHelp({ hover: false, focus: false, dismissed: false }); setHovered(null); setFocused(null); }, [flow, loading]);
    const hasData = steps.some(step => step.count > 0);
    return h('section', { className: 'analytics-panel analytics-funnel' },
      h('div', { className: 'analytics-panel-head analytics-funnel-head' },
        h('div', { className: 'analytics-funnel-title' }, h('h3', null, '事件转化率'),
          h('div', { className: 'analytics-funnel-help',
            onMouseEnter: () => setHelp(state => ({ ...state, hover: true, dismissed: false })),
            onMouseLeave: () => setHelp(state => ({ ...state, hover: false })),
            onFocus: () => setHelp(state => ({ ...state, focus: true, dismissed: false })),
            onBlur: () => setHelp(state => ({ ...state, focus: false })),
          }, h('button', { type: 'button', className: 'analytics-info-button',
            'aria-label': '查看转化率计算口径', 'aria-expanded': helpOpen, 'aria-controls': helpId,
            'aria-describedby': helpOpen ? helpId : undefined,
            onClick: () => setHelp(state => ({ ...state, dismissed: false, focus: true })),
            onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); setHelp(state => ({ ...state, dismissed: true })); } },
          }, h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
            h('circle', { cx: 8, cy: 8, r: 6, stroke: 'currentColor', strokeWidth: 1.5 }),
            h('path', { d: 'M8 7v4M8 4.5v.1', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }))),
          helpOpen && h('div', { id: helpId, role: 'tooltip', className: 'analytics-funnel-help-content' },
            h('strong', null, '计算口径'),
            h('p', null, '步骤转化率 = 本步骤触发次数 ÷ 上一步骤触发次数'),
            h('p', null, '整体转化率 = 末步骤触发次数 ÷ 首步骤触发次数'),
            h('p', null, '各层上沿宽度表示该步骤触发次数；分母为 0 时显示“—”。')))),
        h('div', { className: 'analytics-funnel-tools' },
          h('span', null, '业务流程'), h(Select, { ariaLabel: '业务流程', value: flow, options: FLOWS, onChange: onFlowChange, disabled: loading }))),
      !hasData ? h('div', { className: 'analytics-empty' }, '所选时间区间暂无转化数据')
        : h('div', { className: 'analytics-funnel-body' },
          h('div', { className: 'analytics-funnel-column-head', 'aria-hidden': true },
            h('div', { className: 'analytics-funnel-summary' },
              h('span', null, '整体转化率'), h('strong', null, percentage(overall))),
            h('div', { className: 'analytics-funnel-detail-head' },
              h('span', null, '流程步骤'), h('span', null, '触发次数'), h('span', null, '步骤转化率'))),
          h('span', { className: 'analytics-sr-only' }, `整体转化率 ${percentage(overall)}`),
          h('div', { className: 'analytics-funnel-mobile-chart', 'aria-hidden': true },
            h('svg', { viewBox: `0 0 1000 ${68 * steps.length}`, preserveAspectRatio: 'none', style: { height: 48 * steps.length } },
              geometry.map((shape, index) => h('g', { key: steps[index].id, transform: `translate(0 ${68 * index})`,
                className: active === index ? 'is-active' : undefined,
                onMouseEnter: () => setHovered(index), onMouseLeave: () => setHovered(null),
              }, shape.points ? h('polygon', { points: shape.points }) : h('line', { x1: 490, x2: 510, y1: 34, y2: 34, className: 'analytics-funnel-connector' }))))),
          h('ol', { key: flow, className: 'analytics-funnel-steps', 'aria-label': `${FLOWS.find(item => item.value === flow)?.label || ''}漏斗` }, steps.map((step, index) => {
            const previous = steps[index - 1]?.count;
            const conversion = index && previous ? step.count / previous : null;
            const shape = geometry[index];
            return h('li', { key: step.id, className: `analytics-funnel-step${active === index ? ' is-active' : ''}`, tabIndex: 0,
              onMouseEnter: () => setHovered(index), onMouseLeave: () => setHovered(null),
              onFocus: () => { setHovered(null); setFocused(index); }, onBlur: () => setFocused(null),
              'aria-label': `步骤${index + 1}，${step.label}，${step.eventIds?.join('、') || step.id}，触发${number(step.count)}次${index ? `，步骤转化率${percentage(conversion)}${previous === 0 ? '，上一步触发次数为0' : ''}` : '，起始步骤'}`,
            }, h('div', { className: 'analytics-funnel-shape', 'aria-hidden': true },
                h('svg', { viewBox: '0 0 1000 68', preserveAspectRatio: 'none' },
                  h('line', { x1: 500, x2: 500, y1: 0, y2: 68, className: 'analytics-funnel-axis' }),
                  shape.points && h('polygon', { points: shape.points }),
                  h('line', { x1: shape.connectorStart, x2: 1000, y1: 34, y2: 34, className: 'analytics-funnel-connector' }),
                  !shape.points && h('circle', { cx: 500, cy: 34, r: 3, className: 'analytics-funnel-zero' }))),
              h('div', { className: 'analytics-funnel-detail' },
                h('div', { className: 'analytics-funnel-label' },
                  h('span', { className: 'analytics-funnel-order', 'aria-hidden': true }, String(index + 1).padStart(2, '0')),
                  h('div', null, h('h4', null, step.label), h('span', null, step.eventIds?.join('、') || step.id))),
                h('div', { className: 'analytics-funnel-count' },
                  h('span', { className: 'analytics-funnel-mobile-label', 'aria-hidden': true }, '触发次数'),
                  h('strong', null, number(step.count)), h('small', null, '次')),
                h('div', { className: 'analytics-funnel-rate' },
                  h('span', { className: 'analytics-funnel-mobile-label', 'aria-hidden': true }, '步骤转化率'),
                  index ? h('strong', null, percentage(conversion)) : h('span', { className: 'analytics-funnel-start' }, '起始步骤'))));
          }))),
    );
  }

  return function EventAnalytics() {
    const [initialRange] = React.useState(() => defaultRange('day', today()));
    const [draft, setDraft] = React.useState(initialRange);
    const [request, setRequest] = React.useState({ status: 'loading', query: initialRange, display: null, error: '' });
    const [error, setError] = React.useState('');
    const [flow, setFlow] = React.useState('search');
    const controllerRef = React.useRef(null);
    const restoreFocusRef = React.useRef(null);
    const loading = request.status === 'loading';
    React.useEffect(() => {
      if (!loading) {
        const target = restoreFocusRef.current;
        restoreFocusRef.current = null;
        if (target?.isConnected && !target.disabled && document.activeElement === document.body) target.focus({ preventScroll: true });
        return;
      }
      // A deliberate move during loading cancels restoration to the submitter.
      const pointer = event => {
        if (restoreFocusRef.current && !restoreFocusRef.current.contains(event.target)) restoreFocusRef.current = null;
      };
      const keyboard = event => { if (event.key === 'Tab') restoreFocusRef.current = null; };
      document.addEventListener('pointerdown', pointer, true);
      document.addEventListener('keydown', keyboard, true);
      return () => {
        document.removeEventListener('pointerdown', pointer, true);
        document.removeEventListener('keydown', keyboard, true);
      };
    }, [loading]);
    React.useEffect(() => {
      const controller = createAnalyticsQueryController({
        load: createPreviewAnalyticsLoader({ compute: query => summarizeAnalytics(query, today()) }),
        onState: update => setRequest(previous => update.status === 'success'
          ? { status: 'success', query: update.query, display: { query: update.query, result: update.result }, error: '' }
          : { ...previous, status: update.status, query: update.query,
            error: update.status === 'error' ? '统计数据加载失败，请重新查询' : '' }),
      });
      controllerRef.current = controller;
      controller.run(initialRange);
      return () => { controller.dispose(); controllerRef.current = null; };
    }, [initialRange]);
    const result = request.display?.result || { events: 0, users: 0, trend: [], ranking: [], flows: {} };
    const applied = request.display?.query || request.query;
    const asOf = result.dataThrough || today();
    const pending = JSON.stringify(draft) !== JSON.stringify(applied);
    const empty = !!request.display && result.events === 0;
    const rangeText = query => query.start === query.end ? query.start : `${query.start} 至 ${query.end}`;
    const granularityLabel = query => GRANULARITIES.find(item => item.value === query.granularity).label;
    const submit = (next, submitter) => {
      if (!controllerRef.current || controllerRef.current.isLoading()) return;
      const problem = validateRange(next, today());
      setError(problem);
      if (!problem) {
        restoreFocusRef.current = submitter === document.activeElement ? submitter : null;
        controllerRef.current.run(next);
      }
    };
    const query = event => { event.preventDefault(); submit(draft, event.nativeEvent?.submitter); };
    const change = patch => {
      if (controllerRef.current?.isLoading()) return;
      setDraft(state => ({ ...state, ...patch })); setError('');
    };
    const reset = event => {
      if (controllerRef.current?.isLoading()) return;
      const next = defaultRange('day', today());
      setDraft(next); setError(''); setFlow('search'); submit(next, event.currentTarget);
    };
    const updatedTime = result.updatedAt ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(result.updatedAt)) : '—';
    const status = loading ? '正在查询统计数据'
      : request.error ? request.error : request.display ? `查询完成，事件总量${number(result.events)}，已登录活跃用户${number(result.users)}` : '';
    const module = (label, content) => h(ResultModule, { label, loading, key: label }, content);
    return h('div', { className: 'analytics-page' },
      h('header', { className: 'analytics-page-head' }, h('h2', null, '埋点数据统计'),
        h('span', { className: 'analytics-asof' }, `数据更新于 ${updatedTime}`)),
      h('form', { className: 'analytics-filter gkx-search-bar', onSubmit: query },
        h('div', { className: 'analytics-filter-field' },
          h('span', { id: 'analytics-granularity-label' }, '统计粒度'),
          h('div', { className: 'analytics-segmented', role: 'group', 'aria-labelledby': 'analytics-granularity-label' }, GRANULARITIES.map(option => h('button', {
            key: option.value, type: 'button', disabled: loading, 'aria-pressed': draft.granularity === option.value,
            className: draft.granularity === option.value ? 'active' : '',
            onClick: () => change(defaultRange(option.value, today())),
          }, option.label)))),
        h('div', { className: 'analytics-filter-field analytics-time-field' },
          h('span', { id: 'analytics-time-label' }, '时间区间'),
          h('div', { className: 'analytics-range', role: 'group', 'aria-labelledby': 'analytics-time-label' },
            h(RangeField, { label: '开始时间', granularity: draft.granularity, value: draft.start, asOf, disabled: loading, onChange: start => change({ start }) }),
            h('span', { className: 'analytics-range-dash', 'aria-hidden': true }, '—'),
            h(RangeField, { label: '结束时间', granularity: draft.granularity, value: draft.end, asOf, disabled: loading, onChange: end => change({ end }) }))),
        h('div', { className: 'analytics-filter-actions' },
          h(Button, { type: 'submit', variant: 'primary', searchAction: 'query', disabled: loading }, loading ? '查询中' : '查询'),
          h(Button, { onClick: reset, searchAction: 'reset', disabled: loading }, '重置')),
        (error || request.error) && h('div', { className: 'analytics-error', role: 'alert' },
          error || `${request.error}${request.display ? '，当前显示上次成功查询结果' : ''}`)),
      h('div', { className: 'analytics-applied' },
        h('span', null, loading ? `正在查询（${granularityLabel(request.query)}）：${rangeText(request.query)}`
          : `统计区间（${granularityLabel(applied)}）：${rangeText(applied)}`),
        !loading && result.partialCoverage && h('span', null, `有效数据：${result.effectiveRangeLabel}`),
        !loading && pending && h('span', { className: 'analytics-pending' }, '筛选已修改，查询后生效')),
      h('span', { className: 'analytics-sr-only', role: 'status', 'aria-live': 'polite' }, status),
      request.status === 'error' && !request.display ? h('div', { className: 'analytics-load-failure' }, '统计数据加载失败，请重新查询')
        : h(React.Fragment, null,
          h('section', { className: 'analytics-metrics', 'aria-label': '统计概览' },
            module('事件总量', h(Metric, { label: '事件总量', value: result.events,
              empty, description: '统计周期内全部埋点事件的触发总次数，包含未登录用户', image: 'dashboard-event-total-3d.png' })),
            module('活跃用户数', h(Metric, { label: '活跃用户数', value: result.users,
              empty, description: '统计周期内触发过任一埋点事件的已登录去重用户数', image: 'dashboard-active-users-3d.png' }))),
          h('div', { className: 'analytics-data-grid' },
            module('事件增长趋势', h(Trend, { data: result.trend, rangeLabel: result.rangeLabel, loading })),
            module('事件排行', h(Ranking, { rows: result.ranking }))),
          module('事件转化率', h(Funnel, { steps: result.flows[flow] || [], flow, onFlowChange: setFlow, loading }))),
    );
  };
}
