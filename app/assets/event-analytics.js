import { GRANULARITIES, FLOWS, defaultRange, validateRange, summarizeAnalytics } from './event-analytics-model.js';

// Inject the captured application's runtime and established controls.
export function createEventAnalytics({ React, Button, Select, DatePicker }) {
  const h = React.createElement;
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  const percentage = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
  const today = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  function RangeField({ label, value, granularity, onChange, asOf }) {
    const id = React.useId();
    const years = Array.from({ length: Number(asOf.slice(0, 4)) - 2020 + 2 }, (_, index) => String(2020 + index));
    if (value && !years.includes(value.slice(0, 4))) years.push(value.slice(0, 4));
    return h('div', { className: `analytics-range-field analytics-range-${granularity}` },
      h('span', { className: 'analytics-sr-only', id }, label),
      granularity === 'day' ? h(DatePicker, { value, onChange, ariaLabel: label })
        : granularity === 'year' ? h(Select, {
          ariaLabel: label, value, onChange, options: years.map(year => ({ value: year, label: `${year}年` })),
        }) : h('div', { className: 'analytics-month-fields', role: 'group', 'aria-labelledby': id },
          h(Select, {
            ariaLabel: `${label}的年份`, value: value.slice(0, 4),
            onChange: year => onChange(`${year}-${value.slice(5) || '01'}`),
            options: years.map(year => ({ value: year, label: `${year}年` })),
          }), h(Select, {
            ariaLabel: `${label}的月份`, value: value.slice(5),
            onChange: month => onChange(`${value.slice(0, 4) || asOf.slice(0, 4)}-${month}`),
            options: Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: `${index + 1}月` })),
          })),
    );
  }

  function Metric({ label, value, previous, delta, comparable, description, image }) {
    const deltaLabel = !comparable ? '暂无可比数据'
      : previous === 0 && value > 0 ? '新增'
        : delta == null ? '—' : `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;
    return h('article', { className: 'analytics-metric' },
      h('img', { src: `./assets/${image}`, alt: '', 'aria-hidden': true }),
      h('div', { className: 'analytics-metric-main' },
        h('h3', null, label), h('strong', { className: 'analytics-metric-value' }, number(value)),
        h('div', { className: 'analytics-metric-comparison' },
          h('span', { className: `analytics-delta ${comparable && delta > 0 ? 'up' : comparable && delta < 0 ? 'down' : ''}` }, deltaLabel),
          comparable && h('span', null, `较上一周期 ${number(previous)}`)),
        h('p', null, description)),
    );
  }

  function Trend({ data, rangeLabel }) {
    const [active, setActive] = React.useState(null);
    const [visible, setVisible] = React.useState({ events: true, users: true });
    const chartRef = React.useRef(null);
    const [size, setSize] = React.useState({ width: 900, height: 260 });
    React.useEffect(() => setActive(null), [data]);
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
          h('thead', null, h('tr', null, ['排名', '事件ID', '所属模块', '埋点路径', '触发次数', '占比'].map(label => h('th', { key: label, scope: 'col' }, label)))),
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

  function Funnel({ steps, flow, onFlowChange }) {
    const first = steps[0]?.count || 0;
    const overall = first ? steps.at(-1).count / first : null;
    return h('section', { className: 'analytics-panel analytics-funnel' },
      h('div', { className: 'analytics-panel-head' },
        h('div', null, h('h3', null, '事件转化率'), h('span', { className: 'analytics-panel-sub' }, '步骤转化率 = 本步骤触发次数 ÷ 上一步骤触发次数')),
        h('div', { className: 'analytics-funnel-tools' },
          h('span', null, '业务流程'), h(Select, { ariaLabel: '业务流程', value: flow, options: FLOWS, onChange: onFlowChange }),
          h('span', { className: 'analytics-overall' }, '整体转化率 ', h('b', null, percentage(overall))))),
      !first ? h('div', { className: 'analytics-empty' }, '所选时间区间暂无转化数据')
        : h('div', { className: 'analytics-funnel-steps' }, steps.map((step, index) => {
          const previous = steps[index - 1]?.count;
          const conversion = index ? previous ? step.count / previous : null : null;
          return h('article', { key: step.id, className: 'analytics-funnel-step', tabIndex: 0,
            'aria-label': `${step.label}，触发${number(step.count)}次${index ? `，步骤转化率${percentage(conversion)}` : ''}`,
          }, h('div', { className: 'analytics-step-head' }, h('span', null, String(index + 1).padStart(2, '0')), h('h4', null, step.label)),
            h('strong', null, number(step.count), h('small', null, ' 次')),
            h('div', { className: 'analytics-funnel-bar', 'aria-hidden': true }, h('i', { style: { width: `${step.count / first * 100}%` } })),
            h('div', { className: 'analytics-step-rate' }, index ? h(React.Fragment, null, '步骤转化率', h('b', null, percentage(conversion))) : '起始步骤'),
            index > 0 && h('div', { className: 'analytics-step-loss' }, `较上一步减少 ${number(previous - step.count)} 次`));
        })),
    );
  }

  return function EventAnalytics() {
    const [asOf] = React.useState(today);
    const [draft, setDraft] = React.useState(() => defaultRange('day', asOf));
    const [applied, setApplied] = React.useState(() => defaultRange('day', asOf));
    const [error, setError] = React.useState('');
    const [flow, setFlow] = React.useState('search');
    const [announcement, setAnnouncement] = React.useState('');
    const result = React.useMemo(() => summarizeAnalytics(applied, asOf), [applied, asOf]);
    const pending = JSON.stringify(draft) !== JSON.stringify(applied);
    const query = event => {
      event.preventDefault();
      const problem = validateRange(draft, asOf);
      setError(problem);
      if (problem) return;
      setApplied({ ...draft });
      setAnnouncement(`已查询 ${draft.start} 至 ${draft.end}`);
    };
    const change = patch => { setDraft(state => ({ ...state, ...patch })); setError(''); };
    const reset = () => {
      const next = defaultRange('day', asOf);
      setDraft(next); setApplied(next); setError(''); setFlow('search'); setAnnouncement('已重置为最近7日');
    };
    return h('div', { className: 'analytics-page' },
      h('header', { className: 'analytics-page-head' }, h('h2', null, '埋点数据统计'),
        h('span', { className: 'analytics-asof' }, `数据截至 ${asOf}`)),
      h('form', { className: 'analytics-filter gkx-search-bar', onSubmit: query },
        h('div', { className: 'analytics-filter-field' },
          h('label', { id: 'analytics-granularity-label' }, '统计粒度'),
          h('div', { className: 'analytics-segmented', role: 'group', 'aria-labelledby': 'analytics-granularity-label' }, GRANULARITIES.map(option => h('button', {
            key: option.value, type: 'button', 'aria-pressed': draft.granularity === option.value,
            className: draft.granularity === option.value ? 'active' : '',
            onClick: () => { setDraft(defaultRange(option.value, asOf)); setError(''); },
          }, option.label)))),
        h('div', { className: 'analytics-filter-field analytics-time-field' },
          h('span', { id: 'analytics-time-label' }, '时间区间'),
          h('div', { className: 'analytics-range', role: 'group', 'aria-labelledby': 'analytics-time-label' },
            h(RangeField, { label: '开始时间', granularity: draft.granularity, value: draft.start, asOf, onChange: start => change({ start }) }),
            h('span', { className: 'analytics-range-dash', 'aria-hidden': true }, '—'),
            h(RangeField, { label: '结束时间', granularity: draft.granularity, value: draft.end, asOf, onChange: end => change({ end }) }))),
        h('div', { className: 'analytics-filter-actions' },
          h(Button, { type: 'submit', variant: 'primary', searchAction: 'query' }, '查询'),
          h(Button, { onClick: reset, searchAction: 'reset' }, '重置')),
        error && h('div', { className: 'analytics-error', role: 'alert' }, error)),
      h('div', { className: 'analytics-applied' },
        h('span', null, `统计区间（${GRANULARITIES.find(item => item.value === applied.granularity).label}）：${result.rangeLabel}`),
        result.partialCoverage && h('span', null, `有效数据：${result.effectiveRangeLabel}`),
        pending && h('span', { className: 'analytics-pending' }, '筛选已修改，查询后生效')),
      h('span', { className: 'analytics-sr-only', role: 'status' }, announcement),
      h('section', { className: 'analytics-metrics', 'aria-label': '统计概览' },
        h(Metric, { label: '事件总量', value: result.events, previous: result.previousEvents, delta: result.eventDelta,
          comparable: result.comparisonAvailable, description: '统计周期内全部埋点事件的触发总次数', image: 'dashboard-event-total-3d.png' }),
        h(Metric, { label: '活跃用户数', value: result.users, previous: result.previousUsers, delta: result.userDelta,
          comparable: result.comparisonAvailable, description: '统计周期内触发过任一埋点事件的去重用户数', image: 'dashboard-active-users-3d.png' })),
      h('div', { className: 'analytics-previous' }, `上一周期：${result.previousLabel}`),
      h('div', { className: 'analytics-data-grid' }, h(Trend, { data: result.trend, rangeLabel: result.rangeLabel }), h(Ranking, { rows: result.ranking })),
      h(Funnel, { steps: result.flows[flow] || [], flow, onFlowChange: setFlow }),
    );
  };
}
