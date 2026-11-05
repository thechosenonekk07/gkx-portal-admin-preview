import assert from 'node:assert/strict';
import { createColumnScale, columnRatio } from '../app/assets/event-behavior-chart.js';

let checks = 0;
function check(name, run) { run(); checks++; console.log(`✓ ${name}`); }
const approximately = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= Math.max(Number.MIN_VALUE, Math.abs(expected) * tolerance), `${actual} should equal ${expected}`);
function consistent(scale) {
  assert.ok(Number.isFinite(scale.maximum) && scale.maximum > 0);
  assert.equal(scale.ticks[0], 0);
  assert.equal(scale.ticks.at(-1), scale.maximum);
  assert.ok(scale.ticks.length >= 2 && scale.ticks.length <= 7);
  const segments = scale.ticks.length - 1;
  for (let index = 1; index <= segments; index++) {
    assert.ok(Number.isFinite(scale.ticks[index]) && scale.ticks[index] > scale.ticks[index - 1]);
    approximately(scale.ticks[index], scale.maximum * (index / segments));
  }
}

check('221.8 seconds has readable zero-based 50-second ticks covering the data', () => {
  const scale = createColumnScale([45, 95.5, 221.8]);
  assert.deepEqual(scale, { maximum: 250, ticks: [0, 50, 100, 150, 200, 250] });
  consistent(scale);
  approximately(columnRatio(221.8, scale.maximum), .8872);
});
check('26.5 percent uses fraction input with stable decimal ticks', () => {
  const scale = createColumnScale([.08, .265], { kind: 'clicks' });
  assert.deepEqual(scale, { maximum: .3, ticks: [0, .1, .2, .3] });
  consistent(scale);
  approximately(columnRatio(.265, scale.maximum), .265 / .3);
});
check('100 percent remains fully visible and a click-rate axis never exceeds 100 percent', () => {
  for (const steps of [1, 3, 5, 6]) {
    const scale = createColumnScale([.01, .91, 1], { kind: 'clicks', steps });
    assert.equal(scale.maximum, 1);
    consistent(scale);
    assert.equal(columnRatio(1, scale.maximum), 1);
  }
  assert.equal(createColumnScale([2], { kind: 'clicks' }).maximum, 1);
});
check('Zero and unavailable observations remain distinct with useful empty-axis defaults', () => {
  assert.deepEqual(createColumnScale([0, null, NaN, -1, Infinity]), { maximum: 1, ticks: [0, .2, .4, .6, .8, 1] });
  assert.deepEqual(createColumnScale([], { kind: 'clicks' }), { maximum: .1, ticks: [0, .02, .04, .06, .08, .1] });
  assert.equal(columnRatio(0, 1), 0);
  assert.equal(columnRatio(null, 1), null);
  assert.equal(columnRatio(NaN, 1), null);
  assert.equal(columnRatio(Infinity, 1), null);
  assert.equal(columnRatio(-1, 1), null);
  assert.equal(columnRatio(1, 0), null);
  assert.equal(columnRatio(10, 1), 1);
});
check('Large and small axes stay finite, monotonic, evenly spaced and cover representative values', () => {
  for (const value of [1e-6, .0037, .22, 1e9, 9e99, 1e-300, Number.MIN_VALUE, 4 * Number.MIN_VALUE, 7 * Number.MIN_VALUE, Number.MAX_VALUE]) {
    const scale = createColumnScale([value]);
    consistent(scale);
    assert.ok(scale.maximum >= value || Math.abs(scale.maximum / value - 1) < 1e-12);
    assert.ok(columnRatio(value, scale.maximum) > 0 && columnRatio(value, scale.maximum) <= 1);
  }
});
check('Tick limits and repeated results are stable across supplied step preferences', () => {
  for (const steps of [0, -5, 2, 4, 6, 99, NaN]) {
    const selection = [12.7, 221.8];
    const scale = createColumnScale(selection, { steps });
    consistent(scale);
    assert.deepEqual(createColumnScale(selection, { steps }), scale);
    assert.deepEqual(selection, [12.7, 221.8]);
  }
});
console.log(`Behavior chart scale: ${checks} meaningful checks passed.`);
