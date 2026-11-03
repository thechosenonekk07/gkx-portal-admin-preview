import assert from 'node:assert/strict';
import { DATA_START, GRANULARITIES, FLOWS, defaultRange, validateRange, summarizeAnalytics } from '../app/assets/event-analytics-model.js';

const asOf = '2026-11-03';
const query = (start, end = start, granularity = 'day') => ({ granularity, start, end });
let checks = 0;
function check(name, run) { run(); checks++; console.log(`✓ ${name}`); }
const report = value => summarizeAnalytics(value, asOf);

check('Default ranges use the supplied date and calendar granularity', () => {
  assert.deepEqual(defaultRange('day', asOf), query('2026-10-28', '2026-11-03'));
  assert.deepEqual(defaultRange('month', asOf), query('2026-01', '2026-11', 'month'));
  assert.deepEqual(defaultRange('year', asOf), query('2024', '2026', 'year'));
  assert.equal(GRANULARITIES.length, 3);
  assert.equal(FLOWS.length, 3);
});

check('Validation rejects missing/reversed/impossible periods without rejecting future periods', () => {
  for (const invalid of [null, {}, query('', ''), query('2026-11-04', '2026-11-03'), query('2026-02-30'), query('2026-13', '2026-13', 'month'), query('abc', 'abc', 'year')]) assert.notEqual(validateRange(invalid, asOf), '');
  assert.equal(validateRange(query('2024-02-29'), asOf), '');
  assert.equal(validateRange(query('2027-01', '2027-03', 'month'), asOf), '');
  assert.throws(() => report(query('2026-02-30')), RangeError);
});

check('Repeated queries are deterministic and callers cannot mutate cached fixtures', () => {
  const selection = query('2026-10-28', '2026-11-03');
  const first = report(selection), second = report(selection);
  assert.deepEqual(first, second);
  first.trend[0].events = 0;
  first.flows.search[0].count = 0;
  assert.deepEqual(report(selection), second);
});

check('KPI event totals equal day, month and year trend sums for the same data window', () => {
  const daily = report(query('2026-01-01', '2026-11-03'));
  const monthly = report(query('2026-01', '2026-11', 'month'));
  const yearly = report(query('2026', '2026', 'year'));
  for (const result of [daily, monthly, yearly]) assert.equal(result.events, result.trend.reduce((sum, item) => sum + item.events, 0));
  assert.equal(daily.events, monthly.events);
  assert.equal(monthly.events, yearly.events);
  assert.equal(daily.users, monthly.users);
  assert.equal(monthly.users, yearly.users);
});

check('Range UV is a union of stable identities, not daily UV addition', () => {
  const result = report(query('2026-10-28', '2026-11-03'));
  const dailyTotal = result.trend.reduce((sum, item) => sum + item.users, 0);
  assert.ok(result.users < dailyTotal, 'fixture must include overlapping users');
  assert.ok(result.users >= Math.max(...result.trend.map(item => item.users)));
  assert.ok(result.users <= result.events);
  const one = report(query('2026-10-28'));
  assert.equal(one.users, one.trend[0].users);
});

check('Ranking is TOP 10 and percentages use all events as the denominator', () => {
  const result = report(defaultRange('day', asOf));
  assert.equal(result.ranking.length, 10);
  assert.ok(result.ranking.every((item, index, rows) => index === 0 || rows[index - 1].count >= item.count));
  assert.ok(result.ranking.reduce((sum, item) => sum + item.count, 0) < result.events);
  for (const item of result.ranking) assert.equal(item.share, item.count / result.events);
});

check('Every flow is non-increasing and its counts agree with ranking records', () => {
  const result = report(defaultRange('day', asOf));
  for (const flow of Object.values(result.flows)) {
    assert.equal(flow.length, 4);
    assert.ok(flow.every((step, index) => index === 0 || flow[index - 1].count >= step.count));
    assert.ok(flow[0].count > 0);
    for (const step of flow) {
      const rank = result.ranking.find(item => item.id === step.id);
      if (rank) assert.equal(step.count, rank.count);
    }
  }
});

check('Previous daily interval has the same inclusive length and correct deltas', () => {
  const result = report(query('2026-10-28', '2026-11-03'));
  const prior = report(query('2026-10-21', '2026-10-27'));
  assert.equal(result.previousLabel, '2026-10-21 至 2026-10-27');
  assert.equal(result.previousEvents, prior.events);
  assert.equal(result.previousUsers, prior.users);
  assert.equal(result.eventDelta, (result.events - prior.events) / prior.events);
  assert.equal(result.userDelta, (result.users - prior.users) / prior.users);
});

check('In-progress month comparison aligns elapsed days and handles end-of-month clamping', () => {
  const result = report(query('2026-11', '2026-11', 'month'));
  assert.equal(result.previousLabel, '2026-10-01 至 2026-10-03');
  assert.equal(result.previousEvents, report(query('2026-10-01', '2026-10-03')).events);
  const march = summarizeAnalytics(query('2024-03', '2024-03', 'month'), '2024-03-31');
  assert.equal(march.previousLabel, '2024-02-01 至 2024-02-29');
});

check('Complete month and year comparisons include the entire preceding calendar interval', () => {
  const february = report(query('2026-02', '2026-02', 'month'));
  assert.equal(february.previousLabel, '2026-01-01 至 2026-01-31');
  assert.equal(february.previousEvents, report(query('2026-01-01', '2026-01-31')).events);
  const leapYear = report(query('2024', '2024', 'year'));
  assert.equal(leapYear.previousLabel, '2023-01-01 至 2023-12-31');
  const multipleMonths = report(query('2026-02', '2026-03', 'month'));
  assert.equal(multipleMonths.previousLabel, '2025-12-01 至 2026-01-31');
  const future = report(query('2027-01', '2027-02', 'month'));
  assert.equal(future.previousLabel, '2026-11-01 至 2026-12-31');
  assert.equal(future.effectiveRangeLabel, '');
});

check('Insufficient source history never produces an invented percentage comparison', () => {
  const result = report(query(DATA_START, '2023-01-07'));
  assert.ok(result.events > 0);
  assert.equal(result.comparisonAvailable, false);
  assert.equal(result.eventDelta, null);
  assert.equal(result.userDelta, null);
});

check('Future and pre-history queries show zero without phantom ranking or conversion data', () => {
  for (const selection of [query('2026-11-04', '2026-11-10'), query('2022-01-01', '2022-12-31'), query('2027', '2027', 'year')]) {
    const result = report(selection);
    assert.equal(result.events, 0);
    assert.equal(result.users, 0);
    assert.deepEqual(result.trend, []);
    assert.deepEqual(result.ranking, []);
    assert.equal(result.comparisonAvailable, false);
    assert.ok(Object.values(result.flows).flat().every(step => step.count === 0));
    assert.equal(result.eventDelta, null);
  }
});

check('Bounded validation prevents unreasonable iteration and keeps pre-history available', () => {
  assert.equal(validateRange(query('2020-01-01', '2020-12-31'), asOf), '');
  assert.notEqual(validateRange(query('1990', '2026', 'year'), asOf), '');
  assert.notEqual(validateRange(query('2020', '9999', 'year'), asOf), '');
  assert.notEqual(validateRange(query('2020', '2050', 'year'), '2050-01-01'), '');
});

check('Leap-day yearly comparison clamps safely and uses the same elapsed progress', () => {
  const result = summarizeAnalytics(query('2024', '2024', 'year'), '2024-02-29');
  assert.equal(result.previousLabel, '2023-01-01 至 2023-02-28');
  const prior = summarizeAnalytics(query('2023-01-01', '2023-02-28'), '2024-02-29');
  assert.equal(result.previousEvents, prior.events);
  assert.equal(result.previousUsers, prior.users);
});

check('Data cutoff excludes future days and does not regenerate earlier values', () => {
  const earlier = summarizeAnalytics(query('2026-10-28', '2026-11-03'), '2026-11-01');
  const exact = report(query('2026-10-28', '2026-11-01'));
  assert.equal(earlier.events, exact.events);
  assert.equal(earlier.users, exact.users);
  assert.equal(earlier.trend.at(-1).date, '2026-11-01');
});

console.log(`Analytics model: ${checks} meaningful checks passed.`);
