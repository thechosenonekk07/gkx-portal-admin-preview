import assert from 'node:assert/strict';
import { buildFunnelGeometry } from '../app/assets/event-analytics-funnel.js';

const geometry = counts => buildFunnelGeometry(counts.map(count => ({ count })));
const coordinates = polygon => polygon.points.split(' ').map(pair => pair.split(',').map(Number));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} should equal ${expected}`);
let checks = 0;
function check(name, run) { run(); checks++; console.log(`✓ ${name}`); }

check('Four-step funnel uses one true count scale and an equal-width final stage', () => {
  const result = geometry([100, 60, 30, 10]);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map(item => [item.top, item.bottom]), [[1, .6], [.6, .3], [.3, .1], [.1, .1]]);
  const first = coordinates(result[0]);
  assert.deepEqual(first[0], [8, 2]);
  assert.deepEqual(first[1], [992, 2]);
  near(first[2][0], 795.2);
  near(first[3][0], 204.8);
  near(result[0].connectorStart, (first[1][0] + first[2][0]) / 2);
  const final = coordinates(result.at(-1));
  assert.equal(final[0][0], final[3][0]);
  assert.equal(final[1][0], final[2][0]);
});

check('Three-step flow keeps the same geometry rules and does not add a fourth layer', () => {
  const result = geometry([80, 40, 20]);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(item => [item.top, item.bottom]), [[1, .5], [.5, .25], [.25, .25]]);
  assert.deepEqual(buildFunnelGeometry([]), []);
});

check('Zero first and middle steps have no painted area while later counts remain visible', () => {
  const firstZero = geometry([0, 60, 30]);
  assert.deepEqual(firstZero[0], { top: 0, bottom: 0, points: '', connectorStart: 500 });
  assert.equal(firstZero[1].top, 1);
  assert.ok(firstZero[1].points);
  const middleZero = geometry([100, 0, 20]);
  assert.equal(middleZero[0].bottom, 0);
  assert.deepEqual(middleZero[1], { top: 0, bottom: 0, points: '', connectorStart: 500 });
  assert.equal(middleZero[2].top, .2);
  assert.equal(middleZero[2].bottom, .2);
});

check('All-zero input has no area and never divides by zero', () => {
  for (const item of geometry([0, 0, 0, 0])) assert.deepEqual(item, { top: 0, bottom: 0, points: '', connectorStart: 500 });
});

check('Equal counts are rectangles and increasing counts actually widen', () => {
  const equal = geometry([40, 40, 40]);
  assert.ok(equal.every(item => item.top === 1 && item.bottom === 1));
  const expanding = geometry([20, 80, 40]);
  assert.equal(expanding[0].top, .25);
  assert.equal(expanding[0].bottom, 1);
  const first = coordinates(expanding[0]);
  assert.ok(first[2][0] - first[3][0] > first[1][0] - first[0][0]);
  assert.equal(expanding[1].top, 1);
});

check('Very large and tiny finite values stay bounded and do not gain false minimum widths', () => {
  for (const counts of [[Number.MAX_VALUE, Number.MAX_VALUE / 2, 1], [1, 1e-12, 0]]) {
    const result = geometry(counts);
    for (const item of result) {
      assert.ok(Number.isFinite(item.top) && item.top >= 0 && item.top <= 1);
      assert.ok(Number.isFinite(item.bottom) && item.bottom >= 0 && item.bottom <= 1);
      assert.ok(Number.isFinite(item.connectorStart) && item.connectorStart >= 500 && item.connectorStart <= 992);
      if (!item.points) continue;
      const points = coordinates(item);
      assert.ok(points.every(([x, y]) => Number.isFinite(x) && x >= 8 && x <= 992 && (y === 2 || y === 66)));
      near(points[0][0] + points[1][0], 1000);
      near(points[2][0] + points[3][0], 1000);
    }
  }
  const small = coordinates(geometry([1, 1e-12])[1]);
  assert.ok(small[1][0] - small[0][0] < 1e-8, 'tiny values must not become a minimum-width filled bar');
});

check('The helper does not alter step values or order', () => {
  const steps = Object.freeze([Object.freeze({ id: 'a', count: 90 }), Object.freeze({ id: 'b', count: 30 })]);
  const result = buildFunnelGeometry(steps);
  assert.deepEqual(steps.map(step => step.count), [90, 30]);
  assert.equal(result[0].top, 1);
  assert.equal(result[1].top, 1 / 3);
});

console.log(`Funnel geometry: ${checks} meaningful checks passed.`);
