'use client';

import React, { useState, useMemo } from 'react';
import {
  CalculationResponse,
  computeCrossSegmentMovers,
  LOB_SEGMENTS,
} from '@/lib/actuarial-engine';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  Download,
  ArrowUpRight,
  Layers,
  Filter,
} from 'lucide-react';

interface AvEPydTabProps {
  calculation: CalculationResponse;
  allCalculations: Record<string, CalculationResponse>;
  selectedLobId: string;
  onSelectLob: (lobId: string) => void;
  onJumpToTab?: (lobId: string, tab: 'triangle' | 'methods') => void;
}

type MoverFilterMode = 'all_abs' | 'adverse_only' | 'favorable_only' | 'ave_paid_shock';
type HeatmapMetricMode = 'pyd_ultimate' | 'ave_paid_diff' | 'ave_incurred_diff';

export default function AvEPydTab({
  calculation,
  allCalculations,
  selectedLobId,
  onSelectLob,
  onJumpToTab,
}: AvEPydTabProps) {
  const [moverFilter, setMoverFilter] = useState<MoverFilterMode>('all_abs');
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetricMode>('pyd_ultimate');
  const [aveChartBasis, setAveChartBasis] = useState<'paid' | 'incurred'>('paid');
  const [highlightedOrigin, setHighlightedOrigin] = useState<string | null>(null);

  const { movers, enterpriseTotals } = useMemo(
    () => computeCrossSegmentMovers(allCalculations),
    [allCalculations]
  );

  const filteredMovers = useMemo(() => {
    const list = [...movers];
    if (moverFilter === 'adverse_only') {
      return list.filter((m) => m.pyd_ultimate > 0).sort((a, b) => b.pyd_ultimate - a.pyd_ultimate);
    }
    if (moverFilter === 'favorable_only') {
      return list.filter((m) => m.pyd_ultimate < 0).sort((a, b) => a.pyd_ultimate - b.pyd_ultimate);
    }
    if (moverFilter === 'ave_paid_shock') {
      return list.sort((a, b) => Math.abs(b.ave_paid_diff) - Math.abs(a.ave_paid_diff));
    }
    return list.sort((a, b) => b.abs_pyd - a.abs_pyd);
  }, [movers, moverFilter]);

  const priorOrigins = calculation.ave_pyd_by_origin.map((r) => r.origin);
  const lobOrder = ['auto_bi', 'auto_pd', 'fire_comm', 'casualty_gl'];

  const formatSigned = (val: number, decimals = 1) => {
    const rounded = Number(val.toFixed(decimals));
    if (rounded > 0) return `+${rounded.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    return rounded.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const formatPctSigned = (ratio: number, decimals = 1) => {
    const pct = ratio * 100;
    const rounded = Number(pct.toFixed(decimals));
    if (rounded > 0) return `+${rounded.toFixed(decimals)}%`;
    return `${rounded.toFixed(decimals)}%`;
  };

  const getPydBadgeClass = (val: number) => {
    if (val > 5) {
      return 'bg-rose-950/70 border-rose-500/50 text-rose-200';
    }
    if (val < -5) {
      return 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200';
    }
    return 'bg-slate-900 border-slate-700 text-slate-300';
  };

  const getHeatmapCellStyle = (val: number) => {
    const abs = Math.abs(val);
    if (val > 150) return 'bg-rose-900/80 border-rose-500/70 text-rose-100 font-bold';
    if (val > 60) return 'bg-rose-950/75 border-rose-600/50 text-rose-200 font-semibold';
    if (val > 10) return 'bg-rose-950/40 border-rose-800/40 text-rose-300';
    if (val < -150) return 'bg-emerald-900/80 border-emerald-500/70 text-emerald-100 font-bold';
    if (val < -60) return 'bg-emerald-950/75 border-emerald-600/50 text-emerald-200 font-semibold';
    if (val < -10) return 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300';
    if (abs <= 10) return 'bg-slate-900/80 border-slate-800 text-slate-400';
    return 'bg-slate-900/80 border-slate-800 text-slate-300';
  };

  const handleExportAvEPydCsv = () => {
    const headers = [
      'Product_LoB',
      'Accident_Year',
      'Dev_Transition',
      'Earned_Premium',
      'Prior_2025_Paid',
      'Current_2026_Paid',
      'Actual_Paid_Emergence',
      'Expected_Paid_Emergence',
      'AvE_Paid_Diff',
      'AvE_Paid_Ratio_Pct',
      'Prior_2025_Incurred',
      'Current_2026_Incurred',
      'Actual_Incurred_Emergence',
      'Expected_Incurred_Emergence',
      'AvE_Incurred_Diff',
      'AvE_Incurred_Ratio_Pct',
      'Prior_2025_Ultimate',
      'Current_2026_Ultimate',
      'PYD_Ultimate',
      'PYD_Pct_Of_Prior',
      'PYD_Experience_Variance',
      'PYD_Assumption_Change',
      'Driver_Note',
    ];

    const lines = [headers.join(',')];
    for (const lobId of lobOrder) {
      const c = allCalculations[lobId];
      if (!c) continue;
      for (const r of c.ave_pyd_by_origin) {
        lines.push(
          [
            `"${c.lob_name}"`,
            r.origin,
            `"${r.dev_from}M->${r.dev_to}M"`,
            r.earned_premium,
            r.prior_paid,
            r.current_paid,
            r.actual_paid_emergence,
            r.expected_paid_emergence,
            r.ave_paid_diff,
            (r.ave_paid_ratio * 100).toFixed(1),
            r.prior_incurred,
            r.current_incurred,
            r.actual_incurred_emergence,
            r.expected_incurred_emergence,
            r.ave_incurred_diff,
            (r.ave_incurred_ratio * 100).toFixed(1),
            r.prior_ultimate,
            r.current_ultimate,
            r.pyd_ultimate,
            (r.pyd_pct_of_prior * 100).toFixed(2),
            r.pyd_experience_variance,
            r.pyd_assumption_change,
            `"${r.driver_note.replace(/"/g, '""')}"`,
          ].join(',')
        );
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `resq_ave_pyd_volatility_2026.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const t = calculation.ave_pyd_totals;

  // Chart scaling for Active LoB AvE & PYD
  const maxEmergenceVal = Math.max(
    100,
    ...calculation.ave_pyd_by_origin.map((r) =>
      aveChartBasis === 'paid'
        ? Math.max(r.actual_paid_emergence, r.expected_paid_emergence)
        : Math.max(r.actual_incurred_emergence, r.expected_incurred_emergence)
    )
  );

  const maxAbsOriginPyd = Math.max(
    50,
    ...calculation.ave_pyd_by_origin.map((r) => Math.abs(r.pyd_ultimate))
  );

  return (
    <div className="space-y-4">
      {/* Top Executive KPI Banner: PYD & Actual vs Expected */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-slate-100">
                Actual vs. Expected (AvE) &amp; Prior Year Development (PYD) — CY 2026 Roll-Forward
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Evaluates how Prior Accident Years (2017–2025) developed in Calendar Year 2026 against 2025 Valuation Expectations (+Adverse / -Favorable)
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportAvEPydCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            Export All-Segment AvE &amp; PYD CSV
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 font-mono tabular-nums">
          {/* Card 1: Selected LoB PYD */}
          <div
            data-testid="ave-pyd-lob-total"
            className={`p-3 rounded-lg border ${getPydBadgeClass(t.total_pyd)}`}
          >
            <div className="flex items-center justify-between text-[11px] font-sans opacity-90">
              <span>Selected LoB PYD (AY 17–25)</span>
              {t.total_pyd > 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </div>
            <div className="text-base font-bold mt-1">
              {formatSigned(t.total_pyd)} <span className="text-xs font-normal">JPY M</span>
            </div>
            <div className="text-[11px] mt-0.5 opacity-85">
              {formatPctSigned(t.total_pyd_pct)} vs Prior Ult · LR Impact: {formatPctSigned(t.total_pyd_lr_impact)}
            </div>
          </div>

          {/* Card 2: CY 2026 Paid AvE */}
          <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-lg">
            <div className="text-[11px] font-sans text-slate-400">
              CY 2026 Paid AvE (Actual - Exp)
            </div>
            <div
              className={`text-base font-bold mt-1 ${
                t.ave_paid_diff > 0 ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              {formatSigned(t.ave_paid_diff)}{' '}
              <span className="text-xs font-normal text-slate-400">
                (A/E: {(t.ave_paid_ratio * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Actual: {t.actual_paid_emergence.toLocaleString('en-US')} vs Exp: {t.expected_paid_emergence.toLocaleString('en-US')}
            </div>
          </div>

          {/* Card 3: CY 2026 Incurred AvE */}
          <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-lg">
            <div className="text-[11px] font-sans text-slate-400">
              CY 2026 Incurred AvE (Actual - Exp)
            </div>
            <div
              className={`text-base font-bold mt-1 ${
                t.ave_incurred_diff > 0 ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              {formatSigned(t.ave_incurred_diff)}{' '}
              <span className="text-xs font-normal text-slate-400">
                (A/E: {(t.ave_incurred_ratio * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Actual: {t.actual_incurred_emergence.toLocaleString('en-US')} vs Exp: {t.expected_incurred_emergence.toLocaleString('en-US')}
            </div>
          </div>

          {/* Card 4: PYD Driver Decomposition */}
          <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-lg">
            <div className="text-[11px] font-sans text-slate-400">
              PYD Driver Attribution (LoB)
            </div>
            <div className="text-xs font-bold text-slate-200 mt-1 flex items-center justify-between">
              <span className="font-sans font-normal text-slate-400">Exp Variance (AvE):</span>
              <span className={t.total_pyd_experience > 0 ? 'text-rose-300' : 'text-emerald-300'}>
                {formatSigned(t.total_pyd_experience)}
              </span>
            </div>
            <div className="text-xs font-bold text-slate-200 mt-0.5 flex items-center justify-between">
              <span className="font-sans font-normal text-slate-400">Model / LDF Change:</span>
              <span className={t.total_pyd_assumption > 0 ? 'text-amber-300' : 'text-sky-300'}>
                {formatSigned(t.total_pyd_assumption)}
              </span>
            </div>
          </div>

          {/* Card 5: Enterprise Portfolio Total PYD (All 4 Products) */}
          <div
            data-testid="enterprise-pyd-total"
            className="p-3 bg-sky-950/30 border border-sky-500/40 rounded-lg"
          >
            <div className="text-[11px] font-sans text-sky-300">
              All-Portfolio Total PYD (4 LoBs)
            </div>
            <div
              className={`text-base font-bold mt-1 ${
                enterpriseTotals.total_pyd > 0 ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              {formatSigned(enterpriseTotals.total_pyd)}{' '}
              <span className="text-xs font-normal text-slate-300">
                ({formatPctSigned(enterpriseTotals.total_pyd_pct)})
              </span>
            </div>
            <div className="text-[11px] text-sky-200/80 mt-0.5">
              Adverse: {enterpriseTotals.adverse_segments_count} segs · Favorable:{' '}
              {enterpriseTotals.favorable_segments_count} segs
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1A: Full-Width Product x Accident Year Volatility Matrix (LoB x AY 2017-2025 + Roll-Forward Totals) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Product × Accident Year Volatility Matrix &amp; Roll-Forward Summary (LoB × AY 2017–2025)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Click any segment cell to select that Product &amp; Accident Year. Rose (+) = Adverse Development, Emerald (-) = Favorable Release.
            </p>
          </div>

          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => setHeatmapMetric('pyd_ultimate')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                heatmapMetric === 'pyd_ultimate'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              PYD (Δ Ultimate)
            </button>
            <button
              type="button"
              onClick={() => setHeatmapMetric('ave_paid_diff')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                heatmapMetric === 'ave_paid_diff'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Paid AvE (Act - Exp)
            </button>
            <button
              type="button"
              onClick={() => setHeatmapMetric('ave_incurred_diff')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                heatmapMetric === 'ave_incurred_diff'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Incurred AvE (Act - Exp)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            data-testid="cross-segment-heatmap"
            className="w-full text-xs font-mono tabular-nums border-collapse"
          >
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px] bg-slate-950/50">
                <th className="py-2 px-2.5 text-left font-sans">Product Line (LoB)</th>
                {priorOrigins.map((orig) => (
                  <th key={orig} className="py-2 px-1.5 text-center">
                    AY {orig}
                  </th>
                ))}
                <th className="py-2 px-2 text-right border-l border-slate-800">Prior Ult (25)</th>
                <th className="py-2 px-2 text-right">Curr Ult (17–25)</th>
                <th className="py-2 px-2 text-right text-slate-200 bg-slate-950/80">
                  {heatmapMetric === 'pyd_ultimate'
                    ? 'Total PYD'
                    : heatmapMetric === 'ave_paid_diff'
                    ? 'Paid AvE'
                    : 'Inc AvE'}
                </th>
                <th className="py-2 px-2 text-right">PYD %</th>
                <th className="py-2 px-2 text-right">Paid A/E%</th>
                <th className="py-2 px-2 text-right">Inc A/E%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {lobOrder.map((lobId) => {
                const c = allCalculations[lobId];
                if (!c) return null;
                const segMeta = LOB_SEGMENTS[lobId];
                const isActiveLob = lobId === selectedLobId;
                const tot = c.ave_pyd_totals;
                const rowTotal =
                  heatmapMetric === 'pyd_ultimate'
                    ? tot.total_pyd
                    : heatmapMetric === 'ave_paid_diff'
                    ? tot.ave_paid_diff
                    : tot.ave_incurred_diff;

                return (
                  <tr
                    key={lobId}
                    className={isActiveLob ? 'bg-sky-950/25' : 'hover:bg-slate-800/30'}
                  >
                    <td className="py-2 px-2.5 font-sans">
                      <button
                        type="button"
                        onClick={() => onSelectLob(lobId)}
                        className={`text-left font-semibold whitespace-nowrap block ${
                          isActiveLob ? 'text-sky-300' : 'text-slate-200 hover:text-sky-300'
                        }`}
                      >
                        {segMeta?.short_name || c.lob_name}
                      </button>
                    </td>
                    {c.ave_pyd_by_origin.map((r) => {
                      const val =
                        heatmapMetric === 'pyd_ultimate'
                          ? r.pyd_ultimate
                          : heatmapMetric === 'ave_paid_diff'
                          ? r.ave_paid_diff
                          : r.ave_incurred_diff;
                      const isHighlighted = isActiveLob && highlightedOrigin === r.origin;
                      return (
                        <td key={r.origin} className="p-1">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectLob(lobId);
                              setHighlightedOrigin(r.origin);
                            }}
                            title={`${segMeta?.short_name} · AY ${r.origin} (${r.dev_from}M->${r.dev_to}M): ${formatSigned(val)} JPY M — ${r.driver_note}`}
                            className={`w-full py-1.5 px-1.5 text-right rounded border text-[11px] transition-all ${getHeatmapCellStyle(
                              val
                            )} ${isHighlighted ? 'ring-2 ring-sky-400' : ''}`}
                          >
                            {formatSigned(val, 0)}
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-right text-slate-400 border-l border-slate-800/80">
                      {tot.prior_ultimate_total.toLocaleString('en-US')}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-200">
                      {tot.current_ultimate_prior_years.toLocaleString('en-US')}
                    </td>
                    <td
                      className={`py-2 px-2 text-right font-bold bg-slate-950/70 ${
                        rowTotal > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatSigned(rowTotal, 1)}
                    </td>
                    <td
                      className={`py-2 px-2 text-right ${
                        tot.total_pyd_pct > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatPctSigned(tot.total_pyd_pct)}
                    </td>
                    <td
                      className={`py-2 px-2 text-right ${
                        tot.ave_paid_ratio > 1.02
                          ? 'text-rose-300'
                          : tot.ave_paid_ratio < 0.98
                          ? 'text-emerald-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {(tot.ave_paid_ratio * 100).toFixed(1)}%
                    </td>
                    <td
                      className={`py-2 px-2 text-right ${
                        tot.ave_incurred_ratio > 1.02
                          ? 'text-rose-300'
                          : tot.ave_incurred_ratio < 0.98
                          ? 'text-emerald-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {(tot.ave_incurred_ratio * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 1B: Full-Width Top Volatile Segments Leaderboard (Product x Accident Year) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Top Volatile Segments Ranking (Product × Accident Year — Top 10 of 36 Segments)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Highlights the segments with the largest Prior Year Development (PYD) and CY 2026 Actual vs. Expected emergence shocks across all Products &amp; Accident Years
            </p>
          </div>

          <div className="inline-flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
            <Filter className="w-3 h-3 text-slate-400 ml-1.5" />
            <button
              type="button"
              onClick={() => setMoverFilter('all_abs')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                moverFilter === 'all_abs'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Top |PYD| Magnitude
            </button>
            <button
              type="button"
              onClick={() => setMoverFilter('adverse_only')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                moverFilter === 'adverse_only'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Adverse Only (+PYD)
            </button>
            <button
              type="button"
              onClick={() => setMoverFilter('favorable_only')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                moverFilter === 'favorable_only'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Favorable Only (-PYD)
            </button>
            <button
              type="button"
              onClick={() => setMoverFilter('ave_paid_shock')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                moverFilter === 'ave_paid_shock'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Paid AvE Shock
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            data-testid="top-movers-table"
            className="w-full text-xs font-mono tabular-nums border-collapse"
          >
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/50">
                <th className="py-2 px-2 text-left font-sans">Rank</th>
                <th className="py-2 px-2 text-left font-sans">Product Line (LoB)</th>
                <th className="py-2 px-2 text-left font-sans">Accident Year (Lag)</th>
                <th className="py-2 px-2 text-right">Paid AvE (A/E%)</th>
                <th className="py-2 px-2 text-right">Incurred AvE (A/E%)</th>
                <th className="py-2 px-2 text-right">Prior Ult (2025)</th>
                <th className="py-2 px-2 text-right">Curr Ult (2026)</th>
                <th className="py-2 px-2 text-right">PYD (Δ Ult)</th>
                <th className="py-2 px-2 text-right">PYD % / LR Imp</th>
                <th className="py-2 px-2.5 text-left font-sans">Primary Actuarial Driver</th>
                <th className="py-2 px-2 text-right font-sans">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredMovers.slice(0, 10).map((m, idx) => {
                const isAdverse = m.pyd_ultimate > 0;
                return (
                  <tr
                    key={m.segment_key}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2 px-2 text-slate-400 font-bold">#{idx + 1}</td>
                    <td className="py-2 px-2 font-sans font-semibold text-slate-100 whitespace-nowrap">
                      {m.lob_short_name}
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span className="text-sky-300 font-bold">AY {m.origin}</span>{' '}
                      <span className="text-[10px] text-slate-400">({m.dev_transition})</span>
                    </td>
                    <td
                      className={`py-2 px-2 text-right whitespace-nowrap ${
                        m.ave_paid_diff > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatSigned(m.ave_paid_diff)}{' '}
                      <span className="text-[10px] text-slate-400">
                        ({(m.ave_paid_ratio * 100).toFixed(1)}%)
                      </span>
                    </td>
                    <td
                      className={`py-2 px-2 text-right whitespace-nowrap ${
                        m.ave_incurred_diff > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatSigned(m.ave_incurred_diff)}{' '}
                      <span className="text-[10px] text-slate-400">
                        ({(m.ave_incurred_ratio * 100).toFixed(1)}%)
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-slate-300">
                      {m.prior_ultimate.toLocaleString('en-US')}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-slate-100">
                      {m.current_ultimate.toLocaleString('en-US')}
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border font-bold ${
                          isAdverse
                            ? 'bg-rose-950/70 border-rose-500/50 text-rose-200'
                            : 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
                        }`}
                      >
                        {formatSigned(m.pyd_ultimate)}
                      </span>
                    </td>
                    <td
                      className={`py-2 px-2 text-right whitespace-nowrap ${
                        isAdverse ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatPctSigned(m.pyd_pct_of_prior)}{' '}
                      <span className="text-[10px] text-slate-400">
                        (LR {formatPctSigned(m.pyd_lr_impact)})
                      </span>
                    </td>
                    <td className="py-2 px-2.5 font-sans text-[11px] text-slate-300">
                      {m.driver_note}
                    </td>
                    <td className="py-2 px-2 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectLob(m.lob_id);
                          setHighlightedOrigin(m.origin);
                          if (onJumpToTab) {
                            onJumpToTab(m.lob_id, 'methods');
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white rounded border border-slate-700 transition-colors whitespace-nowrap"
                      >
                        Inspect
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: Active LoB Diagnostic Charts (AvE Emergence Bar Chart & PYD Waterfall Chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Actual vs Expected Emergence by Prior Accident Year */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                {calculation.lob_name} — CY 2026 Actual vs. Expected Emergence
              </h3>
              <p className="text-[11px] text-slate-400">
                Compares 2026 observed diagonal emergence against 2025 valuation expected link-ratio emergence
              </p>
            </div>
            <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setAveChartBasis('paid')}
                className={`px-2.5 py-1 rounded font-medium ${
                  aveChartBasis === 'paid'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Paid Emergence
              </button>
              <button
                type="button"
                onClick={() => setAveChartBasis('incurred')}
                className={`px-2.5 py-1 rounded font-medium ${
                  aveChartBasis === 'incurred'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Incurred Emergence
              </button>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 640 230"
              className="w-full h-52 select-none"
              role="img"
              aria-label="Actual versus Expected Emergence by Accident Year"
            >
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((tStep) => {
                const y = 185 - tStep * 150;
                const labelVal = Math.round(tStep * maxEmergenceVal);
                return (
                  <g key={tStep}>
                    <line
                      x1={52}
                      y1={y}
                      x2={620}
                      y2={y}
                      stroke="#1e293b"
                      strokeDasharray={tStep === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={46}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono"
                    >
                      {labelVal.toLocaleString('en-US')}
                    </text>
                  </g>
                );
              })}

              {calculation.ave_pyd_by_origin.map((row, idx) => {
                const xGroup = 65 + idx * 61;
                const expVal =
                  aveChartBasis === 'paid'
                    ? row.expected_paid_emergence
                    : row.expected_incurred_emergence;
                const actVal =
                  aveChartBasis === 'paid'
                    ? row.actual_paid_emergence
                    : row.actual_incurred_emergence;
                const diffVal =
                  aveChartBasis === 'paid' ? row.ave_paid_diff : row.ave_incurred_diff;

                const hExp = Math.max(2, (expVal / maxEmergenceVal) * 150);
                const hAct = Math.max(2, (actVal / maxEmergenceVal) * 150);
                const isAdverse = diffVal > 0;

                return (
                  <g key={row.origin}>
                    {/* Expected bar */}
                    <rect
                      x={xGroup}
                      y={185 - hExp}
                      width={18}
                      height={hExp}
                      rx={2}
                      className="fill-slate-600"
                    />
                    {/* Actual bar */}
                    <rect
                      x={xGroup + 20}
                      y={185 - hAct}
                      width={18}
                      height={hAct}
                      rx={2}
                      className={isAdverse ? 'fill-rose-500' : 'fill-emerald-500'}
                    />
                    {/* Diff label */}
                    <text
                      x={xGroup + 19}
                      y={Math.min(185 - hExp, 185 - hAct) - 5}
                      textAnchor="middle"
                      className={`text-[9px] font-mono font-bold ${
                        isAdverse ? 'fill-rose-300' : 'fill-emerald-300'
                      }`}
                    >
                      {formatSigned(diffVal, 0)}
                    </text>
                    {/* X-axis label */}
                    <text
                      x={xGroup + 19}
                      y={202}
                      textAnchor="middle"
                      className="fill-slate-300 text-[10px] font-mono font-semibold"
                    >
                      {row.origin}
                    </text>
                    <text
                      x={xGroup + 19}
                      y={215}
                      textAnchor="middle"
                      className="fill-slate-500 text-[9px] font-mono"
                    >
                      {row.dev_to}M
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex items-center justify-center gap-6 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-slate-600 inline-block" />
              Expected CY 2026 Emergence
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />
              Actual Emergence (Adverse: Actual &gt; Expected)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
              Actual Emergence (Favorable: Actual &lt; Expected)
            </span>
          </div>
        </div>

        {/* Chart 2: Prior Year Development (PYD) Diverging Bar Chart by Accident Year */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              {calculation.lob_name} — Prior Year Development (PYD) by Accident Year
            </h3>
            <p className="text-[11px] text-slate-400">
              Change in Selected Ultimate from 2025 Valuation to 2026 Valuation (PYD = Ult_2026 - Ult_2025)
            </p>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 640 230"
              className="w-full h-52 select-none"
              role="img"
              aria-label="Prior Year Development by Accident Year"
            >
              {/* Zero baseline at y = 110 */}
              <line x1={52} y1={110} x2={620} y2={110} stroke="#475569" strokeWidth={1.5} />
              <line
                x1={52}
                y1={40}
                x2={620}
                y2={40}
                stroke="#1e293b"
                strokeDasharray="3 3"
              />
              <line
                x1={52}
                y1={180}
                x2={620}
                y2={180}
                stroke="#1e293b"
                strokeDasharray="3 3"
              />
              <text x={46} y={44} textAnchor="end" className="fill-rose-400 text-[10px] font-mono">
                +{Math.round(maxAbsOriginPyd)}
              </text>
              <text x={46} y={114} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                0
              </text>
              <text
                x={46}
                y={184}
                textAnchor="end"
                className="fill-emerald-400 text-[10px] font-mono"
              >
                -{Math.round(maxAbsOriginPyd)}
              </text>

              {calculation.ave_pyd_by_origin.map((row, idx) => {
                const xCenter = 84 + idx * 61;
                const pyd = row.pyd_ultimate;
                const barH = Math.min(72, Math.max(3, (Math.abs(pyd) / maxAbsOriginPyd) * 70));
                const isAdverse = pyd >= 0;
                const yTop = isAdverse ? 110 - barH : 110;

                return (
                  <g key={row.origin}>
                    <rect
                      x={xCenter - 16}
                      y={yTop}
                      width={32}
                      height={barH}
                      rx={3}
                      className={isAdverse ? 'fill-rose-500/90' : 'fill-emerald-500/90'}
                    />
                    <text
                      x={xCenter}
                      y={isAdverse ? yTop - 5 : yTop + barH + 11}
                      textAnchor="middle"
                      className={`text-[9px] font-mono font-bold ${
                        isAdverse ? 'fill-rose-300' : 'fill-emerald-300'
                      }`}
                    >
                      {formatSigned(pyd, 1)}
                    </text>
                    <text
                      x={xCenter}
                      y={204}
                      textAnchor="middle"
                      className="fill-slate-300 text-[10px] font-mono font-semibold"
                    >
                      {row.origin}
                    </text>
                    <text
                      x={xCenter}
                      y={216}
                      textAnchor="middle"
                      className="fill-slate-500 text-[9px] font-mono"
                    >
                      {formatPctSigned(row.pyd_pct_of_prior)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex items-center justify-center gap-6 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />
              Adverse PYD (+Δ Ultimate Reserve Strengthening)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
              Favorable PYD (-Δ Ultimate Reserve Release)
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 3: Full Accident-Year AvE & PYD Roll-Forward Schedule */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              {calculation.lob_name} — Detailed Accident-Year AvE &amp; PYD Attribution Schedule (AY 2017–2025 + 2026 New Year)
            </h3>
            <p className="text-[11px] text-slate-400">
              Reconciles 2025 Prior Valuation Ultimate to 2026 Selected Ultimate with Experience Variance vs. Assumption Change attribution
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            data-testid="ave-pyd-detail-table"
            className="w-full text-xs font-mono tabular-nums border-collapse"
          >
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                <th className="py-2 px-2.5 text-left font-sans">Origin (Lag)</th>
                <th className="py-2 px-2 text-right">Actual Paid</th>
                <th className="py-2 px-2 text-right">Exp Paid</th>
                <th className="py-2 px-2 text-right">Paid AvE (A/E%)</th>
                <th className="py-2 px-2 text-right">Actual Inc</th>
                <th className="py-2 px-2 text-right">Exp Inc</th>
                <th className="py-2 px-2 text-right">Inc AvE (A/E%)</th>
                <th className="py-2 px-2 text-right">Prior Ult (2025)</th>
                <th className="py-2 px-2 text-right">Curr Ult (2026)</th>
                <th className="py-2 px-2 text-right">PYD (Δ Ult)</th>
                <th className="py-2 px-2 text-right">Exp Var</th>
                <th className="py-2 px-2 text-right">Model Chg</th>
                <th className="py-2 px-2.5 text-left font-sans">Actuarial Driver Commentary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {calculation.ave_pyd_by_origin.map((row) => {
                const isSelectedRow = highlightedOrigin === row.origin;
                return (
                  <tr
                    key={row.origin}
                    onClick={() =>
                      setHighlightedOrigin((prev) => (prev === row.origin ? null : row.origin))
                    }
                    className={`cursor-pointer transition-colors ${
                      isSelectedRow ? 'bg-sky-950/40' : 'hover:bg-slate-800/35'
                    }`}
                  >
                    <td className="py-2 px-2.5 font-sans font-semibold text-slate-100 whitespace-nowrap">
                      AY {row.origin}{' '}
                      <span className="text-[10px] font-mono text-slate-400">
                        ({row.dev_from}→{row.dev_to}M)
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-slate-200">
                      {row.actual_paid_emergence.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-400">
                      {row.expected_paid_emergence.toLocaleString()}
                    </td>
                    <td
                      className={`py-2 px-2 text-right whitespace-nowrap ${
                        row.ave_paid_diff > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatSigned(row.ave_paid_diff)}{' '}
                      <span className="text-[10px] text-slate-400">
                        ({(row.ave_paid_ratio * 100).toFixed(0)}%)
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-slate-200">
                      {row.actual_incurred_emergence.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-400">
                      {row.expected_incurred_emergence.toLocaleString()}
                    </td>
                    <td
                      className={`py-2 px-2 text-right whitespace-nowrap ${
                        row.ave_incurred_diff > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatSigned(row.ave_incurred_diff)}{' '}
                      <span className="text-[10px] text-slate-400">
                        ({(row.ave_incurred_ratio * 100).toFixed(0)}%)
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right text-slate-300">
                      {row.prior_ultimate.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-sky-200">
                      {row.current_ultimate.toLocaleString()}
                    </td>
                    <td
                      className={`py-2 px-2 text-right font-bold whitespace-nowrap ${
                        row.pyd_ultimate > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatSigned(row.pyd_ultimate)}{' '}
                      <span className="text-[10px] font-normal">
                        ({formatPctSigned(row.pyd_pct_of_prior)})
                      </span>
                    </td>
                    <td
                      className={`py-2 px-2 text-right ${
                        row.pyd_experience_variance > 0 ? 'text-rose-300/90' : 'text-emerald-300/90'
                      }`}
                    >
                      {formatSigned(row.pyd_experience_variance)}
                    </td>
                    <td
                      className={`py-2 px-2 text-right ${
                        row.pyd_assumption_change > 0 ? 'text-amber-300' : 'text-sky-300'
                      }`}
                    >
                      {formatSigned(row.pyd_assumption_change)}
                    </td>
                    <td className="py-2 px-2.5 font-sans text-[11px] text-slate-300">
                      {row.driver_note}
                    </td>
                  </tr>
                );
              })}

              {/* Subtotal Row: Prior Years (AY 2017-2025) */}
              <tr className="bg-slate-950/90 border-t-2 border-slate-700 font-bold text-slate-100">
                <td className="py-2.5 px-2.5 font-sans">
                  Prior Years Subtotal (AY 2017–2025)
                </td>
                <td className="py-2.5 px-2 text-right">{t.actual_paid_emergence.toLocaleString()}</td>
                <td className="py-2.5 px-2 text-right">{t.expected_paid_emergence.toLocaleString()}</td>
                <td
                  className={`py-2.5 px-2 text-right ${
                    t.ave_paid_diff > 0 ? 'text-rose-300' : 'text-emerald-300'
                  }`}
                >
                  {formatSigned(t.ave_paid_diff)} ({(t.ave_paid_ratio * 100).toFixed(1)}%)
                </td>
                <td className="py-2.5 px-2 text-right">
                  {t.actual_incurred_emergence.toLocaleString()}
                </td>
                <td className="py-2.5 px-2 text-right">
                  {t.expected_incurred_emergence.toLocaleString()}
                </td>
                <td
                  className={`py-2.5 px-2 text-right ${
                    t.ave_incurred_diff > 0 ? 'text-rose-300' : 'text-emerald-300'
                  }`}
                >
                  {formatSigned(t.ave_incurred_diff)} ({(t.ave_incurred_ratio * 100).toFixed(1)}%)
                </td>
                <td className="py-2.5 px-2 text-right">{t.prior_ultimate_total.toLocaleString()}</td>
                <td className="py-2.5 px-2 text-right text-sky-300">
                  {t.current_ultimate_prior_years.toLocaleString()}
                </td>
                <td
                  className={`py-2.5 px-2 text-right ${
                    t.total_pyd > 0 ? 'text-rose-300' : 'text-emerald-300'
                  }`}
                >
                  {formatSigned(t.total_pyd)} ({formatPctSigned(t.total_pyd_pct)})
                </td>
                <td
                  className={`py-2.5 px-2 text-right ${
                    t.total_pyd_experience > 0 ? 'text-rose-300' : 'text-emerald-300'
                  }`}
                >
                  {formatSigned(t.total_pyd_experience)}
                </td>
                <td
                  className={`py-2.5 px-2 text-right ${
                    t.total_pyd_assumption > 0 ? 'text-amber-300' : 'text-sky-300'
                  }`}
                >
                  {formatSigned(t.total_pyd_assumption)}
                </td>
                <td className="py-2.5 px-2.5 font-sans text-[11px] text-slate-400">
                  Net Prior Year Reserve Development (PYD)
                </td>
              </tr>

              {/* Current Accident Year (AY 2026) Reconciliation Row */}
              <tr className="bg-slate-900/50 text-slate-300">
                <td className="py-2 px-2.5 font-sans font-semibold text-sky-300">
                  + Current Accident Year (AY 2026 · 12M)
                </td>
                <td className="py-2 px-2 text-right">
                  {(calculation.latest_paid['2026'] || 0).toLocaleString()}
                </td>
                <td className="py-2 px-2 text-right text-slate-500">—</td>
                <td className="py-2 px-2 text-right text-slate-500">New Cohort</td>
                <td className="py-2 px-2 text-right">
                  {(calculation.latest_incurred['2026'] || 0).toLocaleString()}
                </td>
                <td className="py-2 px-2 text-right text-slate-500">—</td>
                <td className="py-2 px-2 text-right text-slate-500">New Cohort</td>
                <td className="py-2 px-2 text-right text-slate-500">—</td>
                <td className="py-2 px-2 text-right font-semibold text-sky-200">
                  {t.new_year_2026_ultimate.toLocaleString()}
                </td>
                <td className="py-2 px-2 text-right text-slate-500">—</td>
                <td className="py-2 px-2 text-right text-slate-500">—</td>
                <td className="py-2 px-2 text-right text-slate-500">—</td>
                <td className="py-2 px-2.5 font-sans text-[11px] text-slate-400">
                  CY 2026 New Exposure (Pure IBNR: {t.new_year_2026_ibnr.toLocaleString()} JPY M)
                </td>
              </tr>

              {/* Grand Total Reconciliation Row */}
              <tr className="bg-sky-950/40 border-t border-sky-500/40 font-bold text-slate-100">
                <td className="py-2.5 px-2.5 font-sans text-sky-200">
                  Total Portfolio (AY 2017–2026 Reconciled)
                </td>
                <td className="py-2.5 px-2 text-right" colSpan={6}>
                  Total Latest Paid: {calculation.totals.latest_paid.toLocaleString()} · Latest Incurred:{' '}
                  {calculation.totals.latest_incurred.toLocaleString()}
                </td>
                <td className="py-2.5 px-2 text-right">
                  {t.prior_ultimate_total.toLocaleString()}
                </td>
                <td className="py-2.5 px-2 text-right text-sky-300">
                  {calculation.totals.selected_ultimate.toLocaleString()}
                </td>
                <td
                  className={`py-2.5 px-2 text-right ${
                    t.total_pyd > 0 ? 'text-rose-300' : 'text-emerald-300'
                  }`}
                >
                  {formatSigned(t.total_pyd)}
                </td>
                <td className="py-2.5 px-2 text-right" colSpan={3}>
                  Total Pure IBNR: {calculation.totals.selected_ibnr.toLocaleString()} JPY M
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
