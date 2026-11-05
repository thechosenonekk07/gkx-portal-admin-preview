import { DATA_START, resolveAnalyticsRange, validateRange } from './event-analytics-model.js';

// Measurement summaries remain separate from business event counts and ranks.
export const BEHAVIOR_PAGES = Object.freeze([
  ['home', '首页', '首页'], ['research', 'AI科研', '目录/AI科研'],
  ['education', 'AI教育', '目录/AI教育'], ['strategy', 'AI战略咨询', '目录/AI战略咨询'],
  ['workbench', '工作台', '工作台'], ['fulltext', '全文检索', '首页/全文检索'],
  ['ai-search', 'AI搜索', '首页/AI搜索'], ['recommendations', '智能推荐', '首页/智能推荐-查看更多'],
].map(([id, label, path]) => Object.freeze({ id, label, path })));
export const BEHAVIOR_BUTTONS = Object.freeze([
  ['MD-8', '全文检索', 'home', '首页/全文检索'],
  ['MD-10', 'AI搜索', 'home', '首页/AI搜索'],
  ['MD-12', '智能推荐-查看更多', 'home', '首页/智能推荐-查看更多'],
  ['MD-2', '论文辅助生成', 'research', '目录/AI科研/论文辅助生成'],
  ['MD-3', '智能备课', 'education', '目录/AI教育/智能备课'],
  ['MD-5', '超大规模智算引擎', 'strategy', '目录/AI战略咨询/超大规模智算引擎'],
  ['MD-18', '智能科研', 'workbench', '工作台/智能科研'],
  ['MD-19', '智能阅读', 'workbench', '工作台/智能阅读'],
].map(([id, label, pageId, path]) => Object.freeze({ id, label, pageId, path,
  pageLabel: BEHAVIOR_PAGES.find(page => page.id === pageId).label, optimizationEligible: true })));
export const BEHAVIOR_ADVICE_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'action-copy', title: '文案行动化', body: '动词开头 + 明确收益，如“立即领取优惠”优于“了解详情”' }),
  Object.freeze({ id: 'visual-hierarchy', title: '视觉强化', body: '主操作按钮用品牌主色实心样式，次要按钮弱化为描边，拉开层级' }),
  Object.freeze({ id: 'placement', title: '位置调整', body: '将按钮移入首屏视觉热区，或随滚动悬浮常驻' }),
]);

const DAY = 86400000, SHANGHAI_OFFSET = 8 * 3600000;
const dayStamp = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? stamp : NaN;
};
const isoDay = stamp => new Date(stamp).toISOString().slice(0, 10);
const requireAsOf = asOf => {
  const stamp = dayStamp(asOf);
  if (!Number.isFinite(stamp)) throw new RangeError('请提供有效的统计截止日期');
  return stamp;
};
const integer = number => Number.isSafeInteger(number) && number >= 0;
const hash = value => {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
};
const timestamp = value => {
  if (typeof value !== 'string' || !/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(dayStamp(value.slice(0, 10)))) return NaN;
  return Date.parse(value);
};
const dailyRecord = date => ({ date, pages: {}, buttons: {} });

// Input: [{visitId,pageId,startedAt,endedAt,visibleMs,
//   buttonEvents:[{buttonId,type:'exposure'|'click',at,valid?:boolean}]}].
// Timestamps require an explicit UTC offset or Z, never the host time zone.
// 'exposure' means the existing visibility qualification has been met; a
// valid:false event is ignored. Same-millisecond click/exposure is not earlier.
// Only finished valid visits count. Repeated identical visits/events are safe.
export function projectCompletedVisitsToDaily(visits, { asOf, pageDefinitions = BEHAVIOR_PAGES, buttonDefinitions = BEHAVIOR_BUTTONS } = {}) {
  const cutoff = requireAsOf(asOf) + DAY - SHANGHAI_OFFSET;
  const pages = new Map(pageDefinitions.map(page => [page.id, page]));
  const buttons = new Map(buttonDefinitions.map(button => [button.id, button]));
  const unique = new Map();
  for (const visit of visits) {
    const id = visit.visitId ?? visit.id, start = timestamp(visit.startedAt), end = timestamp(visit.endedAt);
    if (!id || !pages.has(visit.pageId) || !Number.isFinite(start) || !Number.isFinite(end)
      || end < start || end >= cutoff || !integer(visit.visibleMs) || visit.visibleMs > end - start) continue;
    const prior = unique.get(String(id));
    if (prior) {
      // Retry fragments may contain extra button events, but a conflicting
      // visit identity must never move its page/date or double its duration.
      if (prior.pageId === visit.pageId && prior.start === start && prior.end === end && prior.visibleMs === visit.visibleMs)
        prior.events.push(...(visit.buttonEvents || []));
      continue;
    }
    unique.set(String(id), { pageId: visit.pageId, start, end, visibleMs: visit.visibleMs, events: [...(visit.buttonEvents || [])] });
  }
  const days = new Map();
  for (const visit of unique.values()) {
    const date = isoDay(visit.start + SHANGHAI_OFFSET);
    if (!days.has(date)) days.set(date, dailyRecord(date));
    const day = days.get(date), page = day.pages[visit.pageId] ||= { visits: 0, totalVisibleMs: 0 };
    page.visits++; page.totalVisibleMs += visit.visibleMs;
    const exposures = new Map(), clicks = new Map();
    for (const event of visit.events) {
      const button = buttons.get(event.buttonId), at = timestamp(event.at);
      if (!button || button.pageId !== visit.pageId || event.valid === false || !Number.isFinite(at) || at < visit.start || at > visit.end) continue;
      if (event.type === 'exposure') exposures.set(button.id, Math.min(at, exposures.get(button.id) ?? Infinity));
      if (event.type === 'click') {
        if (!clicks.has(button.id)) clicks.set(button.id, []);
        clicks.get(button.id).push(at);
      }
    }
    for (const [id, exposedAt] of exposures) {
      const button = day.buttons[id] ||= { exposureVisits: 0, clickedVisits: 0 };
      button.exposureVisits++;
      if (clicks.get(id)?.some(at => at >= exposedAt)) button.clickedVisits++;
    }
  }
  return [...days.values()].sort((left, right) => left.date.localeCompare(right.date));
}

// Daily record schema: {date,pages:{[pageId]:{visits,totalVisibleMs}},
// buttons:{[buttonId]:{exposureVisits,clickedVisits}}}. These are already
// visit-deduplicated summaries. Ratios/averages are always derived AFTER sums.
export function aggregateBehaviorRecords(query, { records = [], asOf, sourceStart = DATA_START,
  pageDefinitions = BEHAVIOR_PAGES, buttonDefinitions = BEHAVIOR_BUTTONS } = {}) {
  const cutoff = requireAsOf(asOf), error = validateRange(query, asOf);
  if (error) throw new RangeError(error);
  const range = resolveAnalyticsRange(query), availability = dayStamp(sourceStart);
  if (!Number.isFinite(availability)) throw new RangeError('统计数据起始日期无效');
  const start = Math.max(range.start, availability), end = Math.min(range.end, cutoff);
  const pageDefinitionsById = new Map(pageDefinitions.map(page => [page.id, page]));
  const buttonDefinitionsById = new Map(buttonDefinitions.map(button => [button.id, button]));
  const pageTotals = new Map(), buttonTotals = new Map();
  for (const record of records) {
    const stamp = dayStamp(record.date);
    if (!Number.isFinite(stamp) || stamp < start || stamp > end) continue;
    for (const [id, source] of Object.entries(record.pages || {})) {
      if (!pageDefinitionsById.has(id) || !integer(source?.visits) || !integer(source.totalVisibleMs)
        || (source.visits === 0 && source.totalVisibleMs !== 0)) continue;
      if (!pageTotals.has(id)) pageTotals.set(id, { visits: 0, totalVisibleMs: 0 });
      const total = pageTotals.get(id); total.visits += source.visits; total.totalVisibleMs += source.totalVisibleMs;
    }
    for (const [id, source] of Object.entries(record.buttons || {})) {
      if (!buttonDefinitionsById.has(id) || !integer(source?.exposureVisits) || !integer(source.clickedVisits)
        || source.clickedVisits > source.exposureVisits) continue;
      if (!buttonTotals.has(id)) buttonTotals.set(id, { exposureVisits: 0, clickedVisits: 0 });
      const total = buttonTotals.get(id); total.exposureVisits += source.exposureVisits; total.clickedVisits += source.clickedVisits;
    }
  }
  const pages = pageDefinitions.filter(page => pageTotals.has(page.id)).map(page => {
    const total = pageTotals.get(page.id);
    return { ...page, ...total, averageVisibleMs: total.visits ? total.totalVisibleMs / total.visits : null };
  });
  const buttons = buttonDefinitions.filter(button => buttonTotals.has(button.id)).map(button => {
    const total = buttonTotals.get(button.id);
    return { ...button, optimizationEligible: button.optimizationEligible !== false, ...total,
      rate: total.exposureVisits ? total.clickedVisits / total.exposureVisits : null };
  });
  const lowButtons = buttons.filter(button => button.optimizationEligible && button.exposureVisits > 0
      && button.rate !== null && Number.isFinite(button.rate) && button.rate >= 0 && button.rate <= 1)
    .sort((left, right) => left.rate - right.rate || right.exposureVisits - left.exposureVisits
      || left.id.localeCompare(right.id, 'en', { numeric: true })).slice(0, 3)
    .map(button => ({ ...button, advice: { ...BEHAVIOR_ADVICE_TEMPLATES[hash(button.id) % BEHAVIOR_ADVICE_TEMPLATES.length] } }));
  return { pages, buttons, lowButtons };
}

// Daily fixtures model completed visits directly, so multi-year preview never
// expands into millions of visit rows or changes existing business PV/ranking.
const BASE_VISIBLE_MS = Object.freeze({ home: 45000, research: 180000, education: 80000, strategy: 220000,
  workbench: 140000, fulltext: 60000, 'ai-search': 95000, recommendations: 125000 });
function createDailyFixture(stamp) {
  const date = isoDay(stamp), day = dailyRecord(date), weekend = [0, 6].includes(new Date(stamp).getUTCDay());
  for (const page of BEHAVIOR_PAGES) {
    const seed = hash(`${date}:${page.id}`), visits = Math.round((80 + seed % 220) * (weekend ? .75 : 1));
    const averageMs = Math.round(BASE_VISIBLE_MS[page.id] * (.85 + hash(`${page.id}:${date}:duration`) % 3001 / 10000));
    day.pages[page.id] = { visits, totalVisibleMs: visits * averageMs };
  }
  BEHAVIOR_BUTTONS.forEach((button, index) => {
    const seed = hash(`${date}:${button.id}`), visits = day.pages[button.pageId].visits;
    const exposureVisits = Math.floor(visits * (.3 + seed % 7 / 10));
    const rate = .025 + index * .035 + hash(`${button.id}:${date}:click`) % 30 / 1000;
    const clickedVisits = seed % 13 === 0 ? 0 : Math.floor(exposureVisits * rate);
    day.buttons[button.id] = { exposureVisits, clickedVisits };
  });
  return day;
}
export function summarizeBehavior(query, asOf) {
  const cutoff = requireAsOf(asOf), error = validateRange(query, asOf);
  if (error) throw new RangeError(error);
  const range = resolveAnalyticsRange(query), start = Math.max(range.start, dayStamp(DATA_START)), end = Math.min(range.end, cutoff);
  const records = [];
  for (let stamp = start; stamp <= end; stamp += DAY) records.push(createDailyFixture(stamp));
  return aggregateBehaviorRecords(query, { records, asOf });
}
