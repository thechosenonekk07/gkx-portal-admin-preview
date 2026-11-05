const clean = value => Number(value.toPrecision(14));
const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const niceStep = value => {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  // Subnormal values can have a decimal magnitude below IEEE's minimum.
  if (magnitude === 0) return value;
  const fraction = value / magnitude;
  const factor = [1, 2, 2.5, 5, 10].find(candidate => candidate >= fraction - Number.EPSILON * Math.max(1, fraction) * 8);
  return factor * magnitude;
};

// Duration values use seconds; click rates use fractions (0.265 means 26.5%).
// The axis always starts at zero. Invalid observations never create columns.
export function createColumnScale(values, { kind = 'duration', steps = 5 } = {}) {
  if (!['duration', 'clicks'].includes(kind)) throw new RangeError('柱状图指标类型无效');
  const preferred = Number.isFinite(steps) ? Math.max(1, Math.min(6, Math.round(steps))) : 5;
  const observed = values.reduce((maximum, value) => valid(value) ? Math.max(maximum, kind === 'clicks' ? Math.min(1, value) : value) : maximum, 0);
  const target = observed || (kind === 'clicks' ? .1 : 1);
  let step = niceStep(Math.max(Number.MIN_VALUE, target / preferred));
  let count = Math.max(1, Math.ceil(target / step - Number.EPSILON * Math.max(1, target / step) * 8));
  // At the subnormal limit, division rounds to whole representable quanta.
  // Increase their unit instead of emitting too many or uneven rounded ticks.
  while (count > 6 && Number.isFinite(step)) {
    step *= 2;
    count = Math.max(1, Math.ceil(target / step));
  }
  let maximum = step * count;
  if (!Number.isFinite(maximum)) {
    // No larger "nice" finite number exists near Number.MAX_VALUE.
    maximum = target;
    count = preferred;
  } else {
    maximum = clean(maximum);
  }
  if (kind === 'clicks') maximum = Math.min(1, maximum);
  const ticks = Array.from({ length: count + 1 }, (_, index) => index === 0 ? 0
    : index === count ? maximum : clean(maximum * (index / count)));
  return { maximum, ticks };
}

export function columnRatio(value, maximum) {
  if (!valid(value) || !Number.isFinite(maximum) || maximum <= 0) return null;
  return Math.min(1, value / maximum);
}
