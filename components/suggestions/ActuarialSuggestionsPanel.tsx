'use client';

import React, { useState, useMemo } from 'react';
import {
  CalculationRecipe,
  CalculationResponse,
  generateActuarialSuggestions,
  LOB_SEGMENTS,
} from '@/lib/actuarial-engine';
import {
  Sparkles,
  Check,
  Zap,
  Bookmark,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Sliders,
} from 'lucide-react';

interface ActuarialSuggestionsPanelProps {
  recipe: CalculationRecipe;
  calculation: CalculationResponse;
  allRecipes: Record<string, CalculationRecipe>;
  allCalculations: Record<string, CalculationResponse>;
  isLocked: boolean;
  activeTab?: 'triangle' | 'methods' | 'ave_pyd' | 'diagnostics';
  onUpdateRecipe: (next: CalculationRecipe) => void;
  onBatchUpdateAllRecipes?: (nextMap: Record<string, CalculationRecipe>) => void;
  onOpenAvePydTab?: () => void;
}

export default function ActuarialSuggestionsPanel({
  recipe,
  calculation,
  allRecipes,
  allCalculations,
  isLocked,
  activeTab = 'triangle',
  onUpdateRecipe,
  onBatchUpdateAllRecipes,
  onOpenAvePydTab,
}: ActuarialSuggestionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  React.useEffect(() => {
    setIsExpanded(activeTab === 'triangle' || activeTab === 'methods');
  }, [activeTab]);
  const [baselineSnapshot, setBaselineSnapshot] = useState<{
    lob_id: string;
    label: string;
    ultimate: number;
    ibnr: number;
    pyd: number;
  } | null>(null);

  const {
    suggestions,
    combinedRecipe,
    combinedDeltaUltimate,
    combinedDeltaIbnr,
    combinedDeltaPyd,
    pendingCount,
  } = useMemo(
    () => generateActuarialSuggestions(recipe, calculation),
    [recipe, calculation]
  );

  // Also compute enterprise-wide optimization impact across all 4 LoBs
  const enterpriseOptimization = useMemo(() => {
    let totalDeltaIbnr = 0;
    let totalDeltaUlt = 0;
    const nextRecipesMap: Record<string, CalculationRecipe> = {};
    for (const lobId of Object.keys(allRecipes)) {
      const r = allRecipes[lobId];
      const c = allCalculations[lobId];
      const gen = generateActuarialSuggestions(r, c);
      nextRecipesMap[lobId] = gen.combinedRecipe;
      totalDeltaIbnr += gen.combinedDeltaIbnr;
      totalDeltaUlt += gen.combinedDeltaUltimate;
    }
    return {
      nextRecipesMap,
      totalDeltaIbnr: Math.round(totalDeltaIbnr * 10) / 10,
      totalDeltaUlt: Math.round(totalDeltaUlt * 10) / 10,
    };
  }, [allRecipes, allCalculations]);

  const formatSigned = (val: number) => {
    const rounded = Math.round(val * 10) / 10;
    if (rounded > 0) return `+${rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
    return rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  const handlePinBaseline = () => {
    setBaselineSnapshot({
      lob_id: calculation.lob_id,
      label: `${LOB_SEGMENTS[calculation.lob_id]?.short_name || calculation.lob_name} Snapshot`,
      ultimate: calculation.totals.selected_ultimate,
      ibnr: calculation.totals.selected_ibnr,
      pyd: calculation.ave_pyd_totals.total_pyd,
    });
  };

  const activeSnapDeltaIbnr =
    baselineSnapshot && baselineSnapshot.lob_id === calculation.lob_id
      ? Math.round((calculation.totals.selected_ibnr - baselineSnapshot.ibnr) * 10) / 10
      : null;

  const activeSnapDeltaUlt =
    baselineSnapshot && baselineSnapshot.lob_id === calculation.lob_id
      ? Math.round((calculation.totals.selected_ultimate - baselineSnapshot.ultimate) * 10) / 10
      : null;

  return (
    <section
      aria-label="Smart Actuarial Suggestions and What-If Simulator"
      data-testid="smart-suggestions-panel"
      className="bg-slate-900/90 border border-sky-500/35 rounded-xl overflow-hidden"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-sky-950/60 via-slate-900 to-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-slate-100">
                Smart Actuarial Suggestions &amp; What-If Impact Simulator
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-sky-500/20 border border-sky-400/40 text-sky-200 rounded">
                {pendingCount} Actionable
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Pre-simulated parameter recommendations (`drop_cells`, LDF basis, AvE Apriori LR, and BF/Cape Cod blend) with exact IBNR &amp; PYD impact
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenAvePydTab && (
            <button
              type="button"
              onClick={onOpenAvePydTab}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-slate-950 hover:bg-slate-800 text-sky-300 border border-sky-500/40 rounded-lg transition-colors whitespace-nowrap"
            >
              Actual vs. Expected (A/E: {(calculation.ave_pyd_totals.ave_paid_ratio * 100).toFixed(1)}%)
            </button>
          )}

          {/* Baseline Snapshot Pin Button */}
          <button
            type="button"
            onClick={handlePinBaseline}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            {baselineSnapshot && baselineSnapshot.lob_id === calculation.lob_id
              ? `Pinned Baseline (ΔIBNR: ${formatSigned(activeSnapDeltaIbnr || 0)})`
              : 'Pin Baseline Snapshot'}
          </button>

          {/* Apply All Recommended for Active LoB */}
          <button
            type="button"
            disabled={isLocked}
            data-testid="apply-all-lob-suggestions"
            onClick={() => onUpdateRecipe(combinedRecipe)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Zap className="w-3.5 h-3.5" />
            Apply All LoB Suggestions ({formatSigned(combinedDeltaIbnr)} IBNR)
          </button>

          {/* Optimize All 4 LoBs */}
          {onBatchUpdateAllRecipes && (
            <button
              type="button"
              disabled={isLocked}
              data-testid="apply-enterprise-suggestions"
              onClick={() => onBatchUpdateAllRecipes(enterpriseOptimization.nextRecipesMap)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5" />
              Optimize All 4 LoBs ({formatSigned(enterpriseOptimization.totalDeltaIbnr)} IBNR)
            </button>
          )}

          <button
            type="button"
            aria-label={isExpanded ? 'Collapse Suggestions' : 'Expand Suggestions'}
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-950 border border-slate-800 rounded-lg"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Pinned Snapshot Live Comparison Banner (if pinned) */}
      {baselineSnapshot && baselineSnapshot.lob_id === calculation.lob_id && (
        <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
          <div className="flex items-center gap-2 text-amber-200 font-sans">
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold">{baselineSnapshot.label} Active:</span>
            <span className="text-slate-300 font-mono">
              Baseline IBNR {baselineSnapshot.ibnr.toLocaleString('en-US')} → Current IBNR{' '}
              {calculation.totals.selected_ibnr.toLocaleString('en-US')} JPY M
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span
              className={`font-bold ${
                (activeSnapDeltaUlt || 0) > 0
                  ? 'text-rose-300'
                  : (activeSnapDeltaUlt || 0) < 0
                  ? 'text-emerald-300'
                  : 'text-slate-300'
              }`}
            >
              Δ Ultimate: {formatSigned(activeSnapDeltaUlt || 0)} JPY M
            </span>
            <span
              className={`font-bold ${
                (activeSnapDeltaIbnr || 0) > 0
                  ? 'text-rose-300'
                  : (activeSnapDeltaIbnr || 0) < 0
                  ? 'text-emerald-300'
                  : 'text-slate-300'
              }`}
            >
              Δ Pure IBNR: {formatSigned(activeSnapDeltaIbnr || 0)} JPY M
            </span>
            <button
              type="button"
              onClick={() => setBaselineSnapshot(null)}
              className="text-[11px] font-sans text-slate-400 hover:text-slate-200 underline"
            >
              Clear Snapshot
            </button>
          </div>
        </div>
      )}

      {/* Expandable 4-Card Grid of Quantified Suggestions */}
      {isExpanded && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {suggestions.map((sug) => {
            const isZeroDelta = Math.abs(sug.delta_ibnr) < 0.05 && Math.abs(sug.delta_ultimate) < 0.05;
            const isApplied = sug.is_applied || isZeroDelta;

            return (
              <div
                key={sug.id}
                data-testid={`suggestion-card-${sug.category}`}
                className={`p-3.5 rounded-lg border flex flex-col justify-between gap-3 transition-all ${
                  isApplied
                    ? 'bg-slate-950/60 border-emerald-500/40'
                    : 'bg-slate-950/90 border-slate-800 hover:border-sky-500/50'
                }`}
              >
                <div className="space-y-2">
                  {/* Top Meta Row */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400">
                      {sug.category_label}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border ${
                        isApplied
                          ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                          : sug.priority === 'HIGH'
                          ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      }`}
                    >
                      {isApplied ? 'APPLIED' : `${sug.priority} PRIORITY`}
                    </span>
                  </div>

                  {/* Title & Segment */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-100 leading-snug">
                      {sug.title}
                    </h3>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      {sug.target_segment}
                    </div>
                  </div>

                  {/* Rationale */}
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {sug.rationale}
                  </p>

                  {/* Before -> After Parameter Box */}
                  <div className="p-2 bg-slate-900/90 border border-slate-800/90 rounded text-[11px] font-mono space-y-0.5">
                    <div className="text-slate-400 truncate">{sug.before_label}</div>
                    <div className="text-sky-300 font-semibold truncate">→ {sug.after_label}</div>
                  </div>
                </div>

                {/* Bottom Simulated Impact & Action Button */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 font-mono tabular-nums">
                  <div>
                    <div className="text-[10px] font-sans text-slate-400">Simulated Impact</div>
                    <div
                      className={`text-xs font-bold ${
                        sug.delta_ibnr > 0
                          ? 'text-rose-300'
                          : sug.delta_ibnr < 0
                          ? 'text-emerald-300'
                          : 'text-slate-400'
                      }`}
                    >
                      IBNR: {formatSigned(sug.delta_ibnr)} JPY M
                    </div>
                    <div className="text-[10px] text-slate-400">
                      ΔPYD: {formatSigned(sug.delta_pyd)}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isLocked || isApplied}
                    onClick={() => onUpdateRecipe(sug.next_recipe)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-sans font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      isApplied
                        ? 'bg-emerald-950/50 border border-emerald-600/40 text-emerald-300 cursor-default'
                        : 'bg-sky-600 hover:bg-sky-500 text-white'
                    }`}
                  >
                    {isApplied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Applied
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        Apply
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
