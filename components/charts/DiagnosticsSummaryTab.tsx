'use client';

import React, { useState, useMemo } from 'react';
import {
  CalculationRecipe,
  CalculationResponse,
  BootstrapResponse,
  runBootstrapSimulation,
  computeCrossSegmentMovers,
  LOB_SEGMENTS,
} from '@/lib/actuarial-engine';
import {
  Download,
  Play,
  BarChart3,
  Activity,
  Layers,
  Flame,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Sliders,
  Grid,
  Filter,
  ShieldAlert,
} from 'lucide-react';

interface DiagnosticsSummaryTabProps {
  recipe: CalculationRecipe;
  calculation: CalculationResponse;
  allCalculations: Record<string, CalculationResponse>;
  onSelectLob?: (lobId: string) => void;
  onDrillDownToTab?: (
    lobId: string,
    tab: 'triangle' | 'methods' | 'ave_pyd' | 'diagnostics'
  ) => void;
}

type DiagnosticsSubView = 'all' | 'bootstrap' | 'pyd_heatmap';
type HeatmapMetricMode = 'pyd_amount' | 'pyd_lr_pts' | 'paid_ae';

export default function DiagnosticsSummaryTab({
  recipe,
  calculation,
  allCalculations,
  onSelectLob,
  onDrillDownToTab,
}: DiagnosticsSummaryTabProps) {
  const [subView, setSubView] = useState<DiagnosticsSubView>('all');
  const [nSims, setNSims] = useState<number>(5000);
  const [seed, setSeed] = useState<number>(42);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [bootstrapData, setBootstrapData] = useState<BootstrapResponse>(() =>
    runBootstrapSimulation(recipe, 5000, 42)
  );

  // Heatmap controls & drill-down state
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetricMode>('pyd_amount');
  const [highVarianceOnly, setHighVarianceOnly] = useState<boolean>(false);
  const [selectedCell, setSelectedCell] = useState<{ lobId: string; origin: string }>({
    lobId: calculation.lob_id,
    origin: '2024',
  });

  React.useEffect(() => {
    setBootstrapData(runBootstrapSimulation(recipe, nSims, seed));
  }, [recipe, nSims, seed]);

  // Compute cross-segment movers across all 4 LoBs x 9 Prior Accident Years (2017-2025)
  const { movers, enterpriseTotals } = useMemo(
    () => computeCrossSegmentMovers(allCalculations),
    [allCalculations]
  );

  const priorOrigins = ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  const lobOrder = ['auto_bi', 'auto_pd', 'fire_comm', 'casualty_gl'];

  // Maximum absolute PYD across all 36 cells for normalized color scaling
  const maxCellAbsPyd = useMemo(
    () => Math.max(...movers.map((m) => m.abs_pyd), 100),
    [movers]
  );

  // Currently drilled-down cell details
  const drilledCalculation =
    allCalculations[selectedCell.lobId] || calculation;
  const drilledOriginRow = useMemo(() => {
    return (
      drilledCalculation.ave_pyd_by_origin.find(
        (r) => r.origin === selectedCell.origin
      ) || drilledCalculation.ave_pyd_by_origin[drilledCalculation.ave_pyd_by_origin.length - 1]
    );
  }, [drilledCalculation, selectedCell.origin]);

  const drilledMover = useMemo(() => {
    return movers.find(
      (m) => m.lob_id === selectedCell.lobId && m.origin === selectedCell.origin
    );
  }, [movers, selectedCell]);

  // Red-to-Green color scale helper for PYD heatmap cells
  const getRedToGreenHeatmapClasses = (pyd: number, isSelected: boolean) => {
    const selectedRing = isSelected
      ? 'ring-2 ring-sky-400 border-sky-300 z-10 shadow-lg shadow-sky-950/60'
      : '';

    if (pyd >= 220) {
      return `bg-rose-900/85 border-rose-400/80 text-rose-100 hover:bg-rose-800/90 ${selectedRing}`;
    }
    if (pyd >= 120) {
      return `bg-rose-950/90 border-rose-500/65 text-rose-200 hover:bg-rose-900/75 ${selectedRing}`;
    }
    if (pyd >= 45) {
      return `bg-rose-950/55 border-rose-700/50 text-rose-200/95 hover:bg-rose-950/80 ${selectedRing}`;
    }
    if (pyd >= 10) {
      return `bg-rose-950/30 border-rose-800/40 text-rose-300/90 hover:bg-rose-950/50 ${selectedRing}`;
    }
    if (pyd <= -90) {
      return `bg-emerald-900/80 border-emerald-400/75 text-emerald-100 hover:bg-emerald-800/85 ${selectedRing}`;
    }
    if (pyd <= -35) {
      return `bg-emerald-950/80 border-emerald-500/60 text-emerald-200 hover:bg-emerald-900/70 ${selectedRing}`;
    }
    if (pyd <= -8) {
      return `bg-emerald-950/40 border-emerald-700/45 text-emerald-300 hover:bg-emerald-950/65 ${selectedRing}`;
    }
    return `bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800/80 ${selectedRing}`;
  };

  const formatSigned = (val: number, decimals = 1) => {
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(val * factor) / factor;
    const str = rounded.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return rounded > 0 ? `+${str}` : str;
  };

  const handleRunBootstrapApi = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe, n_sims: nSims, seed }),
      });
      if (res.ok) {
        const data: BootstrapResponse = await res.json();
        setBootstrapData(data);
      }
    } finally {
      setIsSimulating(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'LoB_ID',
      'LoB_Name',
      'Origin',
      'Earned_Premium',
      'Latest_Paid',
      'Latest_Incurred',
      'Case_Reserve',
      'Paid_CL_Ult',
      'Incurred_CL_Ult',
      'Paid_BF_Ult',
      'Incurred_BF_Ult',
      'Cape_Cod_Ult',
      'Selected_Ultimate',
      'Selected_IBNR',
      'Total_Reserve',
      'Ultimate_LR_Pct',
      'Mack_SE',
      'Mack_CV_Pct',
    ];

    const rows: string[][] = [headers];
    Object.values(allCalculations).forEach((calc) => {
      calc.origins.forEach((orig) => {
        rows.push([
          calc.lob_id,
          `"${calc.lob_name}"`,
          orig,
          String(calc.earned_premium[orig] || 0),
          String(calc.latest_paid[orig] || 0),
          String(calc.latest_incurred[orig] || 0),
          String(calc.case_reserves[orig] || 0),
          String(calc.ultimates_by_method.paid_cl[orig] || 0),
          String(calc.ultimates_by_method.incurred_cl[orig] || 0),
          String(calc.ultimates_by_method.paid_bf[orig] || 0),
          String(calc.ultimates_by_method.incurred_bf[orig] || 0),
          String(calc.ultimates_by_method.cape_cod[orig] || 0),
          String(calc.selected_ultimate[orig] || 0),
          String(calc.selected_ibnr[orig] || 0),
          String(calc.total_reserve[orig] || 0),
          ((calc.ultimate_loss_ratio[orig] || 0) * 100).toFixed(2),
          String(calc.mack_std_error[orig] || 0),
          ((calc.mack_cv[orig] || 0) * 100).toFixed(2),
        ]);
      });
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `resq_next_reserve_pack_2026Q1_${calculation.lob_id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const origins = calculation.origins;
  const maxOriginUlt = Math.max(
    ...origins.map((o) =>
      Math.max(
        calculation.ultimates_by_method.paid_cl[o] || 0,
        calculation.ultimates_by_method.incurred_cl[o] || 0,
        calculation.ultimates_by_method.paid_bf[o] || 0,
        calculation.ultimates_by_method.incurred_bf[o] || 0,
        calculation.selected_ultimate[o] || 0
      )
    ),
    1000
  );

  const maxHistCount = Math.max(...bootstrapData.histogram.map((h) => h.count), 1);

  // Compute continuous X-coordinate mapping for Solvency Percentile Markers on the Histogram SVG
  const histRange = useMemo(() => {
    const bins = bootstrapData.histogram;
    if (!bins.length) {
      return { minVal: 0, maxVal: 1, getX: () => 50 };
    }
    const minVal = bins[0].bin_start;
    const maxVal = bins[bins.length - 1].bin_end;
    const span = Math.max(1, maxVal - minVal);
    // Histogram bars span from x = 48 to x = 48 + 24 * 31 = 792 (width = 744)
    const chartLeft = 48;
    const chartWidth = 24 * 31 - 4;
    const getX = (val: number) => {
      const clamped = Math.max(minVal, Math.min(maxVal, val));
      return chartLeft + ((clamped - minVal) / span) * chartWidth;
    };
    return { minVal, maxVal, getX };
  }, [bootstrapData.histogram]);

  const lobList = Object.values(allCalculations);
  const grandTotalEp = lobList.reduce((a, c) => a + c.totals.earned_premium, 0);
  const grandTotalPaid = lobList.reduce((a, c) => a + c.totals.latest_paid, 0);
  const grandTotalUlt = lobList.reduce((a, c) => a + c.totals.selected_ultimate, 0);
  const grandTotalIbnr = lobList.reduce((a, c) => a + c.totals.selected_ibnr, 0);
  const sumVar = lobList.reduce(
    (a, c) => a + Math.pow(c.totals.total_mack_std_error, 2),
    0
  );
  const undiversifiedSe = lobList.reduce((a, c) => a + c.totals.total_mack_std_error, 0);
  const diversifiedSe = Math.round(Math.sqrt(sumVar * 1.25) * 10) / 10;

  return (
    <div className="space-y-5">
      {/* Diagnostics & Bootstrap Internal Sub-Tab Bar */}
      <div
        role="tablist"
        aria-label="Diagnostics and Bootstrap Sub-Views"
        className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-2.5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={subView === 'all'}
            data-testid="diag-subtab-all"
            onClick={() => setSubView('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              subView === 'all'
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            All Diagnostics &amp; Bootstrap
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subView === 'bootstrap'}
            data-testid="diag-subtab-bootstrap"
            onClick={() => setSubView('bootstrap')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              subView === 'bootstrap'
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            ODP Bootstrap Simulation (5,000 Iterations &amp; Solvency VaR)
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subView === 'pyd_heatmap'}
            data-testid="diag-subtab-heatmap"
            onClick={() => setSubView('pyd_heatmap')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              subView === 'pyd_heatmap'
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            PYD Heatmap Grid &amp; Method Curves
          </button>
        </div>

        <div className="text-xs font-mono text-slate-400 px-2">
          Active Stochastics: <span className="text-sky-300 font-semibold">ODP Bootstrap ({bootstrapData.n_sims.toLocaleString('en-US')} iterations)</span> · 99.5% VaR: <span className="text-rose-300 font-semibold">{bootstrapData.percentiles.p99_5.toLocaleString('en-US')} JPY M</span>
        </div>
      </div>

      {/* SECTION A: ODP Bootstrap Stochastic Simulation (5,000 Iterations) & Solvency Percentile Markers */}
      {(subView === 'bootstrap' || subView === 'all') && (
        <div
          data-testid="odp-bootstrap-simulation-section"
          className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Stochastic ODP Bootstrap Reserve Simulation ({bootstrapData.n_sims.toLocaleString('en-US')} Iterations) — {calculation.lob_name}
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-sky-950/90 border border-sky-500/40 text-sky-200 rounded">
                  chainladder.BootstrapODPSample(n_sims={bootstrapData.n_sims})
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Over-Dispersed Poisson (ODP) Bootstrap IBNR distribution histogram with Solvency II &amp; IFRS 17 percentile markers (75%, 95%, 99.5% VaR)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <span>Iterations:</span>
                <select
                  aria-label="Bootstrap Simulation Count"
                  value={nSims}
                  onChange={(e) => setNSims(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100"
                >
                  <option value={1000}>1,000 iterations</option>
                  <option value={5000}>5,000 iterations (Standard)</option>
                  <option value={10000}>10,000 iterations (High Precision)</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300">
                <span>Random Seed:</span>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 42)}
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-100"
                />
              </label>

              <button
                type="button"
                onClick={handleRunBootstrapApi}
                disabled={isSimulating}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                {isSimulating ? 'Simulating...' : 'Run 5,000 ODP Bootstrap'}
              </button>
            </div>
          </div>

          {/* Solvency Percentile KPI Cards (Mean, Median, 75%, 95%, 99.5%, SCR) */}
          <div
            data-testid="bootstrap-kpi-strip"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono tabular-nums"
          >
            <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-lg">
              <div className="text-[11px] font-sans text-slate-400">Mean Best Estimate</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">
                {bootstrapData.mean_ibnr.toLocaleString('en-US')}{' '}
                <span className="text-xs font-normal text-slate-400">JPY M</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                SD: ±{bootstrapData.std_dev.toLocaleString('en-US')} (CV {(bootstrapData.cv * 100).toFixed(1)}%)
              </div>
            </div>

            <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-lg">
              <div className="text-[11px] font-sans text-slate-400">50th Percentile (Median)</div>
              <div className="text-base font-bold text-slate-200 mt-0.5">
                {bootstrapData.percentiles.p50.toLocaleString('en-US')}{' '}
                <span className="text-xs font-normal text-slate-400">JPY M</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Skewness: +{bootstrapData.skewness.toFixed(2)}
              </div>
            </div>

            <div className="p-3 bg-sky-950/35 border border-sky-500/50 rounded-lg">
              <div className="text-[11px] font-sans font-semibold text-sky-300">
                75th Percentile (IFRS 17 RA)
              </div>
              <div
                data-testid="bootstrap-p75"
                className="text-base font-bold text-sky-200 mt-0.5"
              >
                {bootstrapData.percentiles.p75.toLocaleString('en-US')}{' '}
                <span className="text-xs font-normal text-sky-300/70">JPY M</span>
              </div>
              <div className="text-[11px] text-sky-300/90 mt-0.5">
                Risk Margin (75%): +{bootstrapData.risk_margin_75.toLocaleString('en-US')}
              </div>
            </div>

            <div className="p-3 bg-amber-950/35 border border-amber-500/50 rounded-lg">
              <div className="text-[11px] font-sans font-semibold text-amber-300">
                95th Percentile (Internal VaR)
              </div>
              <div
                data-testid="bootstrap-p95"
                className="text-base font-bold text-amber-200 mt-0.5"
              >
                {bootstrapData.percentiles.p95.toLocaleString('en-US')}{' '}
                <span className="text-xs font-normal text-amber-300/70">JPY M</span>
              </div>
              <div className="text-[11px] text-amber-300/90 mt-0.5">
                1-in-20 Yr Tail: +{(bootstrapData.percentiles.p95 - bootstrapData.mean_ibnr).toFixed(1)}
              </div>
            </div>

            <div className="p-3 bg-rose-950/40 border border-rose-500/55 rounded-lg">
              <div className="text-[11px] font-sans font-semibold text-rose-300">
                99.5th Percentile (Solvency II)
              </div>
              <div
                data-testid="bootstrap-p995"
                className="text-base font-bold text-rose-200 mt-0.5"
              >
                {bootstrapData.percentiles.p99_5.toLocaleString('en-US')}{' '}
                <span className="text-xs font-normal text-rose-300/70">JPY M</span>
              </div>
              <div className="text-[11px] text-rose-300/90 mt-0.5">
                1-in-200 Yr Solvency VaR
              </div>
            </div>

            <div className="p-3 bg-emerald-950/30 border border-emerald-500/45 rounded-lg">
              <div className="text-[11px] font-sans font-semibold text-emerald-300">
                Reserve Risk SCR (99.5% - Mean)
              </div>
              <div className="text-base font-bold text-emerald-200 mt-0.5">
                +{bootstrapData.solvency_scr_99_5.toLocaleString('en-US')}{' '}
                <span className="text-xs font-normal text-emerald-300/70">JPY M</span>
              </div>
              <div className="text-[11px] text-emerald-300/90 mt-0.5">
                Economic Capital Requirement
              </div>
            </div>
          </div>

          {/* IBNR Distribution Histogram SVG with Explicit Solvency Percentile Markers (75%, 95%, 99.5%) */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-semibold text-slate-200">
                Simulated IBNR Reserve Distribution Histogram ({bootstrapData.n_sims.toLocaleString('en-US')} ODP Bootstrap Iterations)
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
                <span className="inline-flex items-center gap-1.5 text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-xs bg-sky-600 inline-block" /> Core (&lt;75%)
                </span>
                <span className="inline-flex items-center gap-1.5 text-sky-300 font-semibold">
                  <span className="w-3 h-0.5 bg-sky-400 inline-block" /> 75% Percentile ({bootstrapData.percentiles.p75.toLocaleString('en-US')})
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-300 font-semibold">
                  <span className="w-3 h-0.5 bg-amber-400 inline-block" /> 95% Percentile ({bootstrapData.percentiles.p95.toLocaleString('en-US')})
                </span>
                <span className="inline-flex items-center gap-1.5 text-rose-300 font-semibold">
                  <span className="w-3 h-0.5 bg-rose-400 inline-block" /> 99.5% Solvency II ({bootstrapData.percentiles.p99_5.toLocaleString('en-US')})
                </span>
              </div>
            </div>

            <div className="h-64 w-full pt-1">
              <svg
                data-testid="odp-bootstrap-histogram-svg"
                viewBox="0 0 840 230"
                className="w-full h-full overflow-visible font-mono text-[10px]"
                role="img"
                aria-label="ODP Bootstrap Reserve Distribution Histogram with 75%, 95%, and 99.5% Solvency Percentile Markers"
              >
                {/* Horizontal Reference Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                  const y = 192 - t * 144;
                  const countVal = Math.round(t * maxHistCount);
                  return (
                    <g key={idx}>
                      <line
                        x1={44}
                        y1={y}
                        x2={800}
                        y2={y}
                        stroke="#1e293b"
                        strokeDasharray={t === 0 ? undefined : '3 3'}
                      />
                      <text x={38} y={y + 3} textAnchor="end" fill="#64748b">
                        {countVal}
                      </text>
                    </g>
                  );
                })}

                {/* Histogram Bars (24 Bins) */}
                {bootstrapData.histogram.map((bin, idx) => {
                  const barW = 27;
                  const x = 48 + idx * 31;
                  const h = Math.max(2, (bin.count / maxHistCount) * 144);
                  const y = 192 - h;
                  const binMid = (bin.bin_start + bin.bin_end) / 2;

                  const isTail995 = binMid >= bootstrapData.percentiles.p99_5;
                  const isTail95 =
                    binMid >= bootstrapData.percentiles.p95 &&
                    binMid < bootstrapData.percentiles.p99_5;
                  const isTail75 =
                    binMid >= bootstrapData.percentiles.p75 &&
                    binMid < bootstrapData.percentiles.p95;

                  const fill = isTail995
                    ? '#f43f5e'
                    : isTail95
                    ? '#f59e0b'
                    : isTail75
                    ? '#38bdf8'
                    : '#0284c7';

                  return (
                    <g key={idx}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={h}
                        rx={1.5}
                        fill={fill}
                        fillOpacity={isTail995 || isTail95 ? 0.92 : 0.82}
                      >
                        <title>{`${bin.bin_start.toLocaleString('en-US')}–${bin.bin_end.toLocaleString('en-US')} JPY M: ${bin.count} iterations (${bin.frequency}%)`}</title>
                      </rect>
                      {idx % 3 === 0 && (
                        <text x={x + barW / 2} y={210} textAnchor="middle" fill="#94a3b8">
                          {bin.bin_label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Baseline X-axis */}
                <line x1={44} y1={192} x2={800} y2={192} stroke="#334155" strokeWidth={1.5} />

                {/* Vertical Solvency Percentile Markers: Mean, 75%, 95%, 99.5% */}
                {(() => {
                  const markers = [
                    {
                      id: 'mean',
                      label: `Mean: ${bootstrapData.mean_ibnr.toLocaleString('en-US')}`,
                      x: histRange.getX(bootstrapData.mean_ibnr),
                      color: '#cbd5e1',
                      bgFill: '#0f172a',
                      badgeY: 28,
                    },
                    {
                      id: 'p75',
                      label: `75% (IFRS 17): ${bootstrapData.percentiles.p75.toLocaleString('en-US')}`,
                      x: histRange.getX(bootstrapData.percentiles.p75),
                      color: '#38bdf8',
                      bgFill: '#082f49',
                      badgeY: 10,
                    },
                    {
                      id: 'p95',
                      label: `95% VaR: ${bootstrapData.percentiles.p95.toLocaleString('en-US')}`,
                      x: histRange.getX(bootstrapData.percentiles.p95),
                      color: '#fbbf24',
                      bgFill: '#451a03',
                      badgeY: 28,
                    },
                    {
                      id: 'p995',
                      label: `99.5% Solvency II: ${bootstrapData.percentiles.p99_5.toLocaleString('en-US')}`,
                      x: histRange.getX(bootstrapData.percentiles.p99_5),
                      color: '#fb7185',
                      bgFill: '#4c0519',
                      badgeY: 10,
                    },
                  ];

                  return markers.map((m) => {
                    const badgeW = m.label.length * 5.8 + 12;
                    const clampedBadgeX = Math.max(
                      46,
                      Math.min(798 - badgeW, m.x - badgeW / 2)
                    );
                    return (
                      <g key={m.id} data-testid={`histogram-marker-${m.id}`}>
                        <line
                          x1={m.x}
                          y1={m.badgeY + 16}
                          x2={m.x}
                          y2={192}
                          stroke={m.color}
                          strokeWidth={2}
                          strokeDasharray="4 3"
                        />
                        <circle cx={m.x} cy={192} r={3.5} fill={m.color} />
                        <rect
                          x={clampedBadgeX}
                          y={m.badgeY}
                          width={badgeW}
                          height={16}
                          rx={3}
                          fill={m.bgFill}
                          stroke={m.color}
                          strokeWidth={1}
                        />
                        <text
                          x={clampedBadgeX + badgeW / 2}
                          y={m.badgeY + 11}
                          textAnchor="middle"
                          fill={m.color}
                          fontWeight="bold"
                          fontSize={9.5}
                        >
                          {m.label}
                        </text>
                      </g>
                    );
                  });
                })()}
              </svg>
            </div>
          </div>

          {/* Accident Year Stochastic Percentile Breakdown Table (When in dedicated Bootstrap sub-tab) */}
          {subView === 'bootstrap' && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">
                  Accident Year Stochastic IBNR Percentiles ({bootstrapData.n_sims.toLocaleString('en-US')} Iterations — Unit: JPY M)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  75% IFRS 17 Risk Adjustment · 95% Internal VaR · 99.5% Solvency II SCR
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono tabular-nums border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                      <th className="py-2 px-3 text-left font-sans">Origin Year</th>
                      <th className="py-2 px-3 text-right">Deterministic IBNR</th>
                      <th className="py-2 px-3 text-right text-slate-200">Bootstrap Mean</th>
                      <th className="py-2 px-3 text-right">Bootstrap SD</th>
                      <th className="py-2 px-3 text-right text-sky-300 font-semibold">75th Percentile (IFRS 17)</th>
                      <th className="py-2 px-3 text-right text-amber-300 font-semibold">95th Percentile (VaR)</th>
                      <th className="py-2 px-3 text-right text-rose-300 font-semibold">99.5th Percentile (Solvency II)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {bootstrapData.origin_percentiles.map((op) => {
                      const detIbnr = calculation.selected_ibnr[op.origin] || 0;
                      return (
                        <tr key={op.origin} className="hover:bg-slate-900/60">
                          <td className="py-2 px-3 font-bold text-slate-200">AY {op.origin}</td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {detIbnr.toLocaleString('en-US')}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-100">
                            {op.mean.toLocaleString('en-US')}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-400">
                            ±{op.std_dev.toLocaleString('en-US')}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-sky-300">
                            {op.p75.toLocaleString('en-US')}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-amber-300">
                            {op.p95.toLocaleString('en-US')}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-rose-300">
                            {op.p99_5.toLocaleString('en-US')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION B: Prior Year Development (PYD) Cross-Segment Heatmap Grid (Line of Business x Origin Year) & Immediate Drill-Down */}
      {(subView === 'all' || subView === 'pyd_heatmap') && (
        <div
          data-testid="diagnostics-pyd-heatmap-section"
          className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden"
        >
          {/* Section Header & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 bg-slate-950/70 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Prior Year Development (PYD) Heatmap Grid — Line of Business × Origin Year (AY 2017–2025)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded">
                  Net Enterprise PYD: {formatSigned(enterpriseTotals.total_pyd)} JPY M
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Red-to-Green diverging scale highlights adverse reserve strengthening (Red) vs. favorable reserve release (Green). Click any cell to drill down into segment drivers.
              </p>
            </div>

            {/* Metric Switcher & High-Variance Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Heatmap Cell Metric"
                className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs"
              >
                <button
                  type="button"
                  onClick={() => setHeatmapMetric('pyd_amount')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    heatmapMetric === 'pyd_amount'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  PYD (JPY M)
                </button>
                <button
                  type="button"
                  onClick={() => setHeatmapMetric('pyd_lr_pts')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    heatmapMetric === 'pyd_lr_pts'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  PYD (LR Pts)
                </button>
                <button
                  type="button"
                  onClick={() => setHeatmapMetric('paid_ae')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    heatmapMetric === 'paid_ae'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Paid A/E %
                </button>
              </div>

              <button
                type="button"
                onClick={() => setHighVarianceOnly((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  highVarianceOnly
                    ? 'bg-amber-950/70 border-amber-500/60 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                {highVarianceOnly ? 'Showing |PYD| ≥ 80 JPY M' : 'Highlight High-Variance (≥80)'}
              </button>
            </div>
          </div>

          {/* Red-to-Green Color Scale Legend Bar */}
          <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-slate-400 font-medium">Diverging Scale (PYD):</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-900/80 border border-emerald-400/70 text-emerald-100">
                ≤ -90 (Strong Favorable)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-600/50 text-emerald-200">
                -90 to -10 (Favorable)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                ±10 (Neutral)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-950/60 border border-rose-600/50 text-rose-200">
                +10 to +120 (Adverse)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-950/90 border border-rose-500/65 text-rose-200">
                +120 to +220 (High Adverse)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-900/85 border border-rose-400/80 text-rose-100 font-bold">
                ≥ +220 JPY M (Severe Adverse)
              </span>
            </div>
            <div className="text-slate-400 font-sans">
              Adverse Segments: <strong className="text-rose-300 font-mono">{enterpriseTotals.adverse_segments_count}</strong> · Favorable Segments: <strong className="text-emerald-300 font-mono">{enterpriseTotals.favorable_segments_count}</strong>
            </div>
          </div>

          {/* Full-Width 4x9 Heatmap Matrix + Immediate Segment Drill-Down Inspector */}
          <div className="p-4 space-y-4">
            <div className="overflow-x-auto">
              <table
                data-testid="diagnostics-pyd-heatmap-table"
                className="w-full text-xs border-collapse font-mono tabular-nums"
              >
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="py-2 px-2.5 text-left font-sans font-semibold text-slate-200">
                      Line of Business \ Origin Year
                    </th>
                    {priorOrigins.map((orig) => (
                      <th key={orig} className="py-2 px-1.5 text-center font-semibold">
                        AY {orig}
                      </th>
                    ))}
                    <th className="py-2 px-2.5 text-right font-semibold text-slate-200 bg-slate-950">
                      Total LoB PYD
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {lobOrder.map((lobId) => {
                    const lobCalc = allCalculations[lobId];
                    if (!lobCalc) return null;
                    const lobMeta = LOB_SEGMENTS[lobId];
                    const isCurrentLob = lobId === calculation.lob_id;
                    const lobTotalPyd = lobCalc.ave_pyd_totals.total_pyd;
                    const lobPaidAe = lobCalc.ave_pyd_totals.ave_paid_ratio * 100;

                    return (
                      <tr
                        key={lobId}
                        className={isCurrentLob ? 'bg-sky-950/15' : 'bg-slate-950/30'}
                      >
                        <td className="py-2 px-2.5 font-sans whitespace-nowrap border-r border-slate-800/80">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCell((prev) => ({ ...prev, lobId }));
                              onSelectLob?.(lobId);
                            }}
                            className="text-left group"
                          >
                            <div className="font-semibold text-slate-100 group-hover:text-sky-300 transition-colors flex items-center gap-1.5">
                              <span>{lobMeta?.short_name || lobCalc.lob_name}</span>
                              {isCurrentLob && (
                                <span className="px-1.5 py-0.2 text-[9px] font-mono bg-sky-500/20 border border-sky-400/40 text-sky-300 rounded">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              Paid A/E: {lobPaidAe.toFixed(1)}%
                            </div>
                          </button>
                        </td>

                        {priorOrigins.map((orig) => {
                          const row = lobCalc.ave_pyd_by_origin.find((r) => r.origin === orig);
                          if (!row) {
                            return (
                              <td key={orig} className="p-1 text-center text-slate-600">
                                —
                              </td>
                            );
                          }

                          const pyd = row.pyd_ultimate;
                          const lrPts = row.pyd_lr_impact * 100;
                          const absPyd = Math.abs(pyd);
                          const isDimmed = highVarianceOnly && absPyd < 80;
                          const isSelected =
                            selectedCell.lobId === lobId && selectedCell.origin === orig;
                          const cellColorClasses = getRedToGreenHeatmapClasses(pyd, isSelected);
                          const barWidthPct = Math.min(100, Math.round((absPyd / maxCellAbsPyd) * 100));

                          return (
                            <td key={orig} className="p-1">
                              <button
                                type="button"
                                data-testid={`diag-heatmap-cell-${lobId}-${orig}`}
                                onClick={() => {
                                  setSelectedCell({ lobId, origin: orig });
                                  onSelectLob?.(lobId);
                                }}
                                className={`w-full rounded-md border px-1.5 py-1.5 text-right transition-all cursor-pointer relative overflow-hidden ${cellColorClasses} ${
                                  isDimmed ? 'opacity-25' : 'opacity-100'
                                }`}
                                title={`${lobCalc.lob_name} · AY ${orig} | PYD: ${formatSigned(pyd)} JPY M (${formatSigned(lrPts)} LR pts) | Paid A/E: ${(row.ave_paid_ratio * 100).toFixed(1)}%`}
                              >
                                <div className="text-[11px] font-bold leading-tight">
                                  {heatmapMetric === 'pyd_amount' && formatSigned(pyd)}
                                  {heatmapMetric === 'pyd_lr_pts' && `${formatSigned(lrPts)}%`}
                                  {heatmapMetric === 'paid_ae' && `${(row.ave_paid_ratio * 100).toFixed(1)}%`}
                                </div>
                                <div className="text-[9px] opacity-85 mt-0.5 leading-tight">
                                  {heatmapMetric === 'pyd_amount' && `${formatSigned(lrPts)}pt`}
                                  {heatmapMetric === 'pyd_lr_pts' && `${formatSigned(pyd)}M`}
                                  {heatmapMetric === 'paid_ae' && `PYD ${formatSigned(pyd)}`}
                                </div>
                                <div className="w-full h-1 bg-slate-950/50 rounded-full overflow-hidden mt-1">
                                  <div
                                    className={`h-full ${
                                      pyd > 0 ? 'bg-rose-400' : 'bg-emerald-400'
                                    }`}
                                    style={{ width: `${barWidthPct}%` }}
                                  />
                                </div>
                              </button>
                            </td>
                          );
                        })}

                        <td className="py-2 px-2.5 text-right bg-slate-950/60 border-l border-slate-800/80 whitespace-nowrap">
                          <div
                            className={`text-xs font-bold ${
                              lobTotalPyd > 0 ? 'text-rose-300' : 'text-emerald-300'
                            }`}
                          >
                            {formatSigned(lobTotalPyd)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {formatSigned(lobCalc.ave_pyd_totals.total_pyd_pct * 100)}% vs Prior
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  <tr className="bg-slate-950 font-bold border-t-2 border-slate-700 text-slate-100">
                    <td className="py-2 px-2.5 font-sans text-xs text-slate-300 border-r border-slate-800">
                      All-LoB Origin Total PYD
                    </td>
                    {priorOrigins.map((orig) => {
                      const colPyd =
                        Math.round(
                          lobOrder.reduce((sum, lobId) => {
                            const r = allCalculations[lobId]?.ave_pyd_by_origin.find(
                              (x) => x.origin === orig
                            );
                            return sum + (r ? r.pyd_ultimate : 0);
                          }, 0) * 10
                        ) / 10;
                      return (
                        <td
                          key={orig}
                          className={`py-2 px-1.5 text-right text-xs ${
                            colPyd > 0 ? 'text-rose-300' : colPyd < 0 ? 'text-emerald-300' : 'text-slate-400'
                          }`}
                        >
                          {formatSigned(colPyd)}
                        </td>
                      );
                    })}
                    <td
                      className={`py-2 px-2.5 text-right text-xs border-l border-slate-800 whitespace-nowrap ${
                        enterpriseTotals.total_pyd > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatSigned(enterpriseTotals.total_pyd)} JPY M
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Immediate High-Variance Segment Drill-Down Inspector Bar */}
            <div
              data-testid="diagnostics-segment-drilldown"
              className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3"
            >
              {drilledOriginRow && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-sky-950/80 border border-sky-500/40 text-sky-300 rounded font-semibold">
                        Selected Segment Drill-Down
                      </span>
                      <h3 className="text-sm font-bold text-slate-100">
                        {LOB_SEGMENTS[selectedCell.lobId]?.short_name || drilledCalculation.lob_name} · Accident Year{' '}
                        {drilledOriginRow.origin} ({drilledOriginRow.dev_from}→{drilledOriginRow.dev_to}M)
                      </h3>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border shrink-0 inline-flex items-center gap-1 ${
                          drilledOriginRow.pyd_ultimate >= 100
                            ? 'bg-rose-950/90 border-rose-500/60 text-rose-200'
                            : drilledOriginRow.pyd_ultimate > 0
                            ? 'bg-rose-950/50 border-rose-700/50 text-rose-300'
                            : 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                        }`}
                      >
                        {drilledOriginRow.pyd_ultimate > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {drilledOriginRow.pyd_ultimate >= 120
                          ? 'HIGH ADVERSE'
                          : drilledOriginRow.pyd_ultimate > 0
                          ? 'ADVERSE DEV'
                          : 'FAVORABLE RELEASE'}
                      </span>
                    </div>

                    {onDrillDownToTab && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onDrillDownToTab(selectedCell.lobId, 'triangle')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Grid className="w-3.5 h-3.5" />
                          Inspect LDFs (Tab 1)
                        </button>
                        <button
                          type="button"
                          onClick={() => onDrillDownToTab(selectedCell.lobId, 'methods')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Sliders className="w-3.5 h-3.5 text-sky-400" />
                          Re-Blend Weights (Tab 2)
                        </button>
                        <button
                          type="button"
                          onClick={() => onDrillDownToTab(selectedCell.lobId, 'ave_pyd')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-500/30 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <span>Full AvE &amp; PYD Table (Tab 3)</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 font-mono tabular-nums text-xs">
                    <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg">
                      <div className="text-[10px] font-sans text-slate-400">
                        Prior Year Dev (PYD)
                      </div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          drilledOriginRow.pyd_ultimate > 0 ? 'text-rose-300' : 'text-emerald-300'
                        }`}
                      >
                        {formatSigned(drilledOriginRow.pyd_ultimate)} JPY M
                      </div>
                      <div className="text-[10px] text-slate-400">
                        LR Impact: {formatSigned(drilledOriginRow.pyd_lr_impact * 100)} pts
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg">
                      <div className="text-[10px] font-sans text-slate-400">
                        CY 2026 Paid A/E Ratio
                      </div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          drilledOriginRow.ave_paid_ratio > 1.03
                            ? 'text-rose-300'
                            : drilledOriginRow.ave_paid_ratio < 0.97
                            ? 'text-emerald-300'
                            : 'text-sky-200'
                        }`}
                      >
                        {(drilledOriginRow.ave_paid_ratio * 100).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-400">
                        AvE Diff: {formatSigned(drilledOriginRow.ave_paid_diff)} JPY M
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg">
                      <div className="text-[10px] font-sans text-slate-400">
                        CY 2026 Incurred A/E
                      </div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          drilledOriginRow.ave_incurred_ratio > 1.03
                            ? 'text-rose-300'
                            : 'text-emerald-300'
                        }`}
                      >
                        {(drilledOriginRow.ave_incurred_ratio * 100).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Diff: {formatSigned(drilledOriginRow.ave_incurred_diff)} JPY M
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg">
                      <div className="text-[10px] font-sans text-slate-400">
                        Prior → Current Ultimate
                      </div>
                      <div className="text-xs font-bold text-slate-200 mt-0.5">
                        {drilledOriginRow.prior_ultimate.toLocaleString('en-US')} →{' '}
                        <span className="text-sky-300">
                          {drilledOriginRow.current_ultimate.toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Ult LR:{' '}
                        {(
                          (drilledOriginRow.prior_ultimate /
                            Math.max(1, drilledOriginRow.earned_premium)) *
                          100
                        ).toFixed(1)}
                        % →{' '}
                        {(
                          (drilledOriginRow.current_ultimate /
                            Math.max(1, drilledOriginRow.earned_premium)) *
                          100
                        ).toFixed(1)}
                        %
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg">
                      <div className="text-[10px] font-sans text-slate-400">
                        Method Ultimates (CL / BF / CC)
                      </div>
                      <div className="text-xs font-bold text-slate-200 mt-0.5">
                        {(
                          drilledCalculation.ultimates_by_method.paid_cl[drilledOriginRow.origin] || 0
                        ).toLocaleString('en-US')}{' '}
                        /{' '}
                        <span className="text-emerald-300">
                          {(
                            drilledCalculation.ultimates_by_method.incurred_bf[
                              drilledOriginRow.origin
                            ] || 0
                          ).toLocaleString('en-US')}
                        </span>{' '}
                        /{' '}
                        <span className="text-amber-300">
                          {(
                            drilledCalculation.ultimates_by_method.cape_cod[
                              drilledOriginRow.origin
                            ] || 0
                          ).toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {drilledMover?.driver_note || 'Standard chainladder development'}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION C: Ultimate Comparison Chart & CDF Development Curve */}
      {(subView === 'all' || subView === 'pyd_heatmap') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-sky-400" />
                  Ultimate by Method Comparison Across Accident Years ({calculation.lob_name})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Comparison of Paid CL, Incurred CL, Paid BF, Incurred BF, and Selected Ultimate (Unit: JPY M)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 mb-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-slate-500 rounded-xs" /> Paid CL
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-indigo-500 rounded-xs" /> Incurred CL
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-amber-500 rounded-xs" /> Paid BF
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-xs" /> Incurred BF
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-sky-300">
                <span className="w-2.5 h-2.5 bg-sky-400 rounded-xs" /> Selected Ultimate
              </span>
            </div>

            <div className="h-56 w-full pt-1">
              <svg
                viewBox="0 0 640 220"
                className="w-full h-full overflow-visible font-mono text-[10px]"
                role="img"
                aria-label="Ultimate by Method Comparison Bar Chart"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                  const y = 188 - t * 162;
                  const val = Math.round(t * maxOriginUlt);
                  return (
                    <g key={idx}>
                      <line
                        x1={48}
                        y1={y}
                        x2={625}
                        y2={y}
                        stroke="#1e293b"
                        strokeDasharray={t === 0 ? undefined : '3 3'}
                      />
                      <text x={42} y={y + 3} textAnchor="end" fill="#64748b">
                        {val.toLocaleString('en-US')}
                      </text>
                    </g>
                  );
                })}

                {origins.map((orig, i) => {
                  const groupX = 58 + i * 56;
                  const pCl = calculation.ultimates_by_method.paid_cl[orig] || 0;
                  const iCl = calculation.ultimates_by_method.incurred_cl[orig] || 0;
                  const pBf = calculation.ultimates_by_method.paid_bf[orig] || 0;
                  const iBf = calculation.ultimates_by_method.incurred_bf[orig] || 0;
                  const sel = calculation.selected_ultimate[orig] || 0;

                  const bars = [
                    { val: pCl, fill: '#64748b' },
                    { val: iCl, fill: '#6366f1' },
                    { val: pBf, fill: '#f59e0b' },
                    { val: iBf, fill: '#10b981' },
                    { val: sel, fill: '#38bdf8' },
                  ];

                  return (
                    <g key={orig}>
                      {bars.map((b, bIdx) => {
                        const h = Math.max(2, (b.val / maxOriginUlt) * 162);
                        const y = 188 - h;
                        return (
                          <rect
                            key={bIdx}
                            x={groupX + bIdx * 8.5}
                            y={y}
                            width={7.5}
                            height={h}
                            fill={b.fill}
                            rx={1}
                          >
                            <title>{`${orig}: ${b.val.toLocaleString('en-US')} JPY M`}</title>
                          </rect>
                        );
                      })}
                      <text x={groupX + 21} y={206} textAnchor="middle" fill="#94a3b8">
                        {orig}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Development Progression &amp; CDF Maturity Curve
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Implied emergence pattern (1 / CDF %) across 12M–120M development horizons for Paid vs. Incurred
                </p>
              </div>
            </div>

            <div className="flex items-center gap-5 text-xs text-slate-300 mb-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-sky-400 inline-block" /> Paid Maturity (% of Ultimate)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Incurred Maturity (% of Ultimate)
              </span>
            </div>

            <div className="h-56 w-full pt-1">
              <svg
                viewBox="0 0 640 220"
                className="w-full h-full overflow-visible font-mono text-[10px]"
                role="img"
                aria-label="Development Progression Maturity Curve"
              >
                {[0, 25, 50, 75, 100].map((pct) => {
                  const y = 188 - (pct / 100) * 162;
                  return (
                    <g key={pct}>
                      <line
                        x1={48}
                        y1={y}
                        x2={620}
                        y2={y}
                        stroke="#1e293b"
                        strokeDasharray={pct === 0 ? undefined : '3 3'}
                      />
                      <text x={42} y={y + 3} textAnchor="end" fill="#64748b">
                        {pct}%
                      </text>
                    </g>
                  );
                })}

                {(() => {
                  const paidPts = calculation.developments.map((d, j) => {
                    const x = 65 + j * 60;
                    const cdf = calculation.paid_cdf[j] || 1;
                    const pct = Math.min(100, (1 / cdf) * 100);
                    const y = 188 - (pct / 100) * 162;
                    return { x, y, pct, cdf, dev: d };
                  });

                  const incPts = calculation.developments.map((d, j) => {
                    const x = 65 + j * 60;
                    const cdf = calculation.incurred_cdf[j] || 1;
                    const pct = Math.min(100, (1 / cdf) * 100);
                    const y = 188 - (pct / 100) * 162;
                    return { x, y, pct, cdf, dev: d };
                  });

                  const paidPath = paidPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                  const incPath = incPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                  return (
                    <>
                      <path d={paidPath} fill="none" stroke="#38bdf8" strokeWidth={2.5} />
                      <path d={incPath} fill="none" stroke="#10b981" strokeWidth={2.5} />
                      {paidPts.map((p) => (
                        <g key={`p-${p.dev}`}>
                          <circle cx={p.x} cy={p.y} r={3.5} fill="#38bdf8" />
                          <text x={p.x} y={p.y - 8} textAnchor="middle" fill="#7dd3fc">
                            {p.pct.toFixed(0)}%
                          </text>
                          <text x={p.x} y={206} textAnchor="middle" fill="#94a3b8">
                            {p.dev}M
                          </text>
                        </g>
                      ))}
                      {incPts.map((p) => (
                        <g key={`i-${p.dev}`}>
                          <circle cx={p.x} cy={p.y} r={3.5} fill="#10b981" />
                        </g>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* SECTION D: Enterprise All-LoB Consolidated Reserve Summary & Export */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/50">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              Enterprise Consolidated IBNR Summary Across All Lines of Business
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Aggregated reserves across Motor BI, Motor PD, Commercial Fire, and General Liability with inter-LoB diversification benefit
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV Reserve Pack
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse font-mono tabular-nums">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <th className="py-2.5 px-3 text-left font-medium">Line of Business</th>
                <th className="py-2.5 px-3 text-right font-medium">Earned Premium</th>
                <th className="py-2.5 px-3 text-right font-medium">Latest Paid</th>
                <th className="py-2.5 px-3 text-right font-semibold text-sky-300">Selected Ultimate</th>
                <th className="py-2.5 px-3 text-right font-semibold text-emerald-300">Pure IBNR</th>
                <th className="py-2.5 px-3 text-right font-semibold text-rose-300">PYD (AY 17–25)</th>
                <th className="py-2.5 px-3 text-right font-medium text-sky-200">CY26 Paid A/E%</th>
                <th className="py-2.5 px-3 text-right font-medium">Ultimate LR%</th>
                <th className="py-2.5 px-3 text-right font-medium text-amber-300">Mack SE</th>
                <th className="py-2.5 px-3 text-right font-medium">Mack CV%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {lobList.map((c) => {
                const isCurrent = c.lob_id === calculation.lob_id;
                const pyd = c.ave_pyd_totals?.total_pyd || 0;
                const aePct = (c.ave_pyd_totals?.ave_paid_ratio || 1) * 100;
                return (
                  <tr
                    key={c.lob_id}
                    className={isCurrent ? 'bg-sky-950/25' : 'hover:bg-slate-800/40'}
                  >
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                      {c.lob_name}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {c.totals.earned_premium.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {c.totals.latest_paid.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-sky-200">
                      {c.totals.selected_ultimate.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-300">
                      {c.totals.selected_ibnr.toLocaleString('en-US')}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        pyd > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {pyd > 0 ? `+${pyd.toLocaleString('en-US')}` : pyd.toLocaleString('en-US')}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right ${
                        aePct > 102 ? 'text-rose-300' : aePct < 98 ? 'text-emerald-300' : 'text-slate-300'
                      }`}
                    >
                      {aePct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {(c.totals.overall_loss_ratio * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-200">
                      ±{c.totals.total_mack_std_error.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      {(c.totals.total_mack_cv * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}

              {(() => {
                const totalPydAll =
                  Math.round(
                    lobList.reduce((a, c) => a + (c.ave_pyd_totals?.total_pyd || 0), 0) * 10
                  ) / 10;
                const totalActPaid = lobList.reduce(
                  (a, c) => a + (c.ave_pyd_totals?.actual_paid_emergence || 0),
                  0
                );
                const totalExpPaid = lobList.reduce(
                  (a, c) => a + (c.ave_pyd_totals?.expected_paid_emergence || 0),
                  0
                );
                const totalAePct = totalExpPaid > 0 ? (totalActPaid / totalExpPaid) * 100 : 100;

                return (
                  <tr className="bg-slate-950 font-bold border-t-2 border-slate-700 text-slate-100">
                    <td className="py-3 px-3 font-sans">
                      Enterprise Total (Diversified Portfolio)
                    </td>
                    <td className="py-3 px-3 text-right">{grandTotalEp.toLocaleString('en-US')}</td>
                    <td className="py-3 px-3 text-right">{grandTotalPaid.toLocaleString('en-US')}</td>
                    <td className="py-3 px-3 text-right text-sky-300">
                      {grandTotalUlt.toLocaleString('en-US')}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-300">
                      {grandTotalIbnr.toLocaleString('en-US')}
                    </td>
                    <td
                      className={`py-3 px-3 text-right ${
                        totalPydAll > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {totalPydAll > 0
                        ? `+${totalPydAll.toLocaleString('en-US')}`
                        : totalPydAll.toLocaleString('en-US')}
                    </td>
                    <td
                      className={`py-3 px-3 text-right ${
                        totalAePct > 102 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {totalAePct.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-right">
                      {grandTotalEp > 0 ? ((grandTotalUlt / grandTotalEp) * 100).toFixed(1) : '0.0'}%
                    </td>
                    <td className="py-3 px-3 text-right text-amber-300">
                      ±{diversifiedSe.toLocaleString('en-US')}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300">
                      {grandTotalIbnr > 0
                        ? ((diversifiedSe / grandTotalIbnr) * 100).toFixed(1)
                        : '0.0'}
                      %
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 bg-slate-950/70 border-t border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums">
          <span>
            Undiversified Sum of Mack SE: ±{undiversifiedSe.toFixed(1)} JPY M · Diversification Benefit: -{(undiversifiedSe - diversifiedSe).toFixed(1)} JPY M
          </span>
          <span>Valuation Basis: Statutory &amp; IFRS 17 Best Estimate + Risk Adjustment</span>
        </div>
      </div>
    </div>
  );
}
