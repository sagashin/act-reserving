'use client';

import React, { useState, useMemo } from 'react';
import {
  CalculationRecipe,
  CalculationResponse,
  MethodWeight,
  LOB_SEGMENTS,
  MethodKey,
  FitCriterion,
  METHOD_METADATA,
  evaluateOptimalMethodsForLob,
  applyBestFitToRecipe,
  overrideOriginMethodSelection,
  LobMethodFitSummary,
} from '@/lib/actuarial-engine';
import {
  Sliders,
  Sparkles,
  CheckCircle2,
  Scale,
  Percent,
  Layers,
  Cpu,
  UserCheck,
  RotateCcw,
  Award,
  SlidersHorizontal,
  ArrowRight,
} from 'lucide-react';

interface MethodComparisonTabProps {
  recipe: CalculationRecipe;
  calculation: CalculationResponse;
  allRecipes?: Record<string, CalculationRecipe>;
  allCalculations?: Record<string, CalculationResponse>;
  isLocked: boolean;
  onUpdateRecipe: (nextRecipe: CalculationRecipe) => void;
  onBatchUpdateAllRecipes?: (nextRecipes: Record<string, CalculationRecipe>) => void;
  onSelectLob?: (lobId: string) => void;
}

const LOB_LIST = Object.values(LOB_SEGMENTS);

export default function MethodComparisonTab({
  recipe,
  calculation,
  allRecipes,
  allCalculations,
  isLocked,
  onUpdateRecipe,
  onBatchUpdateAllRecipes,
  onSelectLob,
}: MethodComparisonTabProps) {
  const [bulkAprioriInput, setBulkAprioriInput] = useState<string>('65.0');
  const [fitCriterion, setFitCriterion] = useState<FitCriterion>('composite');
  const [inspectedSegment, setInspectedSegment] = useState<{
    lobId: string;
    origin: string;
  }>({
    lobId: recipe.lob_id,
    origin: '2025',
  });
  const [lastAutoActionBanner, setLastAutoActionBanner] = useState<string | null>(null);

  // Evaluate Best-Fit for the active LoB
  const activeLobFit = useMemo(
    () => evaluateOptimalMethodsForLob(recipe, calculation, fitCriterion),
    [recipe, calculation, fitCriterion]
  );

  // Evaluate Best-Fit across all 4 LoBs (40 segments)
  const allLobsFitMap = useMemo(() => {
    const map: Record<string, LobMethodFitSummary> = {};
    if (allRecipes && allCalculations) {
      for (const lob of LOB_LIST) {
        const r = allRecipes[lob.id];
        const c = allCalculations[lob.id];
        if (r && c) {
          map[lob.id] = evaluateOptimalMethodsForLob(r, c, fitCriterion);
        }
      }
    }
    if (!map[recipe.lob_id]) {
      map[recipe.lob_id] = activeLobFit;
    }
    return map;
  }, [allRecipes, allCalculations, recipe.lob_id, activeLobFit, fitCriterion]);

  // Portfolio-wide 40-segment metrics
  const portfolioFitMetrics = useMemo(() => {
    const summaries = Object.values(allLobsFitMap);
    let totalSegments = 0;
    let autoMatched = 0;
    let manualOverrides = 0;
    let sumCurrentRmse = 0;
    let sumBestSingleRmse = 0;
    let sumOptimalBlendRmse = 0;
    let deltaIbnrSingleAll = 0;
    let deltaIbnrBlendAll = 0;

    for (const s of summaries) {
      totalSegments += s.origins.length;
      autoMatched += s.auto_matched_count;
      manualOverrides += s.manual_override_count;
      for (const o of s.origins) {
        sumCurrentRmse += o.current_effective_rmse_pct;
        sumBestSingleRmse += o.min_rmse_pct;
        sumOptimalBlendRmse += o.optimal_blend_rmse_pct;
      }
      deltaIbnrSingleAll += s.delta_ibnr_single;
      deltaIbnrBlendAll += s.delta_ibnr_blend;
    }

    const denom = Math.max(1, totalSegments);
    return {
      totalSegments,
      autoMatched,
      manualOverrides,
      meanCurrentRmse: Number((sumCurrentRmse / denom).toFixed(2)),
      meanBestSingleRmse: Number((sumBestSingleRmse / denom).toFixed(2)),
      meanOptimalBlendRmse: Number((sumOptimalBlendRmse / denom).toFixed(2)),
      deltaIbnrSingleAll,
      deltaIbnrBlendAll,
    };
  }, [allLobsFitMap]);

  // Currently inspected segment evaluation
  const inspectedEval = useMemo(() => {
    const lobFit = allLobsFitMap[inspectedSegment.lobId] || activeLobFit;
    return (
      lobFit.origins.find((o) => o.origin === inspectedSegment.origin) ||
      lobFit.origins[lobFit.origins.length - 1]
    );
  }, [allLobsFitMap, activeLobFit, inspectedSegment]);

  // Mechanical Auto-Selection Across All 40 Segments (All 4 LoBs)
  const handleAutoSelectAllSegments = (mode: 'single_best' | 'optimal_blend') => {
    if (isLocked) return;
    if (onBatchUpdateAllRecipes && allRecipes && allCalculations) {
      const nextAll: Record<string, CalculationRecipe> = {};
      for (const lob of LOB_LIST) {
        const r = allRecipes[lob.id];
        const c = allCalculations[lob.id];
        if (r && c) {
          nextAll[lob.id] = applyBestFitToRecipe(r, c, mode, fitCriterion);
        } else if (r) {
          nextAll[lob.id] = r;
        }
      }
      onBatchUpdateAllRecipes(nextAll);
      setLastAutoActionBanner(
        mode === 'single_best'
          ? `Applied Minimum-RMSE Single Best Method across all 40 segments (4 LoBs × 10 Origin Years). Mean RMSE reduced to ${portfolioFitMetrics.meanBestSingleRmse.toFixed(2)}%.`
          : `Applied Inverse-RMSE Credibility Blend (1/RMSE²) across all 40 segments (4 LoBs × 10 Origin Years). Mean RMSE reduced to ${portfolioFitMetrics.meanOptimalBlendRmse.toFixed(2)}%.`
      );
    } else {
      const nextRec = applyBestFitToRecipe(recipe, calculation, mode, fitCriterion);
      onUpdateRecipe(nextRec);
      setLastAutoActionBanner(
        mode === 'single_best'
          ? `Applied Minimum-RMSE Single Best Method across all 10 origin years of ${activeLobFit.lob_short_name}.`
          : `Applied Inverse-RMSE Credibility Blend across all 10 origin years of ${activeLobFit.lob_short_name}.`
      );
    }
  };

  // Mechanical Auto-Selection for Active LoB Only (10 Segments)
  const handleAutoSelectActiveLob = (mode: 'single_best' | 'optimal_blend') => {
    if (isLocked) return;
    const nextRec = applyBestFitToRecipe(recipe, calculation, mode, fitCriterion);
    onUpdateRecipe(nextRec);
    setLastAutoActionBanner(
      mode === 'single_best'
        ? `Auto-selected Minimum-RMSE Single Method for ${activeLobFit.lob_short_name} (10 Origin Years).`
        : `Auto-selected Optimal Inverse-RMSE Blend for ${activeLobFit.lob_short_name} (10 Origin Years).`
    );
  };

  // Human Override for ANY Segment (LoB × Origin Year) in the 40-Segment Matrix
  const handleMatrixCellOverride = (
    lobId: string,
    origin: string,
    selection: MethodKey | 'optimal_blend'
  ) => {
    if (isLocked) return;
    setInspectedSegment({ lobId, origin });

    if (lobId === recipe.lob_id) {
      const nextRec = overrideOriginMethodSelection(
        recipe,
        calculation,
        origin,
        selection,
        fitCriterion
      );
      onUpdateRecipe(nextRec);
    } else if (
      onBatchUpdateAllRecipes &&
      allRecipes &&
      allCalculations &&
      allRecipes[lobId] &&
      allCalculations[lobId]
    ) {
      const updatedLobRecipe = overrideOriginMethodSelection(
        allRecipes[lobId],
        allCalculations[lobId],
        origin,
        selection,
        fitCriterion
      );
      onBatchUpdateAllRecipes({
        ...allRecipes,
        [lobId]: updatedLobRecipe,
      });
    }
  };

  const handleAprioriChange = (origin: string, valStr: string) => {
    if (isLocked) return;
    const parsed = parseFloat(valStr);
    if (isNaN(parsed) || parsed < 0 || parsed > 300) return;
    const next = structuredClone(recipe);
    next.apriori_loss_ratio[origin] = Number((parsed / 100).toFixed(4));
    onUpdateRecipe(next);
  };

  const applyBulkApriori = () => {
    if (isLocked) return;
    const parsed = parseFloat(bulkAprioriInput);
    if (isNaN(parsed) || parsed <= 0 || parsed > 300) return;
    const next = structuredClone(recipe);
    for (const orig of calculation.origins) {
      next.apriori_loss_ratio[orig] = Number((parsed / 100).toFixed(4));
    }
    onUpdateRecipe(next);
  };

  const handleWeightChange = (
    origin: string,
    methodKey: keyof MethodWeight,
    pctStr: string
  ) => {
    if (isLocked) return;
    const parsed = parseFloat(pctStr);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) return;

    const next = structuredClone(recipe);
    const current = next.origin_method_weights[origin] || {
      paid_cl: 1,
      incurred_cl: 0,
      paid_bf: 0,
      incurred_bf: 0,
      cape_cod: 0,
    };
    next.origin_method_weights[origin] = {
      ...current,
      [methodKey]: Number((parsed / 100).toFixed(4)),
    };
    onUpdateRecipe(next);
  };

  const normalizeRowWeights = (origin: string) => {
    if (isLocked) return;
    const next = structuredClone(recipe);
    const w = next.origin_method_weights[origin];
    if (!w) return;
    const sum = w.paid_cl + w.incurred_cl + w.paid_bf + w.incurred_bf + w.cape_cod;
    if (sum <= 0) {
      next.origin_method_weights[origin] = {
        paid_cl: 1,
        incurred_cl: 0,
        paid_bf: 0,
        incurred_bf: 0,
        cape_cod: 0,
      };
    } else {
      next.origin_method_weights[origin] = {
        paid_cl: Number((w.paid_cl / sum).toFixed(4)),
        incurred_cl: Number((w.incurred_cl / sum).toFixed(4)),
        paid_bf: Number((w.paid_bf / sum).toFixed(4)),
        incurred_bf: Number((w.incurred_bf / sum).toFixed(4)),
        cape_cod: Number((w.cape_cod / sum).toFixed(4)),
      };
    }
    onUpdateRecipe(next);
  };

  const applyPresetRegime = (
    regime: 'resq_standard' | 'pure_paid_cl' | 'pure_inc_cl' | 'conservative_bf' | 'cape_cod_tail'
  ) => {
    if (isLocked) return;
    const next = structuredClone(recipe);
    calculation.origins.forEach((orig, idx) => {
      if (regime === 'pure_paid_cl') {
        next.origin_method_weights[orig] = {
          paid_cl: 1,
          incurred_cl: 0,
          paid_bf: 0,
          incurred_bf: 0,
          cape_cod: 0,
        };
      } else if (regime === 'pure_inc_cl') {
        next.origin_method_weights[orig] = {
          paid_cl: 0,
          incurred_cl: 1,
          paid_bf: 0,
          incurred_bf: 0,
          cape_cod: 0,
        };
      } else if (regime === 'resq_standard') {
        if (idx <= 5) {
          next.origin_method_weights[orig] = {
            paid_cl: 0.5,
            incurred_cl: 0.5,
            paid_bf: 0,
            incurred_bf: 0,
            cape_cod: 0,
          };
        } else if (idx <= 7) {
          next.origin_method_weights[orig] = {
            paid_cl: 0.2,
            incurred_cl: 0.3,
            paid_bf: 0.25,
            incurred_bf: 0.25,
            cape_cod: 0,
          };
        } else {
          next.origin_method_weights[orig] = {
            paid_cl: 0,
            incurred_cl: 0,
            paid_bf: 0.4,
            incurred_bf: 0.4,
            cape_cod: 0.2,
          };
        }
      } else if (regime === 'conservative_bf') {
        if (idx <= 4) {
          next.origin_method_weights[orig] = {
            paid_cl: 0.3,
            incurred_cl: 0.7,
            paid_bf: 0,
            incurred_bf: 0,
            cape_cod: 0,
          };
        } else {
          next.origin_method_weights[orig] = {
            paid_cl: 0,
            incurred_cl: 0.2,
            paid_bf: 0.3,
            incurred_bf: 0.5,
            cape_cod: 0,
          };
        }
      } else if (regime === 'cape_cod_tail') {
        if (idx <= 5) {
          next.origin_method_weights[orig] = {
            paid_cl: 0.5,
            incurred_cl: 0.5,
            paid_bf: 0,
            incurred_bf: 0,
            cape_cod: 0,
          };
        } else {
          next.origin_method_weights[orig] = {
            paid_cl: 0,
            incurred_cl: 0,
            paid_bf: 0.2,
            incurred_bf: 0.2,
            cape_cod: 0.6,
          };
        }
      }
    });
    onUpdateRecipe(next);
  };

  return (
    <div className="space-y-6">
      {/* =====================================================================
          SECTION 01: AUTOMATED BEST-FIT METHOD SELECTOR & ALL-SEGMENT OVERRIDE MATRIX
         ===================================================================== */}
      <div
        data-testid="best-fit-selector-section"
        className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl"
      >
        {/* Top Header Bar */}
        <div className="px-4 py-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mt-0.5">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-semibold">
                  SECTION 01 · AUTO BEST-FIT &amp; HUMAN OVERRIDE
                </span>
                <h2 className="text-sm font-bold text-slate-100">
                  Automated Minimum-Error Method Selection &amp; 40-Segment Override Matrix
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluates goodness-of-fit (RMSE % of Ultimate) across all 5 reserving methods for every{' '}
                <span className="text-slate-200 font-medium">
                  Line of Business × Accident Year (40 segments)
                </span>
                . Mechanically select optimal methods in one click, then freely override any segment by hand.
              </p>
            </div>
          </div>

          {/* Criterion Selector */}
          <div className="flex items-center gap-2 bg-slate-950/90 border border-slate-800 rounded-lg px-3 py-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <label
              htmlFor="fit-criterion-select"
              className="text-[11px] font-medium text-slate-300 whitespace-nowrap"
            >
              Optimization Criterion:
            </label>
            <select
              id="fit-criterion-select"
              data-testid="fit-criterion-select"
              value={fitCriterion}
              onChange={(e) => setFitCriterion(e.target.value as FitCriterion)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-sky-300 focus:outline-none focus:border-sky-500"
            >
              <option value="composite">
                Composite Best-Fit (Backtest AvE + Mack MSEP + Maturity)
              </option>
              <option value="backtest_ave">
                Diagonal Backtest Error (CY 2026 AvE Holdout Residual)
              </option>
              <option value="minimum_msep">
                Minimum Stochastic MSEP (Parameter + Process Variance CV)
              </option>
            </select>
          </div>
        </div>

        {/* KPI Summary Strip + Mechanical Auto-Selection Action Buttons */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800/80 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* 4 KPI Cards */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono tabular-nums">
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="text-[10px] font-sans text-slate-400">
                Current Effective RMSE
              </div>
              <div
                data-testid="metric-current-rmse"
                className="text-sm font-bold text-slate-100 mt-0.5"
              >
                {portfolioFitMetrics.meanCurrentRmse.toFixed(2)}%
              </div>
              <div className="text-[10px] text-slate-400">
                Active LoB: {activeLobFit.current_mean_rmse_pct.toFixed(2)}%
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-emerald-950/25 border border-emerald-500/30">
              <div className="text-[10px] font-sans text-emerald-300">
                Min-Error Best Fit RMSE
              </div>
              <div
                data-testid="metric-best-rmse"
                className="text-sm font-bold text-emerald-300 mt-0.5"
              >
                {portfolioFitMetrics.meanBestSingleRmse.toFixed(2)}%
              </div>
              <div className="text-[10px] text-emerald-400/80">
                Opt Blend: {portfolioFitMetrics.meanOptimalBlendRmse.toFixed(2)}%
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-sky-950/25 border border-sky-500/30">
              <div className="text-[10px] font-sans text-sky-300">
                Segment Fit Governance
              </div>
              <div
                data-testid="metric-governance-status"
                className="text-sm font-bold text-sky-300 mt-0.5"
              >
                {portfolioFitMetrics.autoMatched} / {portfolioFitMetrics.totalSegments}{' '}
                <span className="text-[11px] font-normal">Auto-Fit</span>
              </div>
              <div className="text-[10px] text-amber-300/90">
                {portfolioFitMetrics.manualOverrides} Manual Override(s)
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-indigo-950/25 border border-indigo-500/30">
              <div className="text-[10px] font-sans text-indigo-300">
                Auto-Fit IBNR Impact
              </div>
              <div className="text-sm font-bold text-indigo-200 mt-0.5">
                {portfolioFitMetrics.deltaIbnrSingleAll >= 0 ? '+' : ''}
                {portfolioFitMetrics.deltaIbnrSingleAll.toLocaleString('en-US')}
              </div>
              <div className="text-[10px] text-indigo-300/80">
                Blend:{' '}
                {portfolioFitMetrics.deltaIbnrBlendAll >= 0 ? '+' : ''}
                {portfolioFitMetrics.deltaIbnrBlendAll.toLocaleString('en-US')} M
              </div>
            </div>
          </div>

          {/* Mechanical Selection Buttons */}
          <div className="lg:col-span-5 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              data-testid="btn-auto-select-all-single"
              disabled={isLocked}
              onClick={() => handleAutoSelectAllSegments('single_best')}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Auto-Select Best Method (All 40 Segments)
            </button>

            <button
              type="button"
              data-testid="btn-auto-select-all-blend"
              disabled={isLocked}
              onClick={() => handleAutoSelectAllSegments('optimal_blend')}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Scale className="w-3.5 h-3.5" />
              Auto-Select Inverse-RMSE Blend (All 40)
            </button>

            <button
              type="button"
              data-testid="btn-auto-select-lob-single"
              disabled={isLocked}
              onClick={() => handleAutoSelectActiveLob('single_best')}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer disabled:opacity-40"
            >
              Auto-Select Active LoB ({activeLobFit.lob_short_name})
            </button>
          </div>
        </div>

        {/* Optional Confirmation Banner when Mechanical Selection is Triggered */}
        {lastAutoActionBanner && (
          <div
            data-testid="auto-action-banner"
            className="px-4 py-2 bg-emerald-950/50 border-b border-emerald-500/30 flex items-center justify-between gap-2 text-xs text-emerald-200"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{lastAutoActionBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setLastAutoActionBanner(null)}
              className="text-[11px] text-emerald-300 hover:text-white underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 40-Segment Cross-LoB Method Selection & Human Override Matrix */}
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">
                All-Segment Best-Fit &amp; Human Override Matrix (4 Lines of Business × 10 Accident Years = 40 Segments)
              </span>
              <span className="text-[11px] text-slate-400">
                — Click any cell to inspect error diagnostics, or use the dropdown inside any cell to manually override its method.
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                AUTO-FIT (Matches Minimum-Error Recommendation)
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                MANUAL OVERRIDE (Actuary Customized)
              </span>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table
              data-testid="all-segments-method-matrix"
              className="w-full table-fixed border-collapse text-left font-mono text-[10px] tabular-nums"
            >
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th className="py-2 px-2.5 font-sans font-semibold text-slate-300 w-[136px] bg-slate-950 border-r border-slate-800">
                    Line of Business
                  </th>
                  {calculation.origins.map((origin) => (
                    <th
                      key={origin}
                      className="py-2 px-1 text-center font-semibold text-slate-300 border-r border-slate-800/60"
                    >
                      AY {origin}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {LOB_LIST.map((lob) => {
                  const lobSummary = allLobsFitMap[lob.id];
                  if (!lobSummary) return null;
                  const isCurrentLob = lob.id === recipe.lob_id;

                  return (
                    <tr
                      key={lob.id}
                      className={
                        isCurrentLob ? 'bg-sky-950/15' : 'bg-slate-900/40 hover:bg-slate-900/70'
                      }
                    >
                      {/* Row Header: LoB Name & Mean RMSE */}
                      <td className="py-2 px-2.5 font-sans bg-slate-950/95 border-r border-slate-800">
                        <div className="flex items-center justify-between gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectLob && onSelectLob(lob.id)}
                            className={`text-left text-[11px] font-semibold leading-tight transition-colors cursor-pointer ${
                              isCurrentLob
                                ? 'text-sky-300 underline decoration-sky-500/60'
                                : 'text-slate-200 hover:text-sky-300'
                            }`}
                          >
                            {lob.short_name}
                          </button>
                        </div>
                        <div className="text-[9px] font-mono text-slate-400 mt-1 flex items-center justify-between">
                          <span>Err {lobSummary.current_mean_rmse_pct.toFixed(1)}%</span>
                          <span className="text-emerald-400">
                            Min {lobSummary.best_single_mean_rmse_pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      {/* 10 Origin Year Segment Cells */}
                      {lobSummary.origins.map((origEval) => {
                        const isInspected =
                          inspectedSegment.lobId === lob.id &&
                          inspectedSegment.origin === origEval.origin;
                        const isAuto = origEval.selection_status !== 'MANUAL_OVERRIDE';
                        const bestMeta = METHOD_METADATA[origEval.best_method];

                        return (
                          <td
                            key={origEval.origin}
                            onClick={() =>
                              setInspectedSegment({
                                lobId: lob.id,
                                origin: origEval.origin,
                              })
                            }
                            className={`p-1 align-top border-r border-slate-800/60 transition-all cursor-pointer ${
                              isInspected
                                ? 'ring-2 ring-inset ring-sky-400 bg-sky-950/30'
                                : isAuto
                                ? 'bg-emerald-950/10 hover:bg-emerald-950/20'
                                : 'bg-amber-950/15 hover:bg-amber-950/25'
                            }`}
                          >
                            {/* Top Row: Status Badge + Optimal Method Recommendation */}
                            <div className="flex items-center justify-between gap-0.5 mb-1">
                              <span
                                className={`inline-flex items-center px-1 py-0.2 rounded text-[8px] font-bold tracking-tight ${
                                  isAuto
                                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                {isAuto ? 'AUTO' : 'MAN'}
                              </span>
                              <span
                                className="text-[9px] text-slate-400 truncate"
                                title={`Minimum RMSE method: ${bestMeta.label} (${origEval.min_rmse_pct.toFixed(1)}%)`}
                              >
                                Fit:{' '}
                                <strong className={bestMeta.textClass}>
                                  {bestMeta.shortLabel}
                                </strong>
                              </span>
                            </div>

                            {/* Interactive Dropdown for Direct Human Override */}
                            <select
                              aria-label={`${lob.short_name} AY ${origEval.origin} Method Selection`}
                              data-testid={`matrix-select-${lob.id}-${origEval.origin}`}
                              disabled={isLocked}
                              value={origEval.current_active_key}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'custom_blend') return;
                                handleMatrixCellOverride(
                                  lob.id,
                                  origEval.origin,
                                  val as MethodKey | 'optimal_blend'
                                );
                              }}
                              className={`w-full rounded px-1 py-0.5 text-[9.5px] font-mono font-semibold border focus:outline-none ${
                                isAuto
                                  ? 'bg-slate-950/90 border-emerald-500/40 text-emerald-200'
                                  : 'bg-slate-950/90 border-amber-500/50 text-amber-200'
                              }`}
                            >
                              <option value="paid_cl">
                                P-CL ({origEval.method_rmse_pct.paid_cl.toFixed(1)}%)
                              </option>
                              <option value="incurred_cl">
                                I-CL ({origEval.method_rmse_pct.incurred_cl.toFixed(1)}%)
                              </option>
                              <option value="paid_bf">
                                P-BF ({origEval.method_rmse_pct.paid_bf.toFixed(1)}%)
                              </option>
                              <option value="incurred_bf">
                                I-BF ({origEval.method_rmse_pct.incurred_bf.toFixed(1)}%)
                              </option>
                              <option value="cape_cod">
                                CC ({origEval.method_rmse_pct.cape_cod.toFixed(1)}%)
                              </option>
                              <option value="optimal_blend">
                                Blend ({origEval.optimal_blend_rmse_pct.toFixed(1)}%)
                              </option>
                              {origEval.current_active_key === 'custom_blend' && (
                                <option value="custom_blend">
                                  Custom ({origEval.current_effective_rmse_pct.toFixed(1)}%)
                                </option>
                              )}
                            </select>

                            {/* Bottom Sub-Label: Current Effective RMSE vs Min */}
                            <div className="mt-1 flex items-center justify-between text-[8.5px] text-slate-400">
                              <span>Min {origEval.min_rmse_pct.toFixed(1)}%</span>
                              <span
                                className={
                                  origEval.current_effective_rmse_pct <=
                                  origEval.min_rmse_pct + 0.3
                                    ? 'text-emerald-400 font-semibold'
                                    : 'text-amber-300 font-semibold'
                                }
                              >
                                Err {origEval.current_effective_rmse_pct.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selected Segment Goodness-of-Fit Drill-Down Inspector */}
          {inspectedEval && (
            <div
              data-testid="segment-fit-inspector"
              className="p-3.5 rounded-lg bg-slate-950/90 border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center"
            >
              <div className="lg:col-span-5 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-sky-950/90 border border-sky-500/40 text-sky-300 font-semibold">
                    SEGMENT FIT INSPECTOR
                  </span>
                  <span className="text-xs font-bold text-white">
                    {LOB_SEGMENTS[inspectedEval.lob_id]?.name} · AY {inspectedEval.origin}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      inspectedEval.selection_status !== 'MANUAL_OVERRIDE'
                        ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                        : 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    {inspectedEval.selection_status === 'AUTO_SINGLE'
                      ? 'AUTO BEST SINGLE'
                      : inspectedEval.selection_status === 'AUTO_BLEND'
                      ? 'AUTO OPTIMAL BLEND'
                      : 'MANUAL OVERRIDE'}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong className="text-emerald-300">
                    Optimal Winner: {inspectedEval.best_method_label} (RMSE{' '}
                    {inspectedEval.min_rmse_pct.toFixed(2)}%)
                  </strong>{' '}
                  — {inspectedEval.fit_rationale}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() =>
                      handleMatrixCellOverride(
                        inspectedEval.lob_id,
                        inspectedEval.origin,
                        inspectedEval.best_method
                      )
                    }
                    className="px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Segment to Auto Best ({inspectedEval.best_method_label})
                  </button>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() =>
                      handleMatrixCellOverride(
                        inspectedEval.lob_id,
                        inspectedEval.origin,
                        'optimal_blend'
                      )
                    }
                    className="px-2.5 py-1 rounded text-[11px] font-semibold bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Scale className="w-3 h-3" />
                    Apply Segment Optimal Blend ({inspectedEval.optimal_blend_rmse_pct.toFixed(2)}%)
                  </button>
                  {inspectedEval.lob_id !== recipe.lob_id && onSelectLob && (
                    <button
                      type="button"
                      onClick={() => onSelectLob(inspectedEval.lob_id)}
                      className="px-2.5 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      Switch Workbench to LoB
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* 5-Method Error Comparison Cards for the Inspected Segment */}
              <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-[11px] tabular-nums">
                {(
                  [
                    'paid_cl',
                    'incurred_cl',
                    'paid_bf',
                    'incurred_bf',
                    'cape_cod',
                  ] as MethodKey[]
                ).map((mk) => {
                  const meta = METHOD_METADATA[mk];
                  const rmse = inspectedEval.method_rmse_pct[mk];
                  const ult = inspectedEval.method_ultimates[mk];
                  const isWinner = inspectedEval.best_method === mk;
                  const currentWeightPct = Math.round(
                    (inspectedEval.current_weights[mk] || 0) * 100
                  );

                  return (
                    <button
                      key={mk}
                      type="button"
                      disabled={isLocked}
                      onClick={() =>
                        handleMatrixCellOverride(
                          inspectedEval.lob_id,
                          inspectedEval.origin,
                          mk
                        )
                      }
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                        isWinner
                          ? 'bg-emerald-950/35 border-emerald-500/50 ring-1 ring-emerald-500/30'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`font-bold ${meta.textClass}`}>
                          {meta.label}
                        </span>
                        {isWinner && (
                          <Award className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-100 mt-1">
                        RMSE {rmse.toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Ult: {ult.toLocaleString('en-US')}
                      </div>
                      <div className="mt-1.5 pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Weight:</span>
                        <span
                          className={
                            currentWeightPct > 0
                              ? 'text-sky-300 font-bold'
                              : 'text-slate-400'
                          }
                        >
                          {currentWeightPct}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          SECTION 02: ACTIVE LOB PRESET REGIMES & A-PRIORI LR CALIBRATION BAR
         ===================================================================== */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mr-1">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span>Manual Regime Presets ({activeLobFit.lob_short_name}):</span>
          </div>

          <button
            type="button"
            disabled={isLocked}
            onClick={() => applyPresetRegime('resq_standard')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600/20 text-sky-300 border border-sky-500/30 hover:bg-sky-600/30 transition-colors cursor-pointer disabled:opacity-40"
          >
            ResQ Standard Blend (CL Mature / BF+CC Green)
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => applyPresetRegime('pure_paid_cl')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-40"
          >
            100% Paid CL
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => applyPresetRegime('pure_inc_cl')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-40"
          >
            100% Incurred CL
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => applyPresetRegime('conservative_bf')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-40"
          >
            Conservative Incurred BF
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={() => applyPresetRegime('cape_cod_tail')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-40"
          >
            Cape Cod Green Years
          </button>
        </div>

        {/* Bulk Apriori Loss Ratio Setter & Cape Cod ELR Indicator */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-lg">
            <Percent className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-slate-400">Bulk A-Priori LR:</span>
            <input
              type="number"
              step="0.5"
              disabled={isLocked}
              value={bulkAprioriInput}
              onChange={(e) => setBulkAprioriInput(e.target.value)}
              className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs font-mono text-right text-amber-300 focus:outline-none focus:border-amber-500"
            />
            <span className="text-xs text-slate-400">%</span>
            <button
              type="button"
              disabled={isLocked}
              onClick={applyBulkApriori}
              className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
            >
              Apply All
            </button>
          </div>

          <div className="bg-teal-950/40 border border-teal-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Scale className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-xs text-teal-300/90">Cape Cod Implied ELR:</span>
            <span className="text-xs font-mono font-bold text-teal-300">
              {(calculation.cape_cod_elr * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SECTION 03: GRANULAR ORIGIN-YEAR METHOD FIT & CUSTOM BLENDING TABLE
         ===================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Section 02 · Per-Origin Method Ultimates, Goodness-of-Fit (RMSE %) &amp; Custom Weight Blending ({activeLobFit.lob_name})
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>
              Green badge <strong className="text-emerald-300">[MIN]</strong> marks the lowest-error method for each accident year
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right font-mono text-xs tabular-nums">
            <thead>
              <tr className="bg-slate-950/90 text-slate-400 border-b border-slate-800 text-[11px]">
                <th className="py-2.5 px-2.5 text-left font-sans font-semibold sticky left-0 bg-slate-950 z-10 border-r border-slate-800">
                  Origin
                </th>
                <th className="py-2.5 px-2 bg-slate-950">Earned Prem</th>
                <th className="py-2.5 px-2 bg-slate-950">Latest Incurred</th>
                <th className="py-2.5 px-2 bg-amber-950/20 text-amber-300 border-x border-slate-800">
                  A-Priori LR
                </th>
                <th className="py-2.5 px-2 text-sky-300">
                  Paid CL Ult <span className="block text-[9px] text-slate-400">(RMSE %)</span>
                </th>
                <th className="py-2.5 px-2 text-indigo-300">
                  Inc CL Ult <span className="block text-[9px] text-slate-400">(RMSE %)</span>
                </th>
                <th className="py-2.5 px-2 text-violet-300">
                  Paid BF Ult <span className="block text-[9px] text-slate-400">(RMSE %)</span>
                </th>
                <th className="py-2.5 px-2 text-amber-300">
                  Inc BF Ult <span className="block text-[9px] text-slate-400">(RMSE %)</span>
                </th>
                <th className="py-2.5 px-2 text-teal-300 border-r border-slate-800">
                  Cape Cod Ult <span className="block text-[9px] text-slate-400">(RMSE %)</span>
                </th>
                <th className="py-2.5 px-2 text-center bg-slate-950 border-r border-slate-800">
                  Best-Fit &amp; Mode
                </th>
                <th className="py-2.5 px-1.5 text-center bg-sky-950/20 text-sky-300">
                  P-CL %
                </th>
                <th className="py-2.5 px-1.5 text-center bg-indigo-950/20 text-indigo-300">
                  I-CL %
                </th>
                <th className="py-2.5 px-1.5 text-center bg-violet-950/20 text-violet-300">
                  P-BF %
                </th>
                <th className="py-2.5 px-1.5 text-center bg-amber-950/20 text-amber-300">
                  I-BF %
                </th>
                <th className="py-2.5 px-1.5 text-center bg-teal-950/20 text-teal-300 border-r border-slate-800">
                  CC %
                </th>
                <th className="py-2.5 px-2.5 bg-emerald-950/30 text-emerald-300 font-bold">
                  Selected Ult
                </th>
                <th className="py-2.5 px-2.5 bg-emerald-950/30 text-emerald-400 font-bold">
                  Selected IBNR
                </th>
                <th className="py-2.5 px-2.5 text-slate-300">Ult LR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {calculation.origins.map((origin) => {
                const ep = calculation.earned_premium[origin] || 0;
                const latestInc = calculation.latest_incurred[origin] || 0;
                const aprioriLr = recipe.apriori_loss_ratio[origin] ?? 0.65;
                const paidClUlt = calculation.ultimates_by_method.paid_cl?.[origin] || 0;
                const incClUlt = calculation.ultimates_by_method.incurred_cl?.[origin] || 0;
                const paidBfUlt = calculation.ultimates_by_method.paid_bf?.[origin] || 0;
                const incBfUlt = calculation.ultimates_by_method.incurred_bf?.[origin] || 0;
                const capeCodUlt = calculation.ultimates_by_method.cape_cod?.[origin] || 0;
                const selUlt = calculation.selected_ultimate[origin] || 0;
                const selIbnr = calculation.selected_ibnr[origin] || 0;
                const ultLr = calculation.ultimate_loss_ratio[origin] || 0;

                const w = recipe.origin_method_weights[origin] || {
                  paid_cl: 1,
                  incurred_cl: 0,
                  paid_bf: 0,
                  incurred_bf: 0,
                  cape_cod: 0,
                };
                const weightSum =
                  w.paid_cl + w.incurred_cl + w.paid_bf + w.incurred_bf + w.cape_cod;
                const isWeightValid = Math.abs(weightSum - 1.0) < 0.01;
                const origEval = activeLobFit.origins.find((o) => o.origin === origin);
                const bestKey = origEval?.best_method || 'paid_cl';

                return (
                  <tr
                    key={origin}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-2 px-2.5 text-left font-bold text-slate-200 sticky left-0 bg-slate-900 z-10 border-r border-slate-800">
                      {origin}
                    </td>
                    <td className="py-2 px-2 text-slate-400">
                      {ep.toLocaleString('en-US')}
                    </td>
                    <td className="py-2 px-2 text-slate-300">
                      {latestInc.toLocaleString('en-US')}
                    </td>

                    {/* Editable Apriori LR */}
                    <td className="py-1.5 px-2 bg-amber-950/10 border-x border-slate-800">
                      <div className="flex items-center justify-end gap-0.5">
                        <input
                          type="number"
                          step="0.5"
                          disabled={isLocked}
                          value={Number((aprioriLr * 100).toFixed(1))}
                          onChange={(e) =>
                            handleAprioriChange(origin, e.target.value)
                          }
                          className="w-14 bg-slate-950 border border-amber-500/30 rounded px-1.5 py-0.5 text-right text-amber-300 focus:outline-none focus:border-amber-400"
                        />
                        <span className="text-[10px] text-amber-400/70">%</span>
                      </div>
                    </td>

                    {/* 5 Method Ultimates + RMSE % Sub-labels */}
                    <td
                      className={`py-1.5 px-2 ${
                        bestKey === 'paid_cl'
                          ? 'bg-emerald-950/25 text-emerald-200 font-bold'
                          : 'text-sky-300/90'
                      }`}
                    >
                      <div>{paidClUlt.toLocaleString('en-US')}</div>
                      {origEval && (
                        <div className="text-[9px] text-slate-400">
                          RMSE {origEval.method_rmse_pct.paid_cl.toFixed(1)}%
                          {bestKey === 'paid_cl' && (
                            <span className="ml-1 text-emerald-400 font-semibold">
                              [MIN]
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td
                      className={`py-1.5 px-2 ${
                        bestKey === 'incurred_cl'
                          ? 'bg-emerald-950/25 text-emerald-200 font-bold'
                          : 'text-indigo-300/90'
                      }`}
                    >
                      <div>{incClUlt.toLocaleString('en-US')}</div>
                      {origEval && (
                        <div className="text-[9px] text-slate-400">
                          RMSE {origEval.method_rmse_pct.incurred_cl.toFixed(1)}%
                          {bestKey === 'incurred_cl' && (
                            <span className="ml-1 text-emerald-400 font-semibold">
                              [MIN]
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td
                      className={`py-1.5 px-2 ${
                        bestKey === 'paid_bf'
                          ? 'bg-emerald-950/25 text-emerald-200 font-bold'
                          : 'text-violet-300/90'
                      }`}
                    >
                      <div>{paidBfUlt.toLocaleString('en-US')}</div>
                      {origEval && (
                        <div className="text-[9px] text-slate-400">
                          RMSE {origEval.method_rmse_pct.paid_bf.toFixed(1)}%
                          {bestKey === 'paid_bf' && (
                            <span className="ml-1 text-emerald-400 font-semibold">
                              [MIN]
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td
                      className={`py-1.5 px-2 ${
                        bestKey === 'incurred_bf'
                          ? 'bg-emerald-950/25 text-emerald-200 font-bold'
                          : 'text-amber-300/90'
                      }`}
                    >
                      <div>{incBfUlt.toLocaleString('en-US')}</div>
                      {origEval && (
                        <div className="text-[9px] text-slate-400">
                          RMSE {origEval.method_rmse_pct.incurred_bf.toFixed(1)}%
                          {bestKey === 'incurred_bf' && (
                            <span className="ml-1 text-emerald-400 font-semibold">
                              [MIN]
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td
                      className={`py-1.5 px-2 border-r border-slate-800 ${
                        bestKey === 'cape_cod'
                          ? 'bg-emerald-950/25 text-emerald-200 font-bold'
                          : 'text-teal-300/90'
                      }`}
                    >
                      <div>{capeCodUlt.toLocaleString('en-US')}</div>
                      {origEval && (
                        <div className="text-[9px] text-slate-400">
                          RMSE {origEval.method_rmse_pct.cape_cod.toFixed(1)}%
                          {bestKey === 'cape_cod' && (
                            <span className="ml-1 text-emerald-400 font-semibold">
                              [MIN]
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Best-Fit & Status Quick Action Cell */}
                    <td className="py-1.5 px-2 text-center border-r border-slate-800">
                      {origEval && (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                                origEval.selection_status !== 'MANUAL_OVERRIDE'
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                              }`}
                            >
                              {origEval.selection_status !== 'MANUAL_OVERRIDE' ? (
                                <span className="inline-flex items-center gap-0.5">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  AUTO
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5">
                                  <UserCheck className="w-2.5 h-2.5" />
                                  MANUAL
                                </span>
                              )}
                            </span>
                            {origEval.selection_status === 'MANUAL_OVERRIDE' && (
                              <button
                                type="button"
                                disabled={isLocked}
                                onClick={() =>
                                  handleMatrixCellOverride(
                                    recipe.lob_id,
                                    origin,
                                    origEval.best_method
                                  )
                                }
                                title={`Click to apply Best-Fit (${origEval.best_method_label})`}
                                className="px-1.5 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/30 text-[9px] font-semibold cursor-pointer"
                              >
                                Use {METHOD_METADATA[origEval.best_method].shortLabel}
                              </button>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-400">
                            Min: {origEval.best_method_label} ({origEval.min_rmse_pct.toFixed(1)}%)
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Editable Method Weights (%) for Free Human Customization */}
                    {(
                      [
                        { key: 'paid_cl', color: 'border-sky-500/30 text-sky-200' },
                        { key: 'incurred_cl', color: 'border-indigo-500/30 text-indigo-200' },
                        { key: 'paid_bf', color: 'border-violet-500/30 text-violet-200' },
                        { key: 'incurred_bf', color: 'border-amber-500/30 text-amber-200' },
                        { key: 'cape_cod', color: 'border-teal-500/30 text-teal-200' },
                      ] as const
                    ).map((m) => (
                      <td
                        key={m.key}
                        className={`py-1.5 px-1 text-center ${
                          m.key === 'cape_cod' ? 'border-r border-slate-800' : ''
                        }`}
                      >
                        <input
                          type="number"
                          step="5"
                          min="0"
                          max="100"
                          disabled={isLocked}
                          value={Math.round(w[m.key] * 100)}
                          onChange={(e) =>
                            handleWeightChange(origin, m.key, e.target.value)
                          }
                          onBlur={() => normalizeRowWeights(origin)}
                          className={`w-12 bg-slate-950 border ${m.color} rounded px-1 py-0.5 text-center font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500`}
                        />
                      </td>
                    ))}

                    {/* Selected Ultimate & IBNR */}
                    <td className="py-2 px-2.5 bg-emerald-950/15 font-bold text-emerald-300">
                      <div className="flex items-center justify-end gap-1">
                        {!isWeightValid && (
                          <button
                            type="button"
                            onClick={() => normalizeRowWeights(origin)}
                            title="Normalize weights to 100%"
                            className="text-[10px] bg-rose-500/20 text-rose-300 px-1 rounded border border-rose-500/40"
                          >
                            Norm
                          </button>
                        )}
                        <span>{selUlt.toLocaleString('en-US')}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2.5 bg-emerald-950/20 font-bold text-emerald-400">
                      {selIbnr.toLocaleString('en-US')}
                    </td>
                    <td className="py-2 px-2.5 text-slate-200 font-semibold">
                      {(ultLr * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Totals Footer */}
            <tfoot>
              <tr className="bg-slate-950 font-bold text-slate-100 border-t-2 border-slate-700">
                <td className="py-3 px-2.5 text-left sticky left-0 bg-slate-950 z-10 border-r border-slate-800">
                  Total
                </td>
                <td className="py-3 px-2 text-slate-300">
                  {calculation.totals.earned_premium.toLocaleString('en-US')}
                </td>
                <td className="py-3 px-2 text-slate-200">
                  {calculation.totals.latest_incurred.toLocaleString('en-US')}
                </td>
                <td className="py-3 px-2 border-x border-slate-800 text-amber-300">
                  —
                </td>
                <td className="py-3 px-2 text-sky-300">
                  {(calculation.totals.ultimates_by_method.paid_cl || 0).toLocaleString(
                    'en-US'
                  )}
                </td>
                <td className="py-3 px-2 text-indigo-300">
                  {(calculation.totals.ultimates_by_method.incurred_cl || 0).toLocaleString(
                    'en-US'
                  )}
                </td>
                <td className="py-3 px-2 text-violet-300">
                  {(calculation.totals.ultimates_by_method.paid_bf || 0).toLocaleString(
                    'en-US'
                  )}
                </td>
                <td className="py-3 px-2 text-amber-300">
                  {(calculation.totals.ultimates_by_method.incurred_bf || 0).toLocaleString(
                    'en-US'
                  )}
                </td>
                <td className="py-3 px-2 text-teal-300 border-r border-slate-800">
                  {(calculation.totals.ultimates_by_method.cape_cod || 0).toLocaleString(
                    'en-US'
                  )}
                </td>
                <td className="py-3 px-2 text-center text-[11px] text-emerald-300 border-r border-slate-800">
                  Mean RMSE: {activeLobFit.current_mean_rmse_pct.toFixed(2)}%
                </td>
                <td
                  colSpan={5}
                  className="py-3 px-2 text-center text-xs text-slate-400 border-r border-slate-800 font-sans"
                >
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Credibility-Weighted Blending Active
                  </span>
                </td>
                <td className="py-3 px-2.5 bg-emerald-950/30 text-emerald-300">
                  {calculation.totals.selected_ultimate.toLocaleString('en-US')}
                </td>
                <td className="py-3 px-2.5 bg-emerald-950/40 text-emerald-400">
                  {calculation.totals.selected_ibnr.toLocaleString('en-US')}
                </td>
                <td className="py-3 px-2.5 text-sky-300">
                  {(calculation.totals.overall_loss_ratio * 100).toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* =====================================================================
          SECTION 04: VISUAL COMPARISON OF METHOD ULTIMATES BY ORIGIN YEAR
         ===================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Section 03 · Ultimate Loss &amp; Reserve Composition by Method (Accident Years 2017–2026)
            </h3>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-600 inline-block" />
              Paid Loss
            </span>
            <span className="flex items-center gap-1.5 text-amber-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/70 inline-block" />
              Case Reserve
            </span>
            <span className="flex items-center gap-1.5 text-emerald-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
              Selected Pure IBNR
            </span>
          </div>
        </div>

        <div className="space-y-2.5 font-mono text-xs">
          {calculation.origins.map((origin) => {
            const maxUlt = Math.max(
              ...Object.values(calculation.selected_ultimate),
              1
            );
            const paid = calculation.latest_paid[origin] || 0;
            const caseRes = calculation.case_reserves[origin] || 0;
            const selIbnr = calculation.selected_ibnr[origin] || 0;
            const selUlt = calculation.selected_ultimate[origin] || 0;

            const paidPct = (paid / maxUlt) * 100;
            const casePct = (caseRes / maxUlt) * 100;
            const ibnrPct = (Math.max(0, selIbnr) / maxUlt) * 100;
            const origEval = activeLobFit.origins.find((o) => o.origin === origin);

            return (
              <div key={origin} className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-2 sm:col-span-1 font-bold text-slate-300">
                  {origin}
                </div>
                <div className="col-span-6 sm:col-span-8 bg-slate-950 rounded-lg h-6 p-0.5 border border-slate-800/80 flex items-center overflow-hidden">
                  <div
                    style={{ width: `${paidPct}%` }}
                    className="h-full bg-slate-600 transition-all duration-300"
                    title={`Paid: ${paid.toLocaleString('en-US')}`}
                  />
                  <div
                    style={{ width: `${casePct}%` }}
                    className="h-full bg-amber-500/75 transition-all duration-300"
                    title={`Case Reserve: ${caseRes.toLocaleString('en-US')}`}
                  />
                  <div
                    style={{ width: `${ibnrPct}%` }}
                    className="h-full bg-emerald-500 transition-all duration-300"
                    title={`Selected IBNR: ${selIbnr.toLocaleString('en-US')}`}
                  />
                </div>
                <div className="col-span-4 sm:col-span-3 flex items-center justify-between text-right tabular-nums">
                  <span className="text-slate-400 text-[11px]">
                    {origEval ? origEval.current_active_label : 'IBNR'}:
                  </span>
                  <span className="text-emerald-400 font-semibold">
                    +{selIbnr.toLocaleString('en-US')}
                  </span>
                  <span className="text-slate-200 font-bold">
                    {selUlt.toLocaleString('en-US')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
