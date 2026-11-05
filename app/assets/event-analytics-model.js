// V1.5 deterministic preview fixtures share aggregation with injected records.
export const DATA_START = '2020-01-01';
export const GRANULARITIES = Object.freeze(['day', 'month', 'year'].map((value, index) => Object.freeze({ value, label: ['按日', '按月', '按年'][index] })));

export function createFlowDefinition({ value, label, steps }) {
  if (!value || !label || !Array.isArray(steps) || steps.length < 2) throw new TypeError('业务流程需要标识、名称和至少两个步骤');
  const ids = new Set();
  const normalized = steps.map(step => {
    if (!step.id || !step.label || ids.has(step.id) || !Array.isArray(step.eventIds) || !step.eventIds.length) throw new TypeError('业务流程步骤需要唯一标识、名称和事件');
    ids.add(step.id);
    const eventIds = [...new Set(step.eventIds.map(String).filter(Boolean))];
    if (!eventIds.length) throw new TypeError('业务流程步骤需要事件');
    return Object.freeze({ id: String(step.id), label: String(step.label), eventIds: Object.freeze(eventIds) });
  });
  return Object.freeze({ value: String(value), label: String(label), steps: Object.freeze(normalized) });
}
export const FLOWS = Object.freeze([
  createFlowDefinition({ value: 'search', label: '首页搜索转化', steps: [
    { id: 'fulltext', label: '首页/全文检索', eventIds: ['MD-8'] },
    { id: 'ai-search', label: '首页/AI搜索', eventIds: ['MD-10'] },
    { id: 'recommendations', label: '首页/智能推荐-查看更多', eventIds: ['MD-12'] },
    { id: 'strategy-directory', label: '目录/AI战略咨询/超大规模智算引擎', eventIds: ['MD-5'] },
  ] }),
  createFlowDefinition({ value: 'workbench', label: '工作台使用转化', steps: [
    { id: 'research', label: '工作台/智能科研', eventIds: ['MD-18'] },
    { id: 'paper-generation', label: '目录/AI科研/论文辅助生成', eventIds: ['MD-2'] },
    { id: 'reading', label: '工作台/智能阅读', eventIds: ['MD-19'] },
  ] }),
  createFlowDefinition({ value: 'edu', label: '学练赛转化', steps: [
    { id: 'learn', label: '首页/学', eventIds: ['MD-13'] },
    { id: 'practice', label: '首页/练', eventIds: ['MD-15'] },
    { id: 'compete', label: '首页/赛', eventIds: ['MD-16'] },
  ] }),
]);
export const EVENT_DEFINITIONS = Object.freeze([
  ['MD-1', '目录', '目录/AI科研/智算资源调度'], ['MD-2', '目录', '目录/AI科研/论文辅助生成'],
  ['MD-3', '目录', '目录/AI教育/智能备课'], ['MD-4', '目录', '目录/AI战略咨询/系统对接'],
  ['MD-5', '目录', '目录/AI战略咨询/超大规模智算引擎'], ['MD-6', '首页', '首页/智能关联检索'],
  ['MD-7', '首页', '首页/关键词搜索'], ['MD-8', '首页', '首页/全文检索'],
  ['MD-9', '首页', '首页/练仿真'], ['MD-10', '首页', '首页/AI搜索'],
  ['MD-11', '首页', '首页/搜论文'], ['MD-12', '首页', '首页/智能推荐-查看更多'],
  ['MD-13', '首页', '首页/学'], ['MD-14', '首页', '首页/玩'],
  ['MD-15', '首页', '首页/练'], ['MD-16', '首页', '首页/赛'],
  ['MD-17', '首页', '首页/人才图谱'], ['MD-18', '工作台', '工作台/智能科研'],
  ['MD-19', '工作台', '工作台/智能阅读'],
].map(([id, module, path]) => Object.freeze({ id, module, path })));

const DAY = 86400000;
const pad = value => String(value).padStart(2, '0');
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const iso = stamp => new Date(stamp).toISOString().slice(0, 10);
const time = text => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text))) return NaN;
  const stamp = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(stamp) && iso(stamp) === text ? stamp : NaN;
};
const labelRange = (start, end) => start === end ? start : `${start} 至 ${end}`;
const hash = text => {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
};
function resolveRange({ granularity, start, end }) {
  if (granularity === 'day') return { start: time(start), end: time(end) };
  if (granularity === 'month') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(start)) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(end))) return {};
    const [year, month] = end.split('-').map(Number);
    return { start: time(`${start}-01`), end: Date.UTC(year, month, 0) };
  }
  if (granularity === 'year') {
    if (!/^\d{4}$/.test(String(start)) || !/^\d{4}$/.test(String(end))) return {};
    return { start: time(`${start}-01-01`), end: time(`${end}-12-31`) };
  }
  return {};
}
export { resolveRange as resolveAnalyticsRange };
export function defaultRange(granularity = 'day', asOf = localToday()) {
  const cutoff = time(asOf);
  if (!Number.isFinite(cutoff)) throw new RangeError('统计截止日期无效');
  const year = new Date(cutoff).getUTCFullYear();
  if (granularity === 'month') return { granularity, start: `${year}-01`, end: asOf.slice(0, 7) };
  if (granularity === 'year') return { granularity, start: String(year - 2), end: String(year) };
  if (granularity !== 'day') throw new RangeError('请选择有效的统计粒度');
  return { granularity, start: iso(cutoff - 29 * DAY), end: asOf };
}
export function validateRange(query, asOf = localToday()) {
  if (!GRANULARITIES.some(item => item.value === query?.granularity)) return '请选择有效的统计粒度';
  if (!query.start || !query.end) return '请选择完整的时间区间';
  if (!Number.isFinite(time(asOf))) return '统计截止日期无效';
  const range = resolveRange(query);
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) return '请输入有效的时间区间';
  if (range.start > range.end) return '开始时间不能晚于结束时间';
  const cutoffYear = Number(asOf.slice(0, 4));
  if (Number(String(query.start).slice(0, 4)) < 2020 || Number(String(query.end).slice(0, 4)) > cutoffYear + 1) return `时间区间请选择 2020 年至 ${cutoffYear + 1} 年`;
  if (range.end - range.start >= 366 * 12 * DAY) return '单次统计区间不能超过 12 年';
  return '';
}
function normalizeRecords(records, cutoff) {
  return records.map(record => {
    const stamp = time(record.date);
    if (!Number.isFinite(stamp)) throw new RangeError('统计记录的日期无效');
    const counts = {};
    for (const [id, count] of Object.entries(record.counts || {})) {
      if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('事件触发次数必须为非负整数');
      counts[id] = count;
    }
    const events = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const anonymousEvents = record.anonymousEvents ?? 0;
    if (!Number.isSafeInteger(anonymousEvents) || anonymousEvents < 0 || anonymousEvents > events) throw new RangeError('匿名事件次数必须包含在事件总量中');
    const users = new Set((record.loggedInUserIds || []).filter(id => id !== null && id !== undefined && String(id).trim()).map(String));
    if (users.size > events - anonymousEvents) throw new RangeError('登录活跃用户数不能超过登录事件次数');
    return { stamp, date: record.date, counts, events, anonymousEvents, users };
  }).filter(record => record.stamp <= cutoff);
}
function aggregate(records) {
  const counts = new Map(), users = new Set();
  let anonymousEvents = 0;
  for (const record of records) {
    for (const [id, count] of Object.entries(record.counts)) counts.set(id, (counts.get(id) || 0) + count);
    record.users.forEach(user => users.add(user));
    anonymousEvents += record.anonymousEvents;
  }
  const events = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return { counts, users: users.size, events, anonymousEvents, loggedInEvents: events - anonymousEvents };
}
// Only the selected current window is aggregated. Known missing dates within
// source availability count as zero; unavailable dates remain outside coverage.
export function aggregateAnalyticsRecords(query, { records = [], asOf = localToday(), sourceStart, flowDefinitions = FLOWS } = {}) {
  const error = validateRange(query, asOf);
  if (error) throw new RangeError(error);
  const range = resolveRange(query), cutoff = time(asOf), normalized = normalizeRecords(records, cutoff);
  const availability = sourceStart === undefined
    ? (normalized.length ? Math.min(...normalized.map(record => record.stamp)) : cutoff + DAY) : time(sourceStart);
  if (!Number.isFinite(availability)) throw new RangeError('统计数据起始日期无效');
  const effectiveStart = Math.max(range.start, availability), effectiveEnd = Math.min(range.end, cutoff);
  const hasWindow = effectiveStart <= effectiveEnd;
  const currentRecords = hasWindow ? normalized.filter(record => record.stamp >= effectiveStart && record.stamp <= effectiveEnd) : [];
  const current = aggregate(currentRecords);
  const buckets = new Map();
  if (current.events > 0) {
    for (let stamp = effectiveStart; stamp <= effectiveEnd; stamp += DAY) {
      const date = iso(stamp), key = query.granularity === 'day' ? date : query.granularity === 'month' ? date.slice(0, 7) : date.slice(0, 4);
      if (!buckets.has(key)) buckets.set(key, { label: key, date: query.granularity === 'day' ? key : query.granularity === 'month' ? `${key}-01` : `${key}-01-01`, events: 0, users: new Set() });
    }
    for (const record of currentRecords) {
      const key = query.granularity === 'day' ? record.date : query.granularity === 'month' ? record.date.slice(0, 7) : record.date.slice(0, 4);
      const bucket = buckets.get(key);
      bucket.events += record.events;
      record.users.forEach(user => bucket.users.add(user));
    }
  }
  const definitions = new Map(EVENT_DEFINITIONS.map(definition => [definition.id, definition]));
  const ranking = [...current.counts].map(([id, count]) => ({ ...(definitions.get(id) || { id, module: '其他', path: id }), count, share: current.events ? count / current.events : 0 }))
    .filter(item => item.count > 0).sort((left, right) => right.count - left.count || left.id.localeCompare(right.id)).slice(0, 10);
  return {
    rangeLabel: labelRange(query.start, query.end),
    effectiveRangeLabel: hasWindow ? labelRange(iso(effectiveStart), iso(effectiveEnd)) : '',
    partialCoverage: hasWindow && (range.start < availability || range.end > cutoff),
    events: current.events, users: current.users,
    anonymousEvents: current.anonymousEvents, loggedInEvents: current.loggedInEvents,
    trend: [...buckets.values()].map(bucket => ({ ...bucket, users: bucket.users.size })), ranking,
    flows: Object.fromEntries(flowDefinitions.map(flow => [flow.value, flow.steps.map(step => ({
      id: step.id, label: step.label, eventIds: [...step.eventIds],
      count: [...new Set(step.eventIds)].reduce((sum, id) => sum + (current.counts.get(id) || 0), 0),
    }))])),
    dataStart: iso(availability), dataThrough: asOf,
  };
}
const DAILY_CACHE = new Map();
function mockDailyRecord(stamp) {
  if (DAILY_CACHE.has(stamp)) return DAILY_CACHE.get(stamp);
  const date = iso(stamp), noise = hash(date), dayIndex = Math.floor((stamp - time(DATA_START)) / DAY);
  const weekday = new Date(stamp).getUTCDay(), weekdayFactor = weekday === 0 || weekday === 6 ? .74 : 1;
  const growth = 1 + Math.min(Math.max(0, dayIndex), 3650) / 10000;
  const counts = {}, assigned = new Set();
  for (const [flowIndex, flow] of FLOWS.entries()) {
    let count = Math.round(([520, 340, 260][flowIndex] + hash(`${date}:${flowIndex}`) % 130) * weekdayFactor * growth);
    flow.steps.forEach((step, index) => {
      if (index) count = Math.floor(count * (.7 - index * .06 + (hash(`${date}:${flowIndex}:${index}`) % 11 - 5) / 100));
      step.eventIds.forEach((id, eventIndex) => {
        const part = Math.floor(count / step.eventIds.length) + (eventIndex < count % step.eventIds.length ? 1 : 0);
        counts[id] = (counts[id] || 0) + part;
        assigned.add(id);
      });
    });
  }
  for (const definition of EVENT_DEFINITIONS) if (!assigned.has(definition.id)) counts[definition.id] = Math.round((25 + hash(`${date}:${definition.id}`) % 70) * weekdayFactor * growth);
  const events = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const anonymousEvents = Math.floor(events * (.2 + noise % 16 / 100));
  const activeCount = Math.min(events - anonymousEvents, Math.round((135 + noise % 100) * weekdayFactor * growth));
  const offset = (dayIndex * 31 + noise % 19) % 4093;
  const loggedInUserIds = Array.from({ length: activeCount }, (_, index) => `user-${(offset + index) % 4093}`);
  const record = { date, counts, anonymousEvents, loggedInUserIds };
  DAILY_CACHE.set(stamp, record);
  return record;
}
export function summarizeAnalytics(query, asOf = localToday()) {
  const error = validateRange(query, asOf);
  if (error) throw new RangeError(error);
  const range = resolveRange(query), cutoff = time(asOf), effectiveStart = Math.max(range.start, time(DATA_START));
  const effectiveEnd = Math.min(range.end, cutoff), records = [];
  for (let stamp = effectiveStart; stamp <= effectiveEnd; stamp += DAY) records.push(mockDailyRecord(stamp));
  return aggregateAnalyticsRecords(query, { records, asOf, sourceStart: DATA_START });
}
