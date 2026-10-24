'use client';

import React, { useState } from 'react';
import {
  CalculationRecipe,
  CalculationResponse,
  AverageMethod,
  isCellDropped,
} from '@/lib/actuarial-engine';
import { RotateCcw, Sparkles, Check, AlertTriangle, Sliders } from 'lucide-react';

interface TriangleLdfTabProps {
  recipe: CalculationRecipe;
  calculation: CalculationResponse;
  isLocked: boolean;
  onUpdateRecipe: (next: CalculationRecipe) => void;
}

type TriangleTarget = 'paid' | 'incurred';
type DisplayMode = 'cumulative' | 'incremental' | 'count';

export default function TriangleLdfTab({
  recipe,
  calculation,
  isLocked,
  onUpdateRecipe,
}: TriangleLdfTabProps) {
  const [target, setTarget] = useState<TriangleTarget>('paid');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('cumulative');
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);

  const origins = calculation.origins;
  const devs = calculation.developments;

  const activeDevConfig = target === 'paid' ? recipe.paid_dev : recipe.incurred_dev;
  const activeTailConfig = target === 'paid' ? recipe.paid_tail : recipe.incurred_tail;
  const activeTriangle =
    displayMode === 'count'
      ? calculation.count_triangle
      : target === 'paid'
      ? calculation.paid_triangle
      : calculation.incurred_triangle;

  const activeLinkRatios =
    target === 'paid' ? calculation.paid_link_ratios : calculation.incurred_link_ratios;
  const activeLdfsByPeriod =
    target === 'paid' ? calculation.paid_ldfs_by_period : calculation.incurred_ldfs_by_period;
  const activeCdf = target === 'paid' ? calculation.paid_cdf : calculation.incurred_cdf;
  const activeTailFactor =
    target === 'paid' ? calculation.paid_tail_factor : calculation.incurred_tail_factor;

  const displayedMatrix: (number | null)[][] = activeTriangle.map((row) => {
    if (displayMode !== 'incremental') return row;
    return row.map((val, j) => {
      if (val === null) return null;
      if (j === 0) return val;
      const prev = row[j - 1];
      return prev !== null ? Math.round((val - prev) * 10) / 10 : val;
    });
  });

  const flatVals = displayedMatrix.flat().filter((v): v is number => v !== null && v > 0);
  const maxVal = flatVals.length > 0 ? Math.max(...flatVals) : 1;
  const minVal = flatVals.length > 0 ? Math.min(...flatVals) : 0;

  const handleToggleDropCell = (origin: string, devFrom: number) => {
    if (isLocked) return;
    const nextRecipe = structuredClone(recipe);
    const cfg = target === 'paid' ? nextRecipe.paid_dev : nextRecipe.incurred_dev;
    const exists = isCellDropped(cfg.drop_cells, origin, devFrom);

    if (exists) {
      cfg.drop_cells = cfg.drop_cells.filter(
        ([o, d]) => !(String(o) === String(origin) && Number(d) === Number(devFrom))
      );
    } else {
      cfg.drop_cells.push([origin, devFrom]);
    }
    onUpdateRecipe(nextRecipe);
  };

  const handleAutoDetectOutliers = () => {
    if (isLocked) return;
    const nextRecipe = structuredClone(recipe);
    const cfg = target === 'paid' ? nextRecipe.paid_dev : nextRecipe.incurred_dev;
    const colAvgs = activeLdfsByPeriod.all_volume;
    const detected: [string, number][] = [];

    for (let i = 0; i < origins.length; i++) {
      for (let j = 0; j < devs.length - 1; j++) {
        const val = activeLinkRatios[i]?.[j];
        const avg = colAvgs[j];
        if (val !== null && val !== undefined && avg > 0) {
          if (Math.abs(val - avg) / avg > 0.065) {
            detected.push([origins[i], devs[j]]);
          }
        }
      }
    }
    cfg.drop_cells = detected;
    onUpdateRecipe(nextRecipe);
  };

  const handleClearDrops = () => {
    if (isLocked) return;
    const nextRecipe = structuredClone(recipe);
    const cfg = target === 'paid' ? nextRecipe.paid_dev : nextRecipe.incurred_dev;
    cfg.drop_cells = [];
    cfg.manual_ldf_overrides = {};
    onUpdateRecipe(nextRecipe);
  };

  const handleSelectAverageMethod = (method: AverageMethod) => {
    if (isLocked) return;
    const nextRecipe = structuredClone(recipe);
    const cfg = target === 'paid' ? nextRecipe.paid_dev : nextRecipe.incurred_dev;
    cfg.average = method;
    cfg.n_periods = method === 'last_3_volume' ? 3 : method === 'last_5_volume' ? 5 : -1;
    onUpdateRecipe(nextRecipe);
  };

  const handleManualOverrideChange = (devFrom: number, rawVal: string) => {
    if (isLocked) return;
    const nextRecipe = structuredClone(recipe);
    const cfg = target === 'paid' ? nextRecipe.paid_dev : nextRecipe.incurred_dev;
    if (rawVal.trim() === '') {
      delete cfg.manual_ldf_overrides[devFrom];
    } else {
      const parsed = parseFloat(rawVal);
      if (!Number.isNaN(parsed) && parsed >= 0.5 && parsed <= 10.0) {
        cfg.manual_ldf_overrides[devFrom] = parsed;
      }
    }
    onUpdateRecipe(nextRecipe);
  };

  const handleTailChange = (
    field: 'method' | 'tail_factor' | 'curve_type' | 'extrap_periods',
    value: string | number
  ) => {
    if (isLocked) return;
    const nextRecipe = structuredClone(recipe);
    const tail = target === 'paid' ? nextRecipe.paid_tail : nextRecipe.incurred_tail;
    if (field === 'method') {
      tail.method = value as 'none' | 'constant' | 'curve';
    } else if (field === 'tail_factor') {
      const num = parseFloat(String(value));
      if (!Number.isNaN(num) && num >= 1.0 && num <= 2.5) {
        tail.tail_factor = num;
      }
    } else if (field === 'curve_type') {
      tail.curve_type = value as 'exponential' | 'inverse_power';
    } else if (field === 'extrap_periods') {
      const num = parseInt(String(value), 10);
      if (!Number.isNaN(num) && num >= 1 && num <= 20) {
        tail.extrap_periods = num;
      }
    }
    onUpdateRecipe(nextRecipe);
  };

  const ldfMethodRows: { key: string; method: AverageMethod; label: string; sub: string }[] = [
    {
      key: 'all_volume',
      method: 'volume',
      label: 'All-Year Volume Weighted',
      sub: 'Vol-Wtd Average (All Periods)',
    },
    {
      key: 'all_simple',
      method: 'simple',
      label: 'All-Year Simple Average',
      sub: 'Simple Arithmetic Average',
    },
    {
      key: 'last_3_volume',
      method: 'last_3_volume',
      label: 'Last 3-Year Volume Weighted',
      sub: 'Recent 3-Diagonal Vol-Wtd',
    },
    {
      key: 'last_5_volume',
      method: 'last_5_volume',
      label: 'Last 5-Year Volume Weighted',
      sub: 'Recent 5-Diagonal Vol-Wtd',
    },
    {
      key: 'regression',
      method: 'regression',
      label: 'OLS Regression Through Origin',
      sub: 'Mack Zero-Intercept Slope',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-lg p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Paid vs Incurred Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setTarget('paid')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                target === 'paid'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Paid Triangle
            </button>
            <button
              type="button"
              onClick={() => setTarget('incurred')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                target === 'incurred'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Incurred Triangle
            </button>
          </div>

          {/* Display Mode Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setDisplayMode('cumulative')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                displayMode === 'cumulative'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cumulative
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('incremental')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                displayMode === 'incremental'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Incremental
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('count')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                displayMode === 'count'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Claim Count
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowHeatmap((prev) => !prev)}
            className={`px-2.5 py-1 text-xs font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 ${
              showHeatmap
                ? 'bg-slate-800 border-slate-700 text-sky-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {showHeatmap ? 'Heatmap: ON' : 'Heatmap: OFF'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            Excluded Cells ({target.toUpperCase()}): {activeDevConfig.drop_cells.length}
          </span>
          <button
            type="button"
            disabled={isLocked}
            onClick={handleAutoDetectOutliers}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-amber-950/60 hover:bg-amber-900/70 text-amber-200 border border-amber-700/60 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto-Drop &gt;6.5% Outliers
          </button>
          <button
            type="button"
            disabled={isLocked}
            onClick={handleClearDrops}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Exclusions
          </button>
        </div>
      </div>

      {/* Section 1: Interactive Age-to-Age Link Ratios & LDF Selection Matrix (ResQ Primary Interactive Grid) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-950/50">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              01. Interactive Age-to-Age Link Ratio Matrix &amp; LDF Selection ({target === 'paid' ? 'Paid Link Ratios' : 'Incurred Link Ratios'})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any Link Ratio cell to toggle outlier exclusion (`drop_cells` strikethrough) and recompute Volume/Simple/3-Yr/5-Yr LDFs, CDFs &amp; IBNR in real time.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs border border-rose-500 bg-rose-950/70 inline-block" />
              Excluded Cell (`drop_cells`)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Statistical Outlier (&gt;6.5% vs Vol Avg)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            data-testid="link-ratio-table"
            className="w-full text-xs border-collapse font-mono tabular-nums"
          >
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <th className="py-2 px-3 text-left font-medium sticky left-0 bg-slate-950 z-10 border-r border-slate-800 min-w-[205px]">
                  Origin / LDF Estimator
                </th>
                {devs.slice(0, -1).map((d, j) => (
                  <th key={d} className="py-2 px-2 text-right font-medium">
                    {d}→{devs[j + 1]}M
                  </th>
                ))}
                <th className="py-2 px-3 text-right font-semibold text-amber-300 border-l border-slate-800 bg-slate-950">
                  120M→Ult (Tail)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {origins.slice(0, -1).map((orig, i) => (
                <tr key={orig} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-1 px-3 font-semibold text-slate-300 sticky left-0 bg-slate-900 border-r border-slate-800">
                    {orig}
                  </td>
                  {devs.slice(0, -1).map((devFrom, j) => {
                    const ratio = activeLinkRatios[i]?.[j];
                    if (ratio === null || ratio === undefined) {
                      return (
                        <td
                          key={devFrom}
                          className="py-1 px-2 text-right text-slate-700 bg-slate-950/40"
                        >
                          —
                        </td>
                      );
                    }

                    const dropped = isCellDropped(activeDevConfig.drop_cells, orig, devFrom);
                    const colAvg = activeLdfsByPeriod.all_volume[j] || 1.0;
                    const isStatisticalOutlier =
                      colAvg > 0 && Math.abs(ratio - colAvg) / colAvg > 0.065;

                    return (
                      <td key={devFrom} className="p-0.5 text-right">
                        <button
                          type="button"
                          disabled={isLocked}
                          aria-label={`Toggle Link Ratio Origin ${orig} Dev ${devFrom} to ${devs[j + 1]}`}
                          onClick={() => handleToggleDropCell(orig, devFrom)}
                          className={`w-full py-1 px-1.5 text-right rounded transition-all flex items-center justify-end gap-1 ${
                            dropped
                              ? 'bg-rose-950/60 border border-rose-500/80 text-rose-300 line-through'
                              : isStatisticalOutlier
                              ? 'bg-amber-950/35 border border-amber-500/50 text-amber-200 hover:bg-amber-900/50'
                              : 'hover:bg-slate-800 text-slate-200 border border-transparent'
                          }`}
                        >
                          {isStatisticalOutlier && !dropped && (
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                          )}
                          <span>{ratio.toFixed(4)}</span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-1 px-3 text-right text-slate-600 border-l border-slate-800 bg-slate-950/30">
                    —
                  </td>
                </tr>
              ))}

              {/* Divider Header for Average LDF Rows */}
              <tr className="bg-slate-950/90 border-t-2 border-slate-700">
                <td
                  colSpan={devs.length + 1}
                  className="py-1.5 px-3 text-xs font-sans font-semibold text-sky-400 tracking-wide"
                >
                  Period Average LDFs (Click any row to adopt as active LDF basis)
                </td>
              </tr>

              {ldfMethodRows.map((row) => {
                const isSelectedBasis = activeDevConfig.average === row.method;
                const values = activeLdfsByPeriod[row.key] || [];
                return (
                  <tr
                    key={row.key}
                    className={`transition-colors ${
                      isSelectedBasis ? 'bg-sky-950/35' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-1.5 px-3 sticky left-0 bg-slate-900 border-r border-slate-800">
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => handleSelectAverageMethod(row.method)}
                        className="w-full text-left flex items-center gap-2 group"
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                            isSelectedBasis
                              ? 'bg-sky-500 border-sky-400 text-slate-950'
                              : 'border-slate-700 group-hover:border-slate-500'
                          }`}
                        >
                          {isSelectedBasis && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </span>
                        <div>
                          <div
                            className={`text-xs font-sans font-medium ${
                              isSelectedBasis ? 'text-sky-300' : 'text-slate-200'
                            }`}
                          >
                            {row.label}
                          </div>
                        </div>
                      </button>
                    </td>
                    {values.map((v, j) => (
                      <td
                        key={j}
                        className={`py-1.5 px-2 text-right ${
                          isSelectedBasis ? 'text-sky-200 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        {v.toFixed(4)}
                      </td>
                    ))}
                    <td className="py-1.5 px-3 text-right text-slate-500 border-l border-slate-800 bg-slate-950/30">
                      —
                    </td>
                  </tr>
                );
              })}

              {/* Manual Override Row */}
              <tr className="bg-slate-950/60 border-t border-slate-800">
                <td className="py-1.5 px-3 sticky left-0 bg-slate-950 border-r border-slate-800 font-sans">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
                    <Sliders className="w-3.5 h-3.5" />
                    Manual LDF Override
                  </div>
                </td>
                {devs.slice(0, -1).map((devFrom) => {
                  const currentOverride = activeDevConfig.manual_ldf_overrides?.[devFrom];
                  return (
                    <td key={devFrom} className="p-1 text-right">
                      <input
                        type="number"
                        step="0.0001"
                        min="0.8"
                        max="5.0"
                        disabled={isLocked}
                        aria-label={`Manual LDF Override for ${devFrom}M`}
                        placeholder="Auto"
                        value={currentOverride !== undefined ? currentOverride : ''}
                        onChange={(e) => handleManualOverrideChange(devFrom, e.target.value)}
                        className={`w-full px-1.5 py-0.5 text-right text-xs rounded border bg-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-400 ${
                          currentOverride !== undefined
                            ? 'border-amber-500/80 text-amber-200 font-semibold bg-amber-950/30'
                            : 'border-slate-800 text-slate-300 placeholder:text-slate-600'
                        }`}
                      />
                    </td>
                  );
                })}
                <td className="p-1 text-right border-l border-slate-800 bg-slate-950">
                  <span className="text-xs text-amber-300 font-semibold px-2">
                    {activeTailFactor.toFixed(4)}
                  </span>
                </td>
              </tr>

              {/* Selected LDF Row */}
              <tr className="bg-sky-950/50 border-t-2 border-sky-500/40">
                <td className="py-2 px-3 font-sans font-semibold text-sky-200 sticky left-0 bg-slate-900 border-r border-slate-800">
                  Selected LDF (Adopted f_j)
                </td>
                {activeLdfsByPeriod.selected.map((v, j) => {
                  const devFrom = devs[j];
                  const isOverridden = activeDevConfig.manual_ldf_overrides?.[devFrom] !== undefined;
                  return (
                    <td
                      key={j}
                      className={`py-2 px-2 text-right font-bold ${
                        isOverridden ? 'text-amber-300' : 'text-sky-200'
                      }`}
                    >
                      {v.toFixed(4)}
                    </td>
                  );
                })}
                <td className="py-2 px-3 text-right font-bold text-amber-300 border-l border-slate-800 bg-slate-950/80">
                  {activeTailFactor.toFixed(4)}
                </td>
              </tr>

              {/* Cumulative CDF Row */}
              <tr className="bg-emerald-950/30 border-t border-emerald-500/30">
                <td className="py-2 px-3 font-sans font-semibold text-emerald-300 sticky left-0 bg-slate-900 border-r border-slate-800">
                  Cumulative CDF to Ultimate
                </td>
                {activeCdf.slice(0, -1).map((v, j) => (
                  <td key={j} className="py-2 px-2 text-right font-bold text-emerald-300">
                    {v.toFixed(4)}
                  </td>
                ))}
                <td className="py-2 px-3 text-right font-bold text-emerald-300 border-l border-slate-800 bg-slate-950/80">
                  {activeCdf[activeCdf.length - 1]?.toFixed(4) ?? '1.0000'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Cumulative / Incremental Development Triangle */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-950/50">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              02. {displayMode === 'count' ? 'Claim Count Development Triangle' : target === 'paid' ? 'Paid Loss Development Triangle' : 'Incurred Loss Development Triangle'} ({displayMode.toUpperCase()})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Unit: {displayMode === 'count' ? 'Reported Claims' : calculation.currency_unit} · Highlighted cells indicate the Latest Valuation Diagonal (as of 2026-03-31)
            </p>
          </div>
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            Origin: 2017–2026 · Dev: 12–120 Months
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse font-mono tabular-nums">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <th className="py-2 px-3 text-left font-medium sticky left-0 bg-slate-950 z-10 border-r border-slate-800">
                  Origin Year
                </th>
                {devs.map((d) => (
                  <th key={d} className="py-2 px-2.5 text-right font-medium">
                    {d}M
                  </th>
                ))}
                <th className="py-2 px-3 text-right font-semibold text-sky-300 border-l border-slate-800 bg-slate-950/90">
                  Latest Diagonal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {origins.map((orig, i) => {
                const latestIdx = devs.length - 1 - i;
                const latestVal = displayedMatrix[i]?.[latestIdx];
                return (
                  <tr key={orig} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-1.5 px-3 font-semibold text-slate-200 sticky left-0 bg-slate-900 border-r border-slate-800">
                      {orig}
                    </td>
                    {devs.map((d, j) => {
                      const val = displayedMatrix[i]?.[j];
                      const isLatestDiagonal = j === latestIdx;
                      const ratio =
                        val !== null && maxVal > minVal
                          ? Math.max(0.06, Math.min(0.32, ((val - minVal) / (maxVal - minVal)) * 0.28))
                          : 0;

                      return (
                        <td
                          key={d}
                          style={
                            showHeatmap && val !== null
                              ? { backgroundColor: `rgba(14, 165, 233, ${ratio.toFixed(3)})` }
                              : undefined
                          }
                          className={`py-1.5 px-2.5 text-right transition-colors ${
                            val === null
                              ? 'text-slate-700 bg-slate-950/40'
                              : isLatestDiagonal
                              ? 'text-sky-200 font-semibold ring-1 ring-inset ring-sky-500/60 bg-sky-950/40'
                              : 'text-slate-200'
                          }`}
                        >
                          {val !== null ? val.toLocaleString('en-US') : '—'}
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-3 text-right font-semibold text-sky-300 border-l border-slate-800 bg-slate-950/60">
                      {latestVal !== null && latestVal !== undefined ? latestVal.toLocaleString('en-US') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Tail Factor Configuration Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              03. Tail Factor Extrapolation Beyond 120 Months ({target.toUpperCase()})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure `chainladder.TailConstant` or `chainladder.TailCurve` (Exponential / Inverse Power decay fitting)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <span>Tail Method:</span>
              <select
                disabled={isLocked}
                aria-label="Tail Method"
                value={activeTailConfig.method}
                onChange={(e) => handleTailChange('method', e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="none">None (1.0000)</option>
                <option value="constant">Constant (Manual Input)</option>
                <option value="curve">Curve Fit (TailCurve Extrapolation)</option>
              </select>
            </label>

            {activeTailConfig.method === 'constant' && (
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <span>Tail Factor:</span>
                <input
                  type="number"
                  step="0.001"
                  min="1.000"
                  max="1.500"
                  disabled={isLocked}
                  value={activeTailConfig.tail_factor}
                  onChange={(e) => handleTailChange('tail_factor', e.target.value)}
                  className="w-24 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono tabular-nums text-amber-300"
                />
              </label>
            )}

            {activeTailConfig.method === 'curve' && (
              <>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <span>Curve Type:</span>
                  <select
                    disabled={isLocked}
                    aria-label="Tail Curve Type"
                    value={activeTailConfig.curve_type}
                    onChange={(e) => handleTailChange('curve_type', e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100"
                  >
                    <option value="exponential">Exponential Decay</option>
                    <option value="inverse_power">Inverse Power Curve</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <span>Extrap Periods (Yrs):</span>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    disabled={isLocked}
                    value={activeTailConfig.extrap_periods}
                    onChange={(e) => handleTailChange('extrap_periods', e.target.value)}
                    className="w-16 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-100"
                  />
                </label>
              </>
            )}

            <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono tabular-nums text-amber-300">
              Fitted Tail: <span className="font-bold">{activeTailFactor.toFixed(4)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
