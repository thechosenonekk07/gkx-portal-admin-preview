import assert from 'node:assert/strict';
import { DATA_START, GRANULARITIES, FLOWS, EVENT_DEFINITIONS, createFlowDefinition, defaultRange, validateRange, summarizeAnalytics, aggregateAnalyticsRecords } from '../app/assets/event-analytics-model.js';
const asOf = '2026-11-03';
const query = (start, end = start, granularity = 'day') => ({ granularity, start, end });
const report = value => summarizeAnalytics(value, asOf);
const record = (date, counts, loggedInUserIds = [], anonymousEvents = 0) => ({ date, counts, loggedInUserIds, anonymousEvents });
const aggregate = (selection, records, options = {}) => aggregateAnalyticsRecords(selection, { asOf, records, sourceStart: DATA_START, ...options });
let checks = 0;
function check(name, run) { run(); checks++; console.log(`✓ ${name}`); }

check('V1.5 defaults: 30 inclusive days, January-current month, recent 3 years', () => {
  assert.deepEqual(defaultRange('day', asOf), query('2026-10-05', '2026-11-03'));
  assert.equal(report(defaultRange('day', asOf)).trend.length, 30);
  assert.deepEqual(defaultRange('month', asOf), query('2026-01', '2026-11', 'month'));
  assert.deepEqual(defaultRange('year', asOf), query('2024', '2026', 'year'));
  assert.equal(GRANULARITIES.length, 3);
  assert.equal(FLOWS.length, 3);
});
check('Validation rejects reversed/impossible/oversized periods and permits future empty periods', () => {
  for (const invalid of [null, {}, query('', ''), query('2026-11-04', '2026-11-03'), query('2026-02-30'), query('2026-13', '2026-13', 'month'), query('abc', 'abc', 'year'), query('2020', '9999', 'year')]) assert.notEqual(validateRange(invalid, asOf), '');
  assert.equal(validateRange(query('2024-02-29'), asOf), '');
  assert.equal(validateRange(query('2027-01', '2027-03', 'month'), asOf), '');
  assert.notEqual(validateRange(query('2020', '2050', 'year'), '2050-01-01'), '');
  assert.throws(() => report(query('2026-02-30')), RangeError);
});
check('Anonymous-only events count PV, ranking and flow steps but never logged-in UV', () => {
  const result = aggregate(query('2026-11-01'), [record('2026-11-01', { 'MD-8': 15, 'MD-10': 7 }, [], 22)]);
  assert.equal(result.events, 22);
  assert.equal(result.anonymousEvents, 22);
  assert.equal(result.loggedInEvents, 0);
  assert.equal(result.users, 0);
  assert.equal(result.trend[0].users, 0);
  assert.equal(result.flows.search[0].count, 15);
  assert.equal(result.ranking.reduce((sum, item) => sum + item.count, 0), result.events);
});
check('PV includes both identities while UV unions only nonempty logged-in identities', () => {
  const rows = [record('2026-11-01', { 'MD-8': 12 }, ['u1', 'u2', 'u1', null, ''], 8), record('2026-11-02', { 'MD-8': 8 }, ['u2', 'u3'], 5)];
  const result = aggregate(query('2026-11-01', '2026-11-02'), rows);
  assert.equal(result.events, 20);
  assert.equal(result.anonymousEvents, 13);
  assert.equal(result.loggedInEvents, 7);
  assert.equal(result.users, 3);
  assert.equal(result.trend.reduce((sum, item) => sum + item.users, 0), 4);
  assert.equal(result.loggedInEvents + result.anonymousEvents, result.events);
  assert.throws(() => aggregate(query('2026-11-01'), [record('2026-11-01', { 'MD-8': 1 }, [], 2)]), RangeError);
  assert.throws(() => aggregate(query('2026-11-01'), [record('2026-11-01', { 'MD-8': 1 }, ['a'], 1)]), RangeError);
});
check('Repeated queries are stable and returned values cannot mutate cached fixtures', () => {
  const selection = defaultRange('day', asOf), first = report(selection), expected = report(selection);
  assert.deepEqual(first, expected);
  first.trend[0].events = 0;
  first.flows.search[0].count = 0;
  first.flows.search[0].eventIds.push('bad');
  assert.deepEqual(report(selection), expected);
});
check('Day/month/year KPI and trend counts aggregate identical PV and logged-in UV', () => {
  const results = [report(query('2026-01-01', '2026-11-03')), report(query('2026-01', '2026-11', 'month')), report(query('2026', '2026', 'year'))];
  for (const result of results) {
    assert.equal(result.events, result.trend.reduce((sum, item) => sum + item.events, 0));
    assert.equal(result.events, result.loggedInEvents + result.anonymousEvents);
    assert.equal(result.events, results[0].events);
    assert.equal(result.users, results[0].users);
  }
});
check('Missing dates/months/years are zero-filled inside the source window', () => {
  const daily = aggregate(query('2026-10-30', '2026-11-02'), [record('2026-10-30', { 'MD-8': 2 }, ['a']), record('2026-11-02', { 'MD-8': 4 }, ['b'])]);
  assert.deepEqual(daily.trend.map(item => item.events), [2, 0, 0, 4]);
  const monthly = aggregate(query('2026-01', '2026-03', 'month'), [record('2026-01-01', { 'MD-8': 2 }, ['a']), record('2026-03-01', { 'MD-8': 4 }, ['b'])]);
  assert.deepEqual(monthly.trend.map(item => item.events), [2, 0, 4]);
  const yearly = aggregate(query('2024', '2026', 'year'), [record('2024-01-01', { 'MD-8': 2 }, ['a']), record('2026-01-01', { 'MD-8': 4 }, ['b'])]);
  assert.deepEqual(yearly.trend.map(item => item.events), [2, 0, 4]);
});
check('TOP 10 sorting and V1.5 metadata use all events as the percentage denominator', () => {
  const result = report(defaultRange('day', asOf));
  assert.equal(result.ranking.length, 10);
  assert.ok(result.ranking.every((item, index, rows) => index === 0 || rows[index - 1].count >= item.count));
  assert.ok(result.ranking.reduce((sum, item) => sum + item.count, 0) < result.events);
  for (const item of result.ranking) assert.equal(item.share, item.count / result.events);
  assert.equal(EVENT_DEFINITIONS.find(item => item.id === 'MD-8').path, '首页/全文检索');
  assert.equal(EVENT_DEFINITIONS.find(item => item.id === 'MD-8').module, '首页');
});
check('Three configured flows have exact V1.5 order and lengths 4/3/3', () => {
  const result = report(defaultRange('day', asOf));
  assert.deepEqual(Object.values(result.flows).map(steps => steps.length), [4, 3, 3]);
  assert.deepEqual(result.flows.search.map(step => step.label), ['首页/全文检索', '首页/AI搜索', '首页/智能推荐-查看更多', '目录/AI战略咨询/超大规模智算引擎']);
  assert.deepEqual(result.flows.workbench.map(step => step.label), ['工作台/智能科研', '目录/AI科研/论文辅助生成', '工作台/智能阅读']);
  assert.deepEqual(result.flows.edu.map(step => step.label), ['首页/学', '首页/练', '首页/赛']);
});
check('Expandable configured steps sum declared events once and exclude unrelated directories', () => {
  const flow = createFlowDefinition({ value: 'custom', label: '可扩展流程', steps: [{ id: 'first', label: '第一步', eventIds: ['MD-8'] }, { id: 'last', label: '任意已配置目录', eventIds: ['MD-5', 'MD-20', 'MD-5'] }] });
  const result = aggregate(query('2026-11-01'), [record('2026-11-01', { 'MD-8': 20, 'MD-5': 3, 'MD-20': 4, 'MD-4': 90 }, ['a'])], { flowDefinitions: [flow] });
  assert.deepEqual(result.flows.custom.map(step => step.count), [20, 7]);
  assert.equal(result.events, 117);
  assert.throws(() => createFlowDefinition({ value: 'bad', label: 'bad', steps: [] }), TypeError);
});
check('Actual trigger counts preserve nonmonotonic >100% conversion and zero denominator steps', () => {
  const result = aggregate(query('2026-11-01'), [record('2026-11-01', { 'MD-8': 2, 'MD-10': 5, 'MD-12': 0, 'MD-5': 7 }, ['a'])]);
  assert.deepEqual(result.flows.search.map(step => step.count), [2, 5, 0, 7]);
  assert.equal(result.flows.search[1].count / result.flows.search[0].count, 2.5);
  assert.equal(result.flows.search.at(-1).count / result.flows.search[0].count, 3.5);
  const firstZero = aggregate(query('2026-11-01'), [record('2026-11-01', { 'MD-8': 0, 'MD-10': 3 }, ['a'])]);
  assert.equal(firstZero.flows.search[0].count, 0);
  assert.equal(firstZero.flows.search[1].count, 3);
});
check('Calendar binning includes February, leap day and all days of a leap year', () => {
  assert.equal(report(query('2026-02-01', '2026-02-28')).trend.length, 28);
  const leap = report(query('2024-02-01', '2024-02-29'));
  assert.equal(leap.trend.length, 29);
  assert.equal(leap.trend.at(-1).date, '2024-02-29');
  assert.equal(report(query('2024-01-01', '2024-12-31')).trend.length, 366);
  assert.deepEqual(report(defaultRange('year', asOf)).trend.map(item => item.label), ['2024', '2025', '2026']);
});
check('Effective coverage clips unavailable history and future tails without changing selected labels', () => {
  const currentMonth = report(query('2026-11', '2026-11', 'month'));
  assert.equal(currentMonth.rangeLabel, '2026-11');
  assert.equal(currentMonth.effectiveRangeLabel, '2026-11-01 至 2026-11-03');
  assert.equal(currentMonth.partialCoverage, true);
  const rows = [record('2026-11-01', { 'MD-8': 2 }, ['a'])];
  const partial = aggregate(query('2026-10-25', '2026-11-02'), rows, { sourceStart: '2026-11-01' });
  assert.equal(partial.partialCoverage, true);
  assert.equal(partial.rangeLabel, '2026-10-25 至 2026-11-02');
  assert.equal(partial.effectiveRangeLabel, '2026-11-01 至 2026-11-02');
  assert.equal(partial.events, 2);
  assert.equal(partial.users, 1);
  assert.deepEqual(partial.trend.map(item => item.events), [2, 0]);
});
check('Records outside the selected current window never affect any statistic', () => {
  const selected = record('2026-11-01', { 'MD-8': 10, 'MD-10': 4 }, ['a', 'b'], 3);
  const expected = aggregate(query('2026-11-01'), [selected]);
  const extra = aggregate(query('2026-11-01'), [record('2026-10-31', { 'MD-8': 999 }, ['old']), selected, record('2026-11-02', { 'MD-8': 888 }, ['later'])]);
  assert.deepEqual(extra, expected);
});
check('Pure future and no-event windows have no phantom trend/ranking/conversions', () => {
  for (const result of [report(query('2027', '2027', 'year')), aggregate(query('2026-11-01'), []), aggregate(query('2026-11-01'), [record('2026-11-01', {}, [])])]) {
    assert.equal(result.events, 0);
    assert.equal(result.users, 0);
    assert.deepEqual(result.trend, []);
    assert.deepEqual(result.ranking, []);
    assert.ok(Object.values(result.flows).flat().every(step => step.count === 0));
  }
});
check('Data cutoff preserves historical values and excludes future source records', () => {
  const earlier = summarizeAnalytics(query('2026-10-28', '2026-11-03'), '2026-11-01'), exact = report(query('2026-10-28', '2026-11-01'));
  assert.equal(earlier.events, exact.events);
  assert.equal(earlier.users, exact.users);
  const future = aggregate(query('2026-11-01', '2026-11-10'), [record('2026-11-01', { 'MD-8': 2 }, ['a']), record('2026-11-04', { 'MD-8': 9 }, ['b'])]);
  assert.equal(future.events, 2);
  assert.equal(future.trend.at(-1).date, asOf);
});
console.log(`Analytics current-window model: ${checks} meaningful checks passed.`);
