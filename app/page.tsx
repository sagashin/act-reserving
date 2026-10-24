'use client';

import React, { useState, useCallback } from 'react';
import {
  LOB_SEGMENTS,
  CalculationRecipe,
  CalculationResponse,
  calculateReserves,
} from '@/lib/actuarial-engine';
import TriangleLdfTab from '@/components/triangle-grid/TriangleLdfTab';
import MethodComparisonTab from '@/components/method-selector/MethodComparisonTab';
import AvEPydTab from '@/components/ave-pyd/AvEPydTab';
import DiagnosticsSummaryTab from '@/components/charts/DiagnosticsSummaryTab';
import ActuarialSuggestionsPanel from '@/components/suggestions/ActuarialSuggestionsPanel';
import AiActuaryDrawer from '@/components/AiActuaryDrawer';
import ArchitectureSpecModal from '@/components/ArchitectureSpecModal';
import DataImportModal from '@/components/DataImportModal';
import {
  FolderTree,
  Lock,
  Unlock,
  Sparkles,
  Grid,
  Sliders,
  BarChart3,
  Activity,
  RotateCcw,
  ChevronRight,
  FileCode,
  Upload,
} from 'lucide-react';

type ActiveWorkbenchTab = 'triangle' | 'methods' | 'ave_pyd' | 'diagnostics';

export default function ResQWorkbenchPage() {
  const [selectedLobId, setSelectedLobId] = useState<string>('auto_bi');
  const [activeTab, setActiveTab] = useState<ActiveWorkbenchTab>('triangle');
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [isSpecModalOpen, setIsSpecModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Store recipes per LoB
  const [recipesByLob, setRecipesByLob] = useState<Record<string, CalculationRecipe>>(() => ({
    auto_bi: structuredClone(LOB_SEGMENTS.auto_bi.default_recipe),
    auto_pd: structuredClone(LOB_SEGMENTS.auto_pd.default_recipe),
    fire_comm: structuredClone(LOB_SEGMENTS.fire_comm.default_recipe),
    casualty_gl: structuredClone(LOB_SEGMENTS.casualty_gl.default_recipe),
  }));

  // Store calculated responses per LoB
  const [calculationsByLob, setCalculationsByLob] = useState<Record<string, CalculationResponse>>(
    () => ({
      auto_bi: calculateReserves(LOB_SEGMENTS.auto_bi.default_recipe),
      auto_pd: calculateReserves(LOB_SEGMENTS.auto_pd.default_recipe),
      fire_comm: calculateReserves(LOB_SEGMENTS.fire_comm.default_recipe),
      casualty_gl: calculateReserves(LOB_SEGMENTS.casualty_gl.default_recipe),
    })
  );

  const currentRecipe = recipesByLob[selectedLobId] || recipesByLob.auto_bi;
  const currentCalculation = calculationsByLob[selectedLobId] || calculationsByLob.auto_bi;
  const currentSegment = LOB_SEGMENTS[selectedLobId] || LOB_SEGMENTS.auto_bi;

  const handleUpdateRecipe = useCallback(async (nextRecipe: CalculationRecipe) => {
    const lobId = nextRecipe.lob_id;
    // Immediate optimistic local calculation for zero-latency spreadsheet feel
    const immediateResult = calculateReserves(nextRecipe);
    setRecipesByLob((prev) => ({ ...prev, [lobId]: nextRecipe }));
    setCalculationsByLob((prev) => ({ ...prev, [lobId]: immediateResult }));

    // Also sync through POST /api/calculate endpoint
    try {
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextRecipe),
      });
      if (res.ok) {
        const serverCalc: CalculationResponse = await res.json();
        setCalculationsByLob((prev) => ({ ...prev, [lobId]: serverCalc }));
      }
    } catch {
      // Local calculation already applied
    }
  }, []);

  const handleBatchUpdateAllRecipes = useCallback(
    (nextRecipes: Record<string, CalculationRecipe>) => {
      const nextCalcs: Record<string, CalculationResponse> = {};
      for (const [lobId, rec] of Object.entries(nextRecipes)) {
        nextCalcs[lobId] = calculateReserves(rec);
      }
      setRecipesByLob(nextRecipes);
      setCalculationsByLob(nextCalcs);
    },
    []
  );

  const handleResetCurrentLob = () => {
    if (isLocked) return;
    const defaultRec = structuredClone(LOB_SEGMENTS[selectedLobId].default_recipe);
    handleUpdateRecipe(defaultRec);
  };

  // Group LoB segments by parent_category for sidebar hierarchy tree
  const categories = [
    {
      title: 'Motor Lines (Personal & Commercial)',
      items: [LOB_SEGMENTS.auto_bi, LOB_SEGMENTS.auto_pd],
    },
    {
      title: 'Property & Casualty Lines',
      items: [LOB_SEGMENTS.fire_comm, LOB_SEGMENTS.casualty_gl],
    },
  ];

  const totalEnterpriseIbnr = Object.values(calculationsByLob).reduce(
    (sum, c) => sum + c.totals.selected_ibnr,
    0
  );

  const totalEnterprisePyd =
    Math.round(
      Object.values(calculationsByLob).reduce(
        (sum, c) => sum + (c.ave_pyd_totals?.total_pyd || 0),
        0
      ) * 10
    ) / 10;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Navigation Bar - Strict 3-Zone Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3 border-b border-slate-800 bg-slate-950 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          ResQ-Next
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav
          aria-label="Primary Workbench Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
        >
          <button
            type="button"
            onClick={() => setActiveTab('triangle')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'triangle'
                ? 'text-sky-400 border-sky-400'
                : 'border-transparent'
            }`}
          >
            Triangle &amp; LDF
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('methods')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'methods'
                ? 'text-sky-400 border-sky-400'
                : 'border-transparent'
            }`}
          >
            Method Blending
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ave_pyd')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'ave_pyd'
                ? 'text-sky-400 border-sky-400'
                : 'border-transparent'
            }`}
          >
            Actual vs. Expected &amp; PYD
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('diagnostics')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'diagnostics'
                ? 'text-sky-400 border-sky-400'
                : 'border-transparent'
            }`}
          >
            Diagnostics &amp; Bootstrap
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsAiDrawerOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Actuary Audit
          </button>
        </div>
      </header>

      {/* Main Workspace Container: Left Sidebar + Right Actuarial Workbench */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left Sidebar: Project & LoB Hierarchy Tree */}
        <aside
          aria-label="Project and Line of Business Hierarchy"
          className="w-full lg:w-68 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between shrink-0"
        >
          <div className="space-y-4">
            {/* Project Context Card */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Valuation Project</span>
                <button
                  type="button"
                  onClick={() => setIsLocked((prev) => !prev)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border transition-colors ${
                    isLocked
                      ? 'bg-amber-950/70 border-amber-600/60 text-amber-300'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  {isLocked ? 'Audit Locked' : 'Unlocked'}
                </button>
              </div>
              <div className="text-sm font-semibold text-slate-100">
                FY2026 Q1 IBNR Valuation
              </div>
              <div className="text-xs text-slate-400 font-mono tabular-nums">
                As of: 2026-03-31 · Unit: JPY M
              </div>
            </div>

            {/* Line of Business Hierarchy Tree */}
            <div>
              <div className="flex items-center gap-2 px-1 mb-2 text-xs font-semibold text-slate-300">
                <FolderTree className="w-4 h-4 text-sky-400" />
                <span>Line of Business Hierarchy</span>
              </div>

              <div className="space-y-3.5">
                {categories.map((cat) => (
                  <div key={cat.title} className="space-y-1">
                    <div className="px-2 text-[11px] font-medium text-slate-400">
                      {cat.title}
                    </div>
                    {cat.items.map((item) => {
                      const isSelected = item.id === selectedLobId;
                      const lobCalc = calculationsByLob[item.id];
                      const lobPyd = lobCalc?.ave_pyd_totals?.total_pyd || 0;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedLobId(item.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-sky-950/50 border-sky-500/60 text-slate-100'
                              : 'bg-slate-950/40 border-slate-800/80 text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">
                              {item.short_name}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums mt-0.5 flex items-center gap-1.5">
                              <span
                                className={
                                  lobPyd > 0 ? 'text-rose-300/90' : 'text-emerald-300/90'
                                }
                              >
                                PYD: {lobPyd > 0 ? `+${lobPyd}` : lobPyd}
                              </span>
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums shrink-0">
                            <div
                              className={`text-xs font-bold ${
                                isSelected ? 'text-emerald-300' : 'text-slate-200'
                              }`}
                            >
                              {lobCalc?.totals.selected_ibnr.toLocaleString('en-US')}
                            </div>
                            <div className="text-[10px] text-slate-400">IBNR (JPY M)</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Bottom Summary & Spec Launcher */}
          <div className="mt-5 pt-4 border-t border-slate-800 space-y-2.5">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono tabular-nums space-y-1.5">
              <div>
                <div className="text-[11px] font-sans text-slate-400">
                  Enterprise Pure IBNR (All-LoB)
                </div>
                <div className="text-base font-bold text-emerald-300">
                  {Math.round(totalEnterpriseIbnr * 10) / 10 > 0
                    ? totalEnterpriseIbnr.toLocaleString('en-US')
                    : '0'}{' '}
                  <span className="text-xs font-normal text-slate-400">JPY M</span>
                </div>
              </div>
              <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="font-sans text-[11px] text-slate-400">All-LoB PYD (17–25):</span>
                <span
                  className={`font-bold ${
                    totalEnterprisePyd > 0 ? 'text-rose-300' : 'text-emerald-300'
                  }`}
                >
                  {totalEnterprisePyd > 0
                    ? `+${totalEnterprisePyd.toLocaleString('en-US')}`
                    : totalEnterprisePyd.toLocaleString('en-US')}{' '}
                  JPY M
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsSpecModalOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors"
            >
              <FileCode className="w-3.5 h-3.5 text-sky-400" />
              View AGENTS.md &amp; Cloud Run Spec
            </button>
          </div>
        </aside>

        {/* Main Actuarial Workbench Viewport */}
        <main className="flex-1 min-w-0 p-4 lg:p-5 space-y-4 overflow-x-hidden">
          {/* Context Header & Executive KPI Strip */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span>FY2026 Q1 Statutory &amp; IFRS 17 Valuation</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span className="text-sky-300 font-medium">{currentSegment.name}</span>
                </div>
                <h1 className="text-lg font-bold text-slate-100 mt-0.5">
                  {currentSegment.name} — Actuarial Reserving Workbench
                </h1>
                <p className="text-xs text-slate-400 font-mono">
                  Source: {currentRecipe.custom_data?.sample_source || currentSegment.sample_source} · Active Paid LDF Basis:{' '}
                  {currentRecipe.paid_dev.average.toUpperCase()} · Tail:{' '}
                  {currentCalculation.paid_tail_factor.toFixed(4)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isLocked}
                  data-testid="open-data-import-modal"
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import Data (CSV / Paste)
                </button>

                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleResetCurrentLob}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset LoB Recipe
                </button>
              </div>
            </div>

            {/* 6-Metric Executive Summary Strip */}
            <div
              data-testid="executive-kpi-strip"
              className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 pt-2 border-t border-slate-800/80 font-mono tabular-nums"
            >
              <div className="p-2.5 bg-slate-950/90 border border-slate-800/90 rounded-lg">
                <div className="text-[11px] font-sans text-slate-400">Earned Premium</div>
                <div className="text-sm font-bold text-slate-100 mt-0.5">
                  {currentCalculation.totals.earned_premium.toLocaleString('en-US')}
                </div>
                <div className="text-[10px] text-slate-500">
                  Overall LR: {(currentCalculation.totals.overall_loss_ratio * 100).toFixed(1)}%
                </div>
              </div>

              <div className="p-2.5 bg-slate-950/90 border border-slate-800/90 rounded-lg">
                <div className="text-[11px] font-sans text-slate-400">Latest Cumulative Paid</div>
                <div className="text-sm font-bold text-slate-200 mt-0.5">
                  {currentCalculation.totals.latest_paid.toLocaleString('en-US')}
                </div>
                <div className="text-[10px] text-slate-400">
                  Case Reserve: {currentCalculation.totals.case_reserves.toLocaleString('en-US')}
                </div>
              </div>

              <div className="p-2.5 bg-sky-950/30 border border-sky-500/40 rounded-lg">
                <div className="text-[11px] font-sans text-sky-300">Selected Ultimate</div>
                <div
                  data-testid="kpi-selected-ultimate"
                  className="text-sm font-bold text-sky-200 mt-0.5"
                >
                  {currentCalculation.totals.selected_ultimate.toLocaleString('en-US')}
                </div>
                <div className="text-[10px] text-sky-300/80">
                  Cape Cod ELR: {(currentCalculation.cape_cod_elr * 100).toFixed(1)}%
                </div>
              </div>

              <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/40 rounded-lg">
                <div className="text-[11px] font-sans text-emerald-300">Selected Pure IBNR</div>
                <div
                  data-testid="kpi-selected-ibnr"
                  className="text-sm font-bold text-emerald-300 mt-0.5"
                >
                  {currentCalculation.totals.selected_ibnr.toLocaleString('en-US')}
                </div>
                <div className="text-[10px] text-emerald-300/80">
                  Total Reserve: {currentCalculation.totals.total_reserve.toLocaleString('en-US')}
                </div>
              </div>

              <div
                onClick={() => setActiveTab('ave_pyd')}
                className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  currentCalculation.ave_pyd_totals.total_pyd > 0
                    ? 'bg-rose-950/30 border-rose-500/40 hover:bg-rose-950/45'
                    : 'bg-emerald-950/30 border-emerald-500/40 hover:bg-emerald-950/45'
                }`}
              >
                <div className="text-[11px] font-sans text-slate-300">
                  Actual vs. Expected &amp; PYD
                </div>
                <div
                  data-testid="kpi-pyd"
                  className={`text-sm font-bold mt-0.5 ${
                    currentCalculation.ave_pyd_totals.total_pyd > 0
                      ? 'text-rose-300'
                      : 'text-emerald-300'
                  }`}
                >
                  Paid A/E: {(currentCalculation.ave_pyd_totals.ave_paid_ratio * 100).toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-300/90">
                  PYD:{' '}
                  {currentCalculation.ave_pyd_totals.total_pyd > 0
                    ? `+${currentCalculation.ave_pyd_totals.total_pyd.toLocaleString('en-US')}`
                    : currentCalculation.ave_pyd_totals.total_pyd.toLocaleString('en-US')}{' '}
                  JPY M
                </div>
              </div>

              <div className="p-2.5 bg-amber-950/25 border border-amber-500/40 rounded-lg">
                <div className="text-[11px] font-sans text-amber-300">Mack Standard Error</div>
                <div className="text-sm font-bold text-amber-200 mt-0.5">
                  ±{currentCalculation.totals.total_mack_std_error.toLocaleString('en-US')}
                </div>
                <div className="text-[10px] text-amber-300/80">
                  Mack CV: {(currentCalculation.totals.total_mack_cv * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Smart Actuarial Suggestions & What-If Impact Simulator */}
          <ActuarialSuggestionsPanel
            recipe={currentRecipe}
            calculation={currentCalculation}
            allRecipes={recipesByLob}
            allCalculations={calculationsByLob}
            isLocked={isLocked}
            activeTab={activeTab}
            onUpdateRecipe={handleUpdateRecipe}
            onBatchUpdateAllRecipes={handleBatchUpdateAllRecipes}
            onOpenAvePydTab={() => setActiveTab('ave_pyd')}
          />

          {/* Workbench Sub-Tab Switcher (Single-Row) */}
          <div
            role="tablist"
            aria-label="Actuarial Workbench Views"
            className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'triangle'}
              onClick={() => setActiveTab('triangle')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'triangle'
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              Tab 1: Triangle &amp; LDF Selection
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'methods'}
              onClick={() => setActiveTab('methods')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'methods'
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Tab 2: Method Comparison &amp; Blending
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'ave_pyd'}
              onClick={() => setActiveTab('ave_pyd')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'ave_pyd'
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Tab 3: Actual vs. Expected (AvE) &amp; PYD
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'diagnostics'}
              onClick={() => setActiveTab('diagnostics')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'diagnostics'
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Tab 4: Diagnostics, ODP Bootstrap &amp; Summary
            </button>
          </div>

          {/* Active Workbench Tab Content */}
          {activeTab === 'triangle' && (
            <TriangleLdfTab
              recipe={currentRecipe}
              calculation={currentCalculation}
              isLocked={isLocked}
              onUpdateRecipe={handleUpdateRecipe}
            />
          )}

          {activeTab === 'methods' && (
            <MethodComparisonTab
              recipe={currentRecipe}
              calculation={currentCalculation}
              allRecipes={recipesByLob}
              allCalculations={calculationsByLob}
              isLocked={isLocked}
              onUpdateRecipe={handleUpdateRecipe}
              onBatchUpdateAllRecipes={handleBatchUpdateAllRecipes}
              onSelectLob={(lobId) => setSelectedLobId(lobId)}
            />
          )}

          {activeTab === 'ave_pyd' && (
            <AvEPydTab
              calculation={currentCalculation}
              allCalculations={calculationsByLob}
              selectedLobId={selectedLobId}
              onSelectLob={(lobId) => setSelectedLobId(lobId)}
              onJumpToTab={(lobId, tab) => {
                setSelectedLobId(lobId);
                setActiveTab(tab);
              }}
            />
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticsSummaryTab
              recipe={currentRecipe}
              calculation={currentCalculation}
              allCalculations={calculationsByLob}
              onSelectLob={(lobId) => setSelectedLobId(lobId)}
              onDrillDownToTab={(lobId, tab) => {
                setSelectedLobId(lobId);
                setActiveTab(tab);
              }}
            />
          )}
        </main>
      </div>

      {/* Drawers & Modals */}
      <AiActuaryDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        recipe={currentRecipe}
        isLocked={isLocked}
        onUpdateRecipe={handleUpdateRecipe}
      />

      <ArchitectureSpecModal
        isOpen={isSpecModalOpen}
        onClose={() => setIsSpecModalOpen(false)}
      />

      <DataImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        recipe={currentRecipe}
        calculation={currentCalculation}
        isLocked={isLocked}
        onUpdateRecipe={handleUpdateRecipe}
      />
    </div>
  );
}
