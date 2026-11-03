// Coordinates use viewBox="0 0 1000 68". Width encodes the step count at
// each top edge; the bottom edge meets the next count on the same scale.
// Empty layers retain their row elsewhere in the UI, without invented area.
export function buildFunnelGeometry(steps = []) {
  const counts = steps.map(step => Number.isFinite(step?.count) && step.count > 0 ? step.count : 0);
  const maximum = counts.reduce((max, count) => Math.max(max, count), 0);
  const center = 500, halfWidth = 492;
  return counts.map((count, index) => {
    if (count === 0 || maximum === 0) return { top: 0, bottom: 0, points: '', connectorStart: center };
    const top = count / maximum;
    const bottom = index === counts.length - 1 ? top : counts[index + 1] / maximum;
    const points = `${center - top * halfWidth},2 ${center + top * halfWidth},2 ${center + bottom * halfWidth},66 ${center - bottom * halfWidth},66`;
    return { top, bottom, points, connectorStart: center + (top + bottom) / 2 * halfWidth };
  });
}
