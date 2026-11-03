import assert from 'node:assert/strict';
import { createAnalyticsQueryController, createPreviewAnalyticsLoader } from '../app/assets/event-analytics-query.js';

const selection = () => ({ granularity: 'day', start: '2026-10-05', end: '2026-11-03' });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = () => new Promise(resolve => setImmediate(resolve));
let checks = 0;
async function check(name, test) { await test(); checks++; console.log(`✓ ${name}`); }

await check('Submission locks synchronously and snapshots the chosen range', async () => {
  const pending = deferred(), states = [];
  let received;
  const controller = createAnalyticsQueryController({
    load: query => { received = query; return pending.promise; },
    onState: state => states.push(state),
  });
  const draft = selection();
  assert.equal(controller.run(draft), true);
  assert.equal(controller.isLoading(), true);
  assert.equal(states[0].status, 'loading');
  assert.equal(controller.run(selection()), false);
  draft.start = '2026-01-01';
  await settle();
  assert.equal(received.start, '2026-10-05');
  assert.equal(Object.isFrozen(received), true);
  const result = { events: 100, users: 12, updatedAt: '2026-11-03T03:00:00.000Z' };
  pending.resolve(result);
  await settle();
  assert.deepEqual(states.map(state => state.status), ['loading', 'success']);
  assert.equal(states[1].result, result);
  assert.equal(states[1].query, received);
  assert.equal(controller.isLoading(), false);
  controller.dispose();
});

await check('Synchronous and asynchronous query failures allow a clean retry', async () => {
  const states = [];
  let call = 0;
  const controller = createAnalyticsQueryController({
    load: () => {
      call++;
      if (call === 1) throw new Error('temporary synchronous failure');
      if (call === 2) return Promise.reject('temporary asynchronous failure');
      return { events: 7 };
    },
    onState: state => states.push(state),
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(controller.run(selection()), true);
    await settle();
    assert.equal(controller.isLoading(), false);
  }
  assert.deepEqual(states.map(state => state.status), ['loading', 'error', 'loading', 'error', 'loading', 'success']);
  assert.equal(states[1].error.message, 'temporary synchronous failure');
  assert.equal(states[3].error.message, 'temporary asynchronous failure');
  assert.equal(states[3].error instanceof Error, true);
  assert.equal(states[5].result.events, 7);
  controller.dispose();
});

await check('A query can start from the previous success callback without being cleared by stale cleanup', async () => {
  const states = [];
  let controller;
  controller = createAnalyticsQueryController({
    load: query => ({ start: query.start }),
    onState: state => {
      states.push(state);
      if (state.status === 'success' && state.query.start === '2026-10-05') controller.run({ ...selection(), start: '2026-10-06' });
    },
  });
  controller.run(selection());
  await settle();
  assert.deepEqual(states.map(state => state.status), ['loading', 'success', 'loading', 'success']);
  assert.equal(states.at(-1).result.start, '2026-10-06');
  assert.equal(controller.isLoading(), false);
  controller.dispose();
});

await check('Disposal before the loader starts prevents the request and all later callbacks', async () => {
  let calls = 0;
  const states = [];
  const controller = createAnalyticsQueryController({ load: () => { calls++; }, onState: state => states.push(state) });
  controller.run(selection());
  controller.dispose();
  controller.dispose();
  await settle();
  assert.equal(calls, 0);
  assert.deepEqual(states.map(state => state.status), ['loading']);
  assert.equal(controller.isLoading(), false);
  assert.equal(controller.run(selection()), false);
});

await check('Unmount aborts in-flight work and suppresses stale success or failure', async () => {
  for (const completion of ['resolve', 'reject']) {
    const pending = deferred(), states = [];
    let signal;
    const controller = createAnalyticsQueryController({ load: (_query, options) => { signal = options.signal; return pending.promise; }, onState: state => states.push(state) });
    controller.run(selection());
    await settle();
    controller.dispose();
    assert.equal(signal.aborted, true);
    pending[completion](completion === 'resolve' ? { events: 100 } : new Error('late failure'));
    await settle();
    assert.deepEqual(states.map(state => state.status), ['loading']);
  }
});

await check('The preview adapter is asynchronous and timestamps successful completion', async () => {
  const pending = deferred();
  let computeCalled = false, clockCalls = 0;
  const load = createPreviewAnalyticsLoader({
    delayMs: 0,
    compute: query => { computeCalled = true; assert.equal(query.start, '2026-10-05'); return pending.promise; },
    now: () => { clockCalls++; return new Date('2026-11-03T03:20:00.000Z'); },
  });
  const resultPromise = load(selection());
  assert.equal(computeCalled, false);
  // Resolve independently; the adapter still has to wait for its async turn.
  pending.resolve({ events: 42, users: 8, updatedAt: 'old' });
  const result = await resultPromise;
  assert.equal(computeCalled, true);
  assert.equal(clockCalls, 1);
  assert.deepEqual(result, { events: 42, users: 8, updatedAt: '2026-11-03T03:20:00.000Z' });
});

await check('Cancelling the preview delay avoids both computation and timestamp updates', async () => {
  let computeCalls = 0, clockCalls = 0;
  const controller = new AbortController();
  const load = createPreviewAnalyticsLoader({ delayMs: 1000, compute: () => { computeCalls++; return {}; }, now: () => { clockCalls++; return new Date(); } });
  const promise = load(selection(), { signal: controller.signal });
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.equal(computeCalls, 0);
  assert.equal(clockCalls, 0);
});

await check('An already cancelled request cannot compute', async () => {
  const controller = new AbortController();
  controller.abort();
  let computeCalls = 0;
  const load = createPreviewAnalyticsLoader({ delayMs: 0, compute: () => { computeCalls++; return {}; } });
  await assert.rejects(load(selection(), { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(computeCalls, 0);
});

await check('Cancellation during async computation rejects promptly and never publishes an update time', async () => {
  const started = deferred(), pending = deferred();
  const controller = new AbortController();
  let clockCalls = 0;
  const load = createPreviewAnalyticsLoader({
    delayMs: 0,
    compute: () => { started.resolve(); return pending.promise; },
    now: () => { clockCalls++; return new Date(); },
  });
  const promise = load(selection(), { signal: controller.signal });
  await started.promise;
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  pending.resolve({ events: 42 });
  await settle();
  assert.equal(clockCalls, 0);
});

await check('Failed or invalid computation never refreshes the successful data timestamp', async () => {
  let clockCalls = 0;
  const now = () => { clockCalls++; return new Date(); };
  const throwing = createPreviewAnalyticsLoader({ delayMs: 0, compute: () => { throw new Error('compute failed'); }, now });
  await assert.rejects(throwing(selection()), /compute failed/);
  const invalid = createPreviewAnalyticsLoader({ delayMs: 0, compute: () => null, now });
  await assert.rejects(invalid(selection()), /未返回有效结果/);
  assert.equal(clockCalls, 0);
});

console.log(`Analytics query lifecycle: ${checks} meaningful checks passed.`);
