// Shared by the chassis ring and HUD so both report the same health state.
export function getHealthRatio(current, max) {
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(1, current / max));
}

export function getHealthColor(ratio) {
  const value = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  const red = [240, 66, 82];
  const yellow = [244, 207, 68];
  const green = [52, 217, 133];
  const from = value < 0.5 ? red : yellow;
  const to = value < 0.5 ? yellow : green;
  const blend = value < 0.5 ? value * 2 : (value - 0.5) * 2;
  return `rgb(${from.map((channel, i) => Math.round(channel + (to[i] - channel) * blend)).join(', ')})`;
}
