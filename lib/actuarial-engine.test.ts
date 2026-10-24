import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOB_SEGMENTS,
  calculateReserves,
  runBootstrapSimulation,
  computeCrossSegmentMovers,
  generateActuarialSuggestions,
  evaluateOptimalMethodsForLob,
  applyBestFitToRecipe,
  overrideOriginMethodSelection,
  isCellDropped,
  cleanNumber,
} from './actuarial-engine';

test('cleanNumber converts NaN and Infinity to null and rounds properly', () => {
  assert.equal(cleanNumber(NaN), null);
  assert.equal(cleanNumber(Infinity), null);
  assert.equal(cleanNumber(1.234567, 4), 1.2346);
});

test('drop_cells outlier exclusion reduces LDF when excluding judicial spike cell ("2021", 24)', () => {
  const baseRecipe = structuredClone(LOB_SEGMENTS.auto_bi.default_recipe);
  baseRecipe.paid_dev.drop_cells = [];
  const resWithoutDrop = calculateReserves(baseRecipe);

  const dropRecipe = structuredClone(LOB_SEGMENTS.auto_bi.default_recipe);
  dropRecipe.paid_dev.drop_cells = [['2021', 24]];
  const resWithDrop = calculateReserves(dropRecipe);

  // Index 1 corresponds to dev 24 -> 36 transition
  const ldfWithoutDrop = resWithoutDrop.paid_ldfs_by_period.all_volume[1];
  const ldfWithDrop = resWithDrop.paid_ldfs_by_period.all_volume[1];

  assert.equal(isCellDropped(dropRecipe.paid_dev.drop_cells, '2021', 24), true);
  assert.ok(
    ldfWithDrop < ldfWithoutDrop,
    `Expected LDF with dropped spike (${ldfWithDrop}) to be lower than un-dropped (${ldfWithoutDrop})`
  );
});

test('manual LDF override and constant tail factor propagate to CDF and Paid CL Ultimate', () => {
  const recipe = structuredClone(LOB_SEGMENTS.auto_bi.default_recipe);
  recipe.paid_dev.manual_ldf_overrides = { 12: 2.5 };
  recipe.paid_tail = {
    method: 'constant',
    tail_factor: 1.05,
    curve_type: 'exponential',
    extrap_periods: 5,
  };

  const res = calculateReserves(recipe);
  assert.equal(res.paid_ldfs_by_period.selected[0], 2.5);
  assert.equal(res.paid_tail_factor, 1.05);
  assert.equal(res.paid_cdf[res.paid_cdf.length - 1], 1.05);
});

test('Bornhuetter-Ferguson and method weight blending compute expected Ultimate and IBNR', () => {
  const recipe = structuredClone(LOB_SEGMENTS.auto_bi.default_recipe);
  // Set 2026 weight to 100% Paid BF
  recipe.origin_method_weights['2026'] = {
    paid_cl: 0,
    incurred_cl: 0,
    paid_bf: 1.0,
    incurred_bf: 0,
    cape_cod: 0,
  };
  const res = calculateReserves(recipe);
  assert.equal(res.selected_ultimate['2026'], res.ultimates_by_method.paid_bf['2026']);
  assert.ok(res.totals.selected_ibnr > 0);
  assert.ok(res.totals.total_mack_std_error > 0);
});

test('ODP Bootstrap simulation (n_sims=5000) produces monotonic Solvency percentiles', () => {
  const recipe = structuredClone(LOB_SEGMENTS.auto_bi.default_recipe);
  const boot = runBootstrapSimulation(recipe, 5000, 42);

  assert.equal(boot.n_sims, 5000);
  assert.equal(boot.histogram.length, 24);
  assert.ok(boot.percentiles.p50 < boot.percentiles.p75);
  assert.ok(boot.percentiles.p75 < boot.percentiles.p95);
  assert.ok(boot.percentiles.p95 < boot.percentiles.p99_5);
  assert.ok(boot.solvency_scr_99_5 > boot.risk_margin_75);
});

test('Actual vs Expected (AvE) and Prior Year Development (PYD) reconcile across prior accident years (2017-2025)', () => {
  const recipe = structuredClone(LOB_SEGMENTS.auto_bi.default_recipe);
  const res = calculateReserves(recipe);

  // 9 prior accident years: 2017 through 2025
  assert.equal(res.ave_pyd_by_origin.length, 9);
  assert.equal(res.ave_pyd_by_origin[0].origin, '2017');
  assert.equal(res.ave_pyd_by_origin[8].origin, '2025');

  // Verify reconciliation: Prior Years Current Ultimate + 2026 New Year Ultimate = Total Selected Ultimate
  const reconciledUlt =
    Math.round(
      (res.ave_pyd_totals.current_ultimate_prior_years +
        res.ave_pyd_totals.new_year_2026_ultimate) *
        10
    ) / 10;
  assert.equal(reconciledUlt, res.totals.selected_ultimate);

  // Verify PYD = Current Ultimate - Prior Ultimate for every origin
  for (const row of res.ave_pyd_by_origin) {
    const expectedPyd = Math.round((row.current_ultimate - row.prior_ultimate) * 10) / 10;
    assert.equal(row.pyd_ultimate, expectedPyd);
    const expectedAvePaid =
      Math.round((row.actual_paid_emergence - row.expected_paid_emergence) * 10) / 10;
    assert.equal(row.ave_paid_diff, expectedAvePaid);
  }
});

test('computeCrossSegmentMovers ranks all 36 segments (4 Products x 9 Prior Years) by volatility magnitude', () => {
  const allCalcs = {
    auto_bi: calculateReserves(LOB_SEGMENTS.auto_bi.default_recipe),
    auto_pd: calculateReserves(LOB_SEGMENTS.auto_pd.default_recipe),
    fire_comm: calculateReserves(LOB_SEGMENTS.fire_comm.default_recipe),
    casualty_gl: calculateReserves(LOB_SEGMENTS.casualty_gl.default_recipe),
  };

  const { movers, enterpriseTotals } = computeCrossSegmentMovers(allCalcs);
  assert.equal(movers.length, 36);
  // Movers are sorted descending by |PYD|
  assert.ok(movers[0].abs_pyd >= movers[1].abs_pyd);
  assert.ok(movers[1].abs_pyd >= movers[2].abs_pyd);
  assert.ok(enterpriseTotals.adverse_segments_count > 0);
  assert.ok(enterpriseTotals.favorable_segments_count > 0);
});

test('generateActuarialSuggestions produces 4 simulated suggestions and an idempotent combinedRecipe', () => {
  const recipe = structuredClone(LOB_SEGMENTS.auto_bi.default_recipe);
  const calc = calculateReserves(recipe);
  const { suggestions, combinedRecipe, combinedDeltaIbnr } = generateActuarialSuggestions(
    recipe,
    calc
  );

  assert.equal(suggestions.length, 4);
  // Verify applying a suggestion changes or matches its simulated delta IBNR
  const appliedCalc = calculateReserves(combinedRecipe);
  const expectedDelta =
    Math.round((appliedCalc.totals.selected_ibnr - calc.totals.selected_ibnr) * 10) / 10;
  assert.equal(combinedDeltaIbnr, expectedDelta);

  // Verify once combinedRecipe is applied, all 4 suggestions report is_applied = true
  const afterResult = generateActuarialSuggestions(combinedRecipe, appliedCalc);
  for (const s of afterResult.suggestions) {
    assert.equal(s.is_applied, true, `Expected suggestion ${s.id} to be marked as applied`);
  }
});

test('evaluateOptimalMethodsForLob and applyBestFitToRecipe mechanically select minimum-RMSE methods and allow manual override', () => {
  const recipe = structuredClone(LOB_SEGMENTS.auto_bi.default_recipe);
  const calc = calculateReserves(recipe);

  const fitBefore = evaluateOptimalMethodsForLob(recipe, calc, 'composite');
  assert.equal(fitBefore.origins.length, 10);
  assert.ok(fitBefore.best_single_mean_rmse_pct <= fitBefore.current_mean_rmse_pct);

  // Apply mechanical best single method across all 10 origin years
  const autoSingleRecipe = applyBestFitToRecipe(recipe, calc, 'single_best', 'composite');
  const autoSingleCalc = calculateReserves(autoSingleRecipe);
  const fitAfterSingle = evaluateOptimalMethodsForLob(
    autoSingleRecipe,
    autoSingleCalc,
    'composite'
  );
  assert.equal(fitAfterSingle.auto_matched_count, 10);
  assert.equal(fitAfterSingle.manual_override_count, 0);

  // Apply human override on AY 2026 to Cape Cod
  const overriddenRecipe = overrideOriginMethodSelection(
    autoSingleRecipe,
    autoSingleCalc,
    2026,
    'cape_cod',
    'composite'
  );
  assert.equal(overriddenRecipe.origin_method_weights['2026'].cape_cod, 1);
});

