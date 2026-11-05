import assert from 'node:assert/strict';
import { aggregateAnalyticsRecords } from '../app/assets/event-analytics-model.js';
import { BEHAVIOR_PAGES, BEHAVIOR_BUTTONS, BEHAVIOR_ADVICE_TEMPLATES, projectCompletedVisitsToDaily,
  aggregateBehaviorRecords, summarizeBehavior } from '../app/assets/event-behavior-model.js';

const asOf = '2026-11-05';
const query = (start, end = start, granularity = 'day') => ({ granularity, start, end });
const aggregate = (selection, records, options = {}) => aggregateBehaviorRecords(selection, { records, asOf, ...options });
const event = (buttonId, type, at, valid = true) => ({ buttonId, type, at, valid });
const visit = (patch = {}) => ({ visitId: 'v1', pageId: 'home', startedAt: '2026-11-04T23:58:00+08:00',
  endedAt: '2026-11-05T00:02:00+08:00', visibleMs: 90000, buttonEvents: [], ...patch });
let checks = 0;
function check(name, run) { run(); checks++; console.log(`✓ ${name}`); }

check('Only eight explicitly configured positive buttons are included, independently of all business events', () => {
  assert.equal(BEHAVIOR_PAGES.length, 8);
  assert.deepEqual(BEHAVIOR_BUTTONS.map(button => button.id), ['MD-8', 'MD-10', 'MD-12', 'MD-2', 'MD-3', 'MD-5', 'MD-18', 'MD-19']);
  const result = aggregate(query('2026-11-04'), [{ date: '2026-11-04', buttons: {
    'MD-8': { exposureVisits: 10, clickedVisits: 1 }, 'MD-1': { exposureVisits: 99, clickedVisits: 0 },
  } }]);
  assert.deepEqual(result.buttons.map(button => button.id), ['MD-8']);
});

check('A completed cross-midnight visit is attributed to its Shanghai start date, without changing visit ID', () => {
  const source = visit({ buttonEvents: [event('MD-8', 'exposure', '2026-11-04T23:59:00+08:00'), event('MD-8', 'click', '2026-11-05T00:01:00+08:00')] });
  assert.deepEqual(projectCompletedVisitsToDaily([source], { asOf: '2026-11-04' }), []);
  const daily = projectCompletedVisitsToDaily([source], { asOf });
  assert.equal(daily[0].date, '2026-11-04');
  assert.deepEqual(daily[0].pages.home, { visits: 1, totalVisibleMs: 90000 });
  assert.deepEqual(daily[0].buttons['MD-8'], { exposureVisits: 1, clickedVisits: 1 });
});

check('Month crossing keeps both exposure and later click in the same start-month denominator', () => {
  const source = visit({ startedAt: '2026-10-31T23:58:00+08:00', endedAt: '2026-11-01T00:02:00+08:00',
    buttonEvents: [event('MD-8', 'exposure', '2026-10-31T23:59:00+08:00'), event('MD-8', 'click', '2026-11-01T00:01:00+08:00')] });
  const daily = projectCompletedVisitsToDaily([source], { asOf });
  const october = aggregate(query('2026-10', '2026-10', 'month'), daily), november = aggregate(query('2026-11', '2026-11', 'month'), daily);
  assert.equal(october.buttons[0].rate, 1);
  assert.equal(october.pages[0].visits, 1);
  assert.deepEqual(november, { pages: [], buttons: [], lowButtons: [] });
});

check('Explicit offsets and UTC instants agree, while timestamps without a zone are not guessed', () => {
  const local = projectCompletedVisitsToDaily([visit()], { asOf });
  const utc = projectCompletedVisitsToDaily([visit({ startedAt: '2026-11-04T15:58:00Z', endedAt: '2026-11-04T16:02:00Z' })], { asOf });
  assert.deepEqual(utc, local);
  assert.deepEqual(projectCompletedVisitsToDaily([visit({ startedAt: '2026-11-04T23:58:00' })], { asOf }), []);
  assert.throws(() => summarizeBehavior(query('2026-11-04')), RangeError);
});

check('Repeated exposure/click events and retried visits count each button-visit pair only once', () => {
  const exposure = event('MD-8', 'exposure', '2026-11-04T23:59:00+08:00');
  const click = event('MD-8', 'click', '2026-11-05T00:01:00+08:00');
  const source = visit({ buttonEvents: [exposure, exposure, click, click] });
  const daily = projectCompletedVisitsToDaily([source, source, visit({ buttonEvents: [click] })], { asOf });
  assert.equal(daily[0].pages.home.visits, 1);
  assert.deepEqual(daily[0].buttons['MD-8'], { exposureVisits: 1, clickedVisits: 1 });
});

check('Only qualified in-visit exposure followed by a matching click contributes to CTR', () => {
  const daily = projectCompletedVisitsToDaily([visit({ buttonEvents: [
    event('MD-8', 'click', '2026-11-04T23:58:30+08:00'),
    event('MD-8', 'exposure', '2026-11-04T23:59:00+08:00'),
    event('MD-8', 'click', '2026-11-05T00:03:00+08:00'),
    event('MD-10', 'click', '2026-11-05T00:01:00+08:00'),
    event('MD-12', 'exposure', '2026-11-05T00:01:00+08:00', false),
    event('MD-2', 'exposure', '2026-11-05T00:01:00+08:00'),
  ] })], { asOf });
  assert.deepEqual(daily[0].buttons, { 'MD-8': { exposureVisits: 1, clickedVisits: 0 } });
});

check('Unfinished and invalid time samples are excluded; a valid zero-second visit is retained', () => {
  const invalid = [visit({ endedAt: null }), visit({ visibleMs: -1 }), visit({ visibleMs: Infinity }), visit({ visibleMs: 999999 }), visit({ endedAt: '2026-11-04T23:57:00+08:00' })];
  assert.deepEqual(projectCompletedVisitsToDaily(invalid, { asOf }), []);
  const zero = projectCompletedVisitsToDaily([visit({ visibleMs: 0 })], { asOf });
  assert.equal(aggregate(query('2026-11-04'), zero).pages[0].averageVisibleMs, 0);
});

check('Anonymous and logged-in visits use the same visit scope without user-level deduplication', () => {
  const events = [event('MD-8', 'exposure', '2026-11-04T23:59:00+08:00')];
  const daily = projectCompletedVisitsToDaily([visit({ visitId: 'anonymous', userId: null, buttonEvents: events }), visit({ visitId: 'logged-in', userId: 'u1', buttonEvents: events })], { asOf });
  assert.equal(daily[0].pages.home.visits, 2);
  assert.equal(daily[0].buttons['MD-8'].exposureVisits, 2);
});

check('Month/year averages and rates divide summed numerators by summed denominators, not daily means', () => {
  const rows = [
    { date: '2026-11-01', pages: { home: { visits: 1, totalVisibleMs: 1000 } }, buttons: { 'MD-8': { exposureVisits: 1, clickedVisits: 1 } } },
    { date: '2026-11-02', pages: { home: { visits: 9, totalVisibleMs: 90000 } }, buttons: { 'MD-8': { exposureVisits: 99, clickedVisits: 0 } } },
  ];
  for (const selection of [query('2026-11-01', '2026-11-02'), query('2026-11', '2026-11', 'month'), query('2026', '2026', 'year')]) {
    const result = aggregate(selection, rows);
    assert.equal(result.pages[0].visits, 10);
    assert.equal(result.pages[0].averageVisibleMs, 9100);
    assert.equal(result.buttons[0].exposureVisits, 100);
    assert.equal(result.buttons[0].rate, .01);
  }
});

check('Daily fixtures are repeatable, weighted across granularity and preserve the cutoff', () => {
  const daily = summarizeBehavior(query('2026-11-01', '2026-11-05'), asOf);
  assert.deepEqual(daily, summarizeBehavior(query('2026-11', '2026-11', 'month'), asOf));
  assert.deepEqual(daily, summarizeBehavior(query('2026-11-01', '2026-11-20'), asOf));
  assert.deepEqual(daily, summarizeBehavior(query('2026-11-01', '2026-11-05'), asOf));
  assert.ok(daily.buttons.every(button => button.clickedVisits <= button.exposureVisits && button.rate >= 0 && button.rate <= 1));
  assert.ok(daily.buttons.every(button => button.exposureVisits <= daily.pages.find(page => page.id === button.pageId).visits));
  assert.ok(daily.pages.find(page => page.id === 'strategy').averageVisibleMs > daily.pages.find(page => page.id === 'home').averageVisibleMs * 3,
    'representative pages should show meaningful dwell-time differences in the preview');
  assert.deepEqual(summarizeBehavior(query('2027', '2027', 'year'), asOf), { pages: [], buttons: [], lowButtons: [] });
});

check('Valid zero-click rates are retained, while zero exposure and invalid samples do not become low-CTR candidates', () => {
  const result = aggregate(query('2026-11-04'), [{ date: '2026-11-04', pages: { home: { visits: 0, totalVisibleMs: 0 } }, buttons: {
    'MD-8': { exposureVisits: 7, clickedVisits: 0 }, 'MD-10': { exposureVisits: 0, clickedVisits: 0 },
    'MD-12': { exposureVisits: 2, clickedVisits: 3 }, 'MD-2': { exposureVisits: -1, clickedVisits: 0 },
    'MD-3': { exposureVisits: Infinity, clickedVisits: 0 },
  } }]);
  assert.equal(result.pages[0].averageVisibleMs, null);
  assert.equal(result.buttons.find(button => button.id === 'MD-8').rate, 0);
  assert.equal(result.buttons.find(button => button.id === 'MD-10').rate, null);
  assert.deepEqual(result.lowButtons.map(button => button.id), ['MD-8']);
});

check('Lowest 3 use exact rate, then exposure descending and natural ID; ineligible historical data remain in charts', () => {
  const definitions = BEHAVIOR_BUTTONS.map(button => ({ ...button, optimizationEligible: button.id !== 'MD-5' }));
  const result = aggregate(query('2026-11-04'), [{ date: '2026-11-04', buttons: {
    'MD-8': { exposureVisits: 100, clickedVisits: 1 }, 'MD-10': { exposureVisits: 200, clickedVisits: 2 },
    'MD-12': { exposureVisits: 200, clickedVisits: 2 }, 'MD-2': { exposureVisits: 10, clickedVisits: 0 },
    'MD-5': { exposureVisits: 1000, clickedVisits: 0 }, 'MD-18': { exposureVisits: 1, clickedVisits: 0 },
  } }], { buttonDefinitions: definitions });
  assert.deepEqual(result.lowButtons.map(button => button.id), ['MD-2', 'MD-18', 'MD-10']);
  assert.equal(result.buttons.find(button => button.id === 'MD-5').rate, 0);
  const exact = aggregate(query('2026-11-04'), [{ date: '2026-11-04', buttons: {
    'MD-8': { exposureVisits: 10000, clickedVisits: 101 }, 'MD-10': { exposureVisits: 10000, clickedVisits: 100 },
  } }]);
  assert.deepEqual(exact.lowButtons.map(button => button.id), ['MD-10', 'MD-8']);
});

check('Advice uses only the exact supplied templates and remains stable per button across queries', () => {
  assert.deepEqual(BEHAVIOR_ADVICE_TEMPLATES.map(({ title, body }) => [title, body]), [
    ['文案行动化', '动词开头 + 明确收益，如“立即领取优惠”优于“了解详情”'],
    ['视觉强化', '主操作按钮用品牌主色实心样式，次要按钮弱化为描边，拉开层级'],
    ['位置调整', '将按钮移入首屏视觉热区，或随滚动悬浮常驻'],
  ]);
  const one = aggregate(query('2026-11-01'), [{ date: '2026-11-01', buttons: { 'MD-8': { exposureVisits: 10, clickedVisits: 0 } } }]);
  const two = aggregate(query('2026-11-02'), [{ date: '2026-11-02', buttons: { 'MD-8': { exposureVisits: 20, clickedVisits: 1 } } }]);
  assert.deepEqual(one.lowButtons[0].advice, two.lowButtons[0].advice);
  one.lowButtons[0].advice.body = 'changed';
  assert.notEqual(two.lowButtons[0].advice.body, 'changed');
});

check('Adding measurement summaries never changes existing business event totals, ranks or flows', () => {
  const selection = query('2026-11-04'), base = { date: '2026-11-04', counts: { 'MD-8': 3 }, loggedInUserIds: ['a'], anonymousEvents: 1 };
  const measured = { ...base, pages: { home: { visits: 100, totalVisibleMs: 500000 } }, buttons: { 'MD-8': { exposureVisits: 80, clickedVisits: 2 } } };
  assert.deepEqual(aggregateAnalyticsRecords(selection, { records: [measured], asOf }), aggregateAnalyticsRecords(selection, { records: [base], asOf }));
  assert.equal(aggregate(selection, [measured]).buttons[0].rate, .025);
});

console.log(`Behavior model: ${checks} meaningful checks passed.`);
