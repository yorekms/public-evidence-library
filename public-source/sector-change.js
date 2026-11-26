/* Midpoint shift-share accounting for the three published sectors. */
(() => {
  'use strict';

  function endpoint(row) {
    if (!Array.isArray(row) || row.length < 7) return null;
    const shares = row.slice(1, 4);
    const levels = row.slice(4, 7);
    if (!shares.every(s => Number.isFinite(s) && s >= 0) || !levels.every(Number.isFinite)) return null;
    const sum = shares.reduce((a, b) => a + b, 0);
    if (sum <= 0) return null;
    const weights = shares.map(share => share / sum);
    const mean = levels.reduce((total, level, i) => total + weights[i] * level, 0);
    return {weights, levels, mean};
  }

  function compare(first, last) {
    const from = endpoint(first);
    const to = endpoint(last);
    if (!from || !to || first[0] >= last[0]) return null;
    const sectors = from.weights.map((weight, i) => {
      const level = from.levels[i];
      const within = (weight + to.weights[i]) / 2 * (to.levels[i] - level);
      const mix = (level + to.levels[i]) / 2 * (to.weights[i] - weight);
      return {within, mix, total:within + mix};
    });
    return {
      from:from.mean, to:to.mean, total:to.mean - from.mean,
      within:sectors.reduce((sum, sector) => sum + sector.within, 0),
      mix:sectors.reduce((sum, sector) => sum + sector.mix, 0), sectors
    };
  }

  if (typeof module === 'object' && module.exports) module.exports = {compare};
  else window.SectorProductivityChange = {compare};
})();
