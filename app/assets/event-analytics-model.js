// One deterministic daily fixture powers every analytics view. This is preview
// data, not an event collector or a claim that production analytics is connected.
export const DATA_START = '2023-01-01';
export const GRANULARITIES = Object.freeze([
  Object.freeze({ value: 'day', label: '按日' }),
  Object.freeze({ value: 'month', label: '按月' }),
  Object.freeze({ value: 'year', label: '按年' }),
]);
export const FLOWS = Object.freeze([
  Object.freeze({ value: 'search', label: '首页搜索转化' }),
  Object.freeze({ value: 'workbench', label: '工作台使用转化' }),
  Object.freeze({ value: 'edu', label: '学练赛转化' }),
]);

const DAY = 86400000;
const pad = value => String(value).padStart(2, '0');
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const iso = time => new Date(time).toISOString().slice(0, 10);
const time = text => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text))) return NaN;
  const value = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(value) && iso(value) === text ? value : NaN;
};
const monthEnd = (year, month) => Date.UTC(year, month + 1, 0);
const labelRange = (start, end) => start === end ? start : `${start} 至 ${end}`;
const hash = text => {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
};

const DEFINITIONS = [
  { id: 'EVT_HOME_VIEW', module: '首页', path: '/', label: '访问首页' },
  { id: 'EVT_SEARCH_SUBMIT', module: '首页', path: '/search', label: '发起搜索' },
  { id: 'EVT_SEARCH_RESULT_CLICK', module: '首页', path: '/search/result', label: '点击搜索结果' },
  { id: 'EVT_REPORT_VIEW', module: '报告管理', path: '/report/detail', label: '查看报告' },
  { id: 'EVT_WORKBENCH_VIEW', module: '工作台', path: '/workbench', label: '进入工作台' },
  { id: 'EVT_TOOL_OPEN', module: '工作台', path: '/workbench/tool', label: '打开工具' },
  { id: 'EVT_TOOL_SUBMIT', module: '工作台', path: '/workbench/tool/submit', label: '提交任务' },
  { id: 'EVT_TOOL_COMPLETE', module: '工作台', path: '/workbench/tool/result', label: '查看任务结果' },
  { id: 'EVT_EDU_VIEW', module: '学练赛', path: '/edu', label: '进入学练赛' },
  { id: 'EVT_COURSE_VIEW', module: '学练赛', path: '/edu/course', label: '查看课程' },
  { id: 'EVT_PRACTICE_SUBMIT', module: '学练赛', path: '/edu/practice/submit', label: '提交练习' },
  { id: 'EVT_CONTEST_JOIN', module: '学练赛', path: '/edu/contest/join', label: '参与竞赛' },
  { id: 'EVT_USER_REGISTER', module: '用户管理', path: '/user/register', label: '用户注册' },
  { id: 'EVT_ROLE_CONFIG', module: '权限配置', path: '/permission/role', label: '权限配置' },
  { id: 'EVT_FORM_PRINT', module: '审核管理', path: '/audit/form/print', label: '表单打印' },
  { id: 'EVT_LOGIN', module: '用户管理', path: '/login', label: '用户登录' },
];
const FLOW_INDICES = { search: [0, 1, 2, 3], workbench: [4, 5, 6, 7], edu: [8, 9, 10, 11] };
const DAILY_CACHE = new Map();

function resolveRange(query) {
  const { granularity, start, end } = query;
  if (granularity === 'day') return { start: time(start), end: time(end) };
  if (granularity === 'month') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(start)) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(end))) return {};
    const [year, month] = end.split('-').map(Number);
    return { start: time(`${start}-01`), end: monthEnd(year, month - 1) };
  }
  if (granularity === 'year') {
    if (!/^\d{4}$/.test(String(start)) || !/^\d{4}$/.test(String(end))) return {};
    return { start: time(`${start}-01-01`), end: time(`${end}-12-31`) };
  }
  return {};
}

export function defaultRange(granularity = 'day', asOf = localToday()) {
  const cutoff = time(asOf);
  if (!Number.isFinite(cutoff)) throw new RangeError('统计截止日期无效');
  const year = new Date(cutoff).getUTCFullYear();
  if (granularity === 'month') return { granularity, start: `${year}-01`, end: asOf.slice(0, 7) };
  if (granularity === 'year') return { granularity, start: String(year - 2), end: String(year) };
  if (granularity !== 'day') throw new RangeError('请选择有效的统计粒度');
  return { granularity, start: iso(cutoff - 6 * DAY), end: asOf };
}

export function validateRange(query, asOf = localToday()) {
  if (!GRANULARITIES.some(item => item.value === query?.granularity)) return '请选择有效的统计粒度';
  if (!query.start || !query.end) return '请选择完整的时间区间';
  if (!Number.isFinite(time(asOf))) return '统计截止日期无效';
  const resolved = resolveRange(query);
  if (!Number.isFinite(resolved.start) || !Number.isFinite(resolved.end)) return '请输入有效的时间区间';
  if (resolved.start > resolved.end) return '开始时间不能晚于结束时间';
  const cutoffYear = Number(asOf.slice(0, 4));
  if (Number(String(query.start).slice(0, 4)) < 2020 || Number(String(query.end).slice(0, 4)) > cutoffYear + 1) return `时间区间请选择 2020 年至 ${cutoffYear + 1} 年`;
  if (resolved.end - resolved.start >= 366 * 12 * DAY) return '单次统计区间不能超过 12 年';
  return '';
}

function dailyRecord(stamp) {
  if (DAILY_CACHE.has(stamp)) return DAILY_CACHE.get(stamp);
  const date = iso(stamp), noise = hash(date), dayIndex = Math.floor((stamp - time(DATA_START)) / DAY);
  const week = new Date(stamp).getUTCDay();
  const weekdayFactor = week === 0 || week === 6 ? 0.74 : 1;
  // A bounded long-term factor allows genuine period comparisons without
  // changing past records when asOf or the selected aggregation changes.
  const growth = 1 + Math.min(Math.max(0, dayIndex), 3650) / 10000;
  const counts = Array(DEFINITIONS.length).fill(0);
  for (const [flowIndex, indices] of Object.values(FLOW_INDICES).entries()) {
    const base = [520, 340, 260][flowIndex] + hash(`${date}:${flowIndex}`) % 130;
    counts[indices[0]] = Math.round(base * weekdayFactor * growth);
    for (let step = 1; step < indices.length; step++) {
      const rate = [0, 0.66, 0.58, 0.53][step] + (hash(`${date}:${flowIndex}:${step}`) % 11 - 5) / 100;
      counts[indices[step]] = Math.floor(counts[indices[step - 1]] * rate);
    }
  }
  for (let index = 12; index < counts.length; index++) {
    counts[index] = Math.round((25 + hash(`${date}:${index}`) % 70) * weekdayFactor * growth);
  }
  const events = counts.reduce((sum, count) => sum + count, 0);
  const users = [];
  const activeCount = Math.min(events, Math.round((135 + noise % 100) * weekdayFactor * growth));
  const offset = (dayIndex * 31 + noise % 19) % 4093;
  // Overlapping stable user IDs make range UV a true union rather than a sum
  // of daily UV. Every generated active user can have at least one event.
  for (let index = 0; index < activeCount; index++) users.push((offset + index) % 4093);
  const record = { stamp, date, events, users, counts };
  DAILY_CACHE.set(stamp, record);
  return record;
}

function collect(start, end, cutoff) {
  const result = [], lower = Math.max(time(DATA_START), start), upper = Math.min(cutoff, end);
  for (let stamp = lower; stamp <= upper; stamp += DAY) result.push(dailyRecord(stamp));
  return result;
}

function aggregate(records) {
  const counts = Array(DEFINITIONS.length).fill(0), users = new Set();
  for (const record of records) {
    record.counts.forEach((count, index) => { counts[index] += count; });
    record.users.forEach(user => users.add(user));
  }
  return { events: counts.reduce((sum, count) => sum + count, 0), users: users.size, counts };
}

function shiftMonth(stamp, amount) {
  const source = new Date(stamp), target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + amount, 1));
  return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(source.getUTCDate(), new Date(monthEnd(target.getUTCFullYear(), target.getUTCMonth())).getUTCDate()));
}

function previousRange(query, range, cutoff) {
  const effectiveEnd = cutoff < range.start ? range.end : Math.min(cutoff, range.end);
  if (query.granularity === 'day') {
    const duration = range.end - range.start + DAY;
    return { start: range.start - duration, end: effectiveEnd - duration };
  }
  const start = new Date(range.start), end = new Date(range.end);
  const months = query.granularity === 'year'
    ? (end.getUTCFullYear() - start.getUTCFullYear() + 1) * 12
    : (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
  // In-progress periods compare the same elapsed month/year portion, rather
  // than comparing a few current days against an entire previous month/year.
  return {
    start: shiftMonth(range.start, -months),
    end: effectiveEnd === range.end ? range.start - DAY : shiftMonth(effectiveEnd, -months),
  };
}

const delta = (current, previous, available) => !available || previous === 0
  ? (available && current === 0 && previous === 0 ? 0 : null)
  : (current - previous) / previous;

export function summarizeAnalytics(query, asOf = localToday()) {
  const error = validateRange(query, asOf);
  if (error) throw new RangeError(error);
  const range = resolveRange(query), cutoff = time(asOf);
  const records = collect(range.start, range.end, cutoff), current = aggregate(records);
  const previous = previousRange(query, range, cutoff);
  const comparisonAvailable = records.length > 0 && range.start >= time(DATA_START)
    && previous.start >= time(DATA_START) && previous.end >= previous.start && previous.end <= cutoff;
  const prior = comparisonAvailable ? aggregate(collect(previous.start, previous.end, cutoff)) : { events: 0, users: 0 };
  const buckets = new Map();
  for (const record of records) {
    const key = query.granularity === 'day' ? record.date : query.granularity === 'month' ? record.date.slice(0, 7) : record.date.slice(0, 4);
    if (!buckets.has(key)) buckets.set(key, { label: key, date: query.granularity === 'day' ? key : query.granularity === 'month' ? `${key}-01` : `${key}-01-01`, events: 0, users: new Set() });
    const bucket = buckets.get(key);
    bucket.events += record.events;
    record.users.forEach(user => bucket.users.add(user));
  }
  const ranking = DEFINITIONS.map((definition, index) => ({ ...definition, count: current.counts[index], share: current.events ? current.counts[index] / current.events : 0 }))
    .filter(item => item.count > 0).sort((left, right) => right.count - left.count || left.id.localeCompare(right.id)).slice(0, 10);
  return {
    rangeLabel: labelRange(query.start, query.end),
    effectiveRangeLabel: records.length ? labelRange(records[0].date, records.at(-1).date) : '',
    partialCoverage: records.length > 0 && (range.start < time(DATA_START) || range.end > cutoff),
    previousLabel: labelRange(iso(previous.start), iso(previous.end)),
    comparisonAvailable,
    events: current.events,
    users: current.users,
    previousEvents: prior.events,
    previousUsers: prior.users,
    eventDelta: delta(current.events, prior.events, comparisonAvailable),
    userDelta: delta(current.users, prior.users, comparisonAvailable),
    trend: [...buckets.values()].map(bucket => ({ ...bucket, users: bucket.users.size })),
    ranking,
    flows: Object.fromEntries(Object.entries(FLOW_INDICES).map(([key, indices]) => [key, indices.map(index => ({ id: DEFINITIONS[index].id, label: DEFINITIONS[index].label, count: current.counts[index] }))])),
    dataStart: DATA_START,
    dataThrough: asOf,
  };
}
