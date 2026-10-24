'use client';

import React, { useState, useMemo } from 'react';
import {
  CalculationRecipe,
  CalculationResponse,
  LOB_SEGMENTS,
  calculateReserves,
} from '@/lib/actuarial-engine';
import {
  Upload,
  X,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  RotateCcw,
  ClipboardPaste,
  Database,
} from 'lucide-react';

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipe: CalculationRecipe;
  calculation: CalculationResponse;
  isLocked: boolean;
  onUpdateRecipe: (next: CalculationRecipe) => void;
}

type ImportFormatMode = 'matrix' | 'tidy';
type TriangleTargetType = 'paid' | 'incurred' | 'both_auto';
type ValueBasisMode = 'cumulative' | 'incremental';

const ORIGINS = ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];
const DEVELOPMENTS = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];

function buildMatrixTemplateFromCalc(
  calc: CalculationResponse,
  target: 'paid' | 'incurred'
): string {
  const tri = target === 'incurred' ? calc.incurred_triangle : calc.paid_triangle;
  const header = ['Origin', 'Earned_Premium', ...DEVELOPMENTS.map((d) => `${d}M`)].join(',');
  const rows = ORIGINS.map((orig, i) => {
    const ep = calc.earned_premium[orig] || 0;
    const cells = DEVELOPMENTS.map((_, j) => {
      const val = tri[i]?.[j];
      return val !== null && val !== undefined ? String(val) : '';
    });
    return [orig, String(ep), ...cells].join(',');
  });
  return [header, ...rows].join('\n');
}

function buildTidyTemplateFromCalc(calc: CalculationResponse): string {
  const header = 'origin,dev,paid,incurred,earned_premium';
  const rows: string[] = [header];
  ORIGINS.forEach((orig, i) => {
    const ep = calc.earned_premium[orig] || 0;
    DEVELOPMENTS.forEach((dev, j) => {
      const p = calc.paid_triangle[i]?.[j];
      const inc = calc.incurred_triangle[i]?.[j];
      if (p !== null && p !== undefined) {
        rows.push(`${orig},${dev},${p},${inc ?? p},${ep}`);
      }
    });
  });
  return rows.join('\n');
}

export default function DataImportModal({
  isOpen,
  onClose,
  recipe,
  calculation,
  isLocked,
  onUpdateRecipe,
}: DataImportModalProps) {
  const [formatMode, setFormatMode] = useState<ImportFormatMode>('matrix');
  const [targetType, setTargetType] = useState<TriangleTargetType>('both_auto');
  const [valueBasis, setValueBasis] = useState<ValueBasisMode>('cumulative');
  const [sourceLabel, setSourceLabel] = useState<string>('Custom CSV / Excel Import');
  const [rawText, setRawText] = useState<string>(() =>
    buildMatrixTemplateFromCalc(calculation, 'paid')
  );

  // Sync template when switching LoB or format mode
  const handleLoadCurrentLobTemplate = (mode: ImportFormatMode) => {
    setFormatMode(mode);
    if (mode === 'tidy') {
      setRawText(buildTidyTemplateFromCalc(calculation));
    } else {
      setRawText(
        buildMatrixTemplateFromCalc(
          calculation,
          targetType === 'incurred' ? 'incurred' : 'paid'
        )
      );
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceLabel(`Imported File: ${file.name}`);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      if (text.trim()) {
        // Auto-detect tidy vs matrix format based on header
        const firstLine = text.trim().split(/\r?\n/)[0].toLowerCase();
        if (firstLine.includes('dev') && (firstLine.includes('paid') || firstLine.includes('value'))) {
          setFormatMode('tidy');
        } else {
          setFormatMode('matrix');
        }
        setRawText(text.trim());
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const content =
      formatMode === 'tidy'
        ? buildTidyTemplateFromCalc(calculation)
        : buildMatrixTemplateFromCalc(calculation, 'paid');
    const csvUri = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURI(content);
    const link = document.createElement('a');
    link.setAttribute('href', csvUri);
    link.setAttribute(
      'download',
      `resq_next_${recipe.lob_id}_${formatMode}_template.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Parse rawText into Paid Triangle, Incurred Triangle, and Earned Premium
  const parsedResult = useMemo(() => {
    const baseLob = LOB_SEGMENTS[recipe.lob_id] || LOB_SEGMENTS.auto_bi;
    const paidMatrix: (number | null)[][] = structuredClone(baseLob.paid_triangle);
    const incMatrix: (number | null)[][] = structuredClone(baseLob.incurred_triangle);
    const epMap: Record<string, number> = { ...baseLob.earned_premium };

    const lines = rawText
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return {
        isValid: false,
        error: 'Please provide a header row and at least one data row.',
        cellsParsed: 0,
        paidMatrix,
        incMatrix,
        epMap,
        previewCalc: calculation,
      };
    }

    // Split helper supporting both Tab (Excel paste) and Comma (CSV)
    const splitRow = (line: string) => {
      if (line.includes('\t')) {
        return line.split('\t').map((c) => c.trim().replace(/^"|"$/g, ''));
      }
      return line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    };

    let cellsParsed = 0;

    try {
      if (formatMode === 'matrix') {
        const headerCols = splitRow(lines[0]).map((h) => h.toLowerCase());
        const hasEpCol =
          headerCols[1]?.includes('ep') ||
          headerCols[1]?.includes('premium') ||
          headerCols[1]?.includes('earned');
        const devStartIdx = hasEpCol ? 2 : 1;

        const parsedGrid: (number | null)[][] = ORIGINS.map(() =>
          new Array(DEVELOPMENTS.length).fill(null)
        );

        for (let r = 1; r < lines.length; r++) {
          const cols = splitRow(lines[r]);
          const origRaw = cols[0]?.replace(/[^0-9]/g, '');
          const origIdx = ORIGINS.indexOf(origRaw);
          if (origIdx === -1) continue;

          if (hasEpCol && cols[1]) {
            const epVal = Number(cols[1].replace(/,/g, ''));
            if (!Number.isNaN(epVal) && epVal > 0) {
              epMap[ORIGINS[origIdx]] = epVal;
            }
          }

          for (let j = 0; j < DEVELOPMENTS.length; j++) {
            const rawCell = cols[devStartIdx + j];
            if (rawCell !== undefined && rawCell !== '' && rawCell !== '—' && rawCell !== '-') {
              const num = Number(rawCell.replace(/,/g, ''));
              if (!Number.isNaN(num)) {
                parsedGrid[origIdx][j] = num;
                cellsParsed++;
              }
            }
          }
        }

        // Convert incremental -> cumulative if selected
        if (valueBasis === 'incremental') {
          for (let i = 0; i < ORIGINS.length; i++) {
            let running = 0;
            for (let j = 0; j < DEVELOPMENTS.length; j++) {
              if (parsedGrid[i][j] !== null) {
                running += parsedGrid[i][j]!;
                parsedGrid[i][j] = Math.round(running * 10) / 10;
              }
            }
          }
        }

        if (targetType === 'paid') {
          for (let i = 0; i < ORIGINS.length; i++) {
            paidMatrix[i] = [...parsedGrid[i]];
          }
        } else if (targetType === 'incurred') {
          for (let i = 0; i < ORIGINS.length; i++) {
            incMatrix[i] = [...parsedGrid[i]];
          }
        } else {
          // both_auto: update Paid and scale Incurred proportionally to preserve realistic case reserve ratio
          for (let i = 0; i < ORIGINS.length; i++) {
            for (let j = 0; j < DEVELOPMENTS.length; j++) {
              const newP = parsedGrid[i][j];
              const oldP = baseLob.paid_triangle[i]?.[j];
              const oldInc = baseLob.incurred_triangle[i]?.[j];
              paidMatrix[i][j] = newP;
              if (newP !== null) {
                const ratio =
                  oldP && oldInc && oldP > 0 ? Math.max(1.0, oldInc / oldP) : 1.15;
                incMatrix[i][j] =
                  j === DEVELOPMENTS.length - 1
                    ? newP
                    : Math.round(newP * ratio * 10) / 10;
              } else {
                incMatrix[i][j] = null;
              }
            }
          }
        }
      } else {
        // Tidy / Long format: origin, dev, paid, incurred, earned_premium
        const paidTemp: (number | null)[][] = ORIGINS.map(() =>
          new Array(DEVELOPMENTS.length).fill(null)
        );
        const incTemp: (number | null)[][] = ORIGINS.map(() =>
          new Array(DEVELOPMENTS.length).fill(null)
        );

        for (let r = 1; r < lines.length; r++) {
          const cols = splitRow(lines[r]);
          if (cols.length < 3) continue;
          const orig = cols[0].replace(/[^0-9]/g, '');
          const dev = Number(cols[1].replace(/[^0-9]/g, ''));
          const origIdx = ORIGINS.indexOf(orig);
          const devIdx = DEVELOPMENTS.indexOf(dev);
          if (origIdx === -1 || devIdx === -1) continue;

          const pVal = Number(cols[2].replace(/,/g, ''));
          const iVal = cols[3] !== undefined && cols[3] !== '' ? Number(cols[3].replace(/,/g, '')) : pVal;
          const epVal = cols[4] !== undefined && cols[4] !== '' ? Number(cols[4].replace(/,/g, '')) : NaN;

          if (!Number.isNaN(pVal)) {
            paidTemp[origIdx][devIdx] = pVal;
            cellsParsed++;
          }
          if (!Number.isNaN(iVal)) {
            incTemp[origIdx][devIdx] = iVal;
          }
          if (!Number.isNaN(epVal) && epVal > 0) {
            epMap[orig] = epVal;
          }
        }

        if (valueBasis === 'incremental') {
          for (let i = 0; i < ORIGINS.length; i++) {
            let runP = 0;
            let runI = 0;
            for (let j = 0; j < DEVELOPMENTS.length; j++) {
              if (paidTemp[i][j] !== null) {
                runP += paidTemp[i][j]!;
                paidTemp[i][j] = Math.round(runP * 10) / 10;
              }
              if (incTemp[i][j] !== null) {
                runI += incTemp[i][j]!;
                incTemp[i][j] = Math.round(runI * 10) / 10;
              }
            }
          }
        }

        for (let i = 0; i < ORIGINS.length; i++) {
          paidMatrix[i] = [...paidTemp[i]];
          incMatrix[i] = [...incTemp[i]];
        }
      }

      if (cellsParsed === 0) {
        return {
          isValid: false,
          error: 'No valid numeric triangle cells found for Accident Years 2017–2026.',
          cellsParsed: 0,
          paidMatrix,
          incMatrix,
          epMap,
          previewCalc: calculation,
        };
      }

      const candidateRecipe: CalculationRecipe = {
        ...structuredClone(recipe),
        custom_data: {
          sample_source: sourceLabel,
          earned_premium: epMap,
          paid_triangle: paidMatrix,
          incurred_triangle: incMatrix,
        },
      };

      const previewCalc = calculateReserves(candidateRecipe);

      return {
        isValid: true,
        error: null,
        cellsParsed,
        paidMatrix,
        incMatrix,
        epMap,
        candidateRecipe,
        previewCalc,
      };
    } catch (err) {
      return {
        isValid: false,
        error: err instanceof Error ? err.message : 'Failed to parse triangle data.',
        cellsParsed: 0,
        paidMatrix,
        incMatrix,
        epMap,
        previewCalc: calculation,
      };
    }
  }, [rawText, formatMode, targetType, valueBasis, recipe, calculation, sourceLabel]);

  if (!isOpen) return null;

  const handleApplyImport = () => {
    if (!parsedResult.isValid || !parsedResult.candidateRecipe || isLocked) return;
    onUpdateRecipe(parsedResult.candidateRecipe);
    onClose();
  };

  const handleApplyStressScenario = (multiplier: number, label: string) => {
    const baseLob = LOB_SEGMENTS[recipe.lob_id] || LOB_SEGMENTS.auto_bi;
    const scaledPaid = baseLob.paid_triangle.map((row, i) =>
      row.map((val) => {
        if (val === null) return null;
        // Apply multiplier more strongly on recent accident years (2023-2026)
        const factor = i >= 6 ? multiplier : 1 + (multiplier - 1) * 0.35;
        return Math.round(val * factor);
      })
    );
    const tempCalc: CalculationResponse = {
      ...calculation,
      paid_triangle: scaledPaid,
    };
    setSourceLabel(label);
    setFormatMode('matrix');
    setRawText(buildMatrixTemplateFromCalc(tempCalc, 'paid'));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import Actuarial Triangle Data (CSV & Excel Clipboard Paste)"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-5xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Data Ingestion &amp; Triangle Import — {calculation.lob_name}
              </h2>
              <p className="text-xs text-slate-400">
                Import via CSV File Upload, Excel / WTW ResQ Matrix Copy-Paste (TSV/CSV), or `SPEC.md` Tidy Records (`origin, dev, paid, incurred`)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Import Modal"
            className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Top Control Bar: Format, Target, Basis, and File Upload */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/90 border border-slate-800 rounded-xl p-3.5">
            {/* Format Mode */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                1. Input Schema Format
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => handleLoadCurrentLobTemplate('matrix')}
                  className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                    formatMode === 'matrix'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Wide Matrix (ResQ/Excel)
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadCurrentLobTemplate('tidy')}
                  className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                    formatMode === 'tidy'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tidy Records (DB CSV)
                </button>
              </div>
            </div>

            {/* Target Triangle */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                2. Target Triangle Data
              </label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as TriangleTargetType)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
              >
                <option value="both_auto">Paid + Incurred + Earned Premium</option>
                <option value="paid">Paid Triangle + Earned Premium Only</option>
                <option value="incurred">Incurred Triangle Only</option>
              </select>
            </div>

            {/* Cumulative vs Incremental */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                3. Input Valuation Basis
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setValueBasis('cumulative')}
                  className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                    valueBasis === 'cumulative'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Cumulative
                </button>
                <button
                  type="button"
                  onClick={() => setValueBasis('incremental')}
                  className={`py-1.5 px-2 rounded-md font-medium transition-colors ${
                    valueBasis === 'incremental'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Incremental
                </button>
              </div>
            </div>

            {/* Upload CSV or Download Template */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                4. File Upload / CSV Template
              </label>
              <div className="flex items-center gap-1.5">
                <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg cursor-pointer transition-colors whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload CSV</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  Template
                </button>
              </div>
            </div>
          </div>

          {/* Quick Scenario Presets & Paste Editor */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 7 Cols: CSV / TSV Clipboard Editor */}
            <div className="lg:col-span-7 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <ClipboardPaste className="w-3.5 h-3.5 text-sky-400" />
                  <span>Paste CSV or Excel / ResQ Tab-Delimited Triangle Cells</span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleApplyStressScenario(
                        1.12,
                        'Stress Scenario: +12% Severe Inflation Shock (AY 2023–2026)'
                      )
                    }
                    className="px-2 py-1 text-[11px] font-mono bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 border border-rose-500/40 rounded transition-colors"
                  >
                    Load +12% Inflation Stress
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleApplyStressScenario(
                        0.92,
                        'Favorable Scenario: -8% Frequency Improvement (AY 2023–2026)'
                      )
                    }
                    className="px-2 py-1 text-[11px] font-mono bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border border-emerald-500/40 rounded transition-colors"
                  >
                    Load -8% Favorable Claims
                  </button>
                </div>
              </div>

              <textarea
                aria-label="Triangle CSV or TSV Input"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={12}
                spellCheck={false}
                className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl p-3 font-mono text-xs text-slate-100 leading-relaxed focus:outline-none"
              />
            </div>

            {/* Right 5 Cols: Live Validation & Simulated Reserve Impact Preview */}
            <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-100">
                      Live Ingestion Preview &amp; Validation
                    </span>
                  </div>
                  {parsedResult.isValid ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 rounded">
                      <CheckCircle2 className="w-3 h-3" />
                      {parsedResult.cellsParsed} Cells Validated
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-rose-950/80 border border-rose-500/50 text-rose-300 rounded">
                      Parse Error
                    </span>
                  )}
                </div>

                {parsedResult.error ? (
                  <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-lg text-xs text-rose-200">
                    {parsedResult.error}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2.5 font-mono tabular-nums text-xs">
                      <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                        <div className="text-[10px] font-sans text-slate-400">
                          Current Selected IBNR
                        </div>
                        <div className="text-sm font-bold text-slate-200 mt-0.5">
                          {calculation.totals.selected_ibnr.toLocaleString('en-US')} JPY M
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Ult: {calculation.totals.selected_ultimate.toLocaleString('en-US')}
                        </div>
                      </div>

                      <div className="p-2.5 bg-sky-950/35 border border-sky-500/45 rounded-lg">
                        <div className="text-[10px] font-sans text-sky-300">
                          Preview Imported IBNR
                        </div>
                        <div className="text-sm font-bold text-emerald-300 mt-0.5">
                          {parsedResult.previewCalc.totals.selected_ibnr.toLocaleString('en-US')}{' '}
                          JPY M
                        </div>
                        <div className="text-[10px] text-sky-200">
                          Ult:{' '}
                          {parsedResult.previewCalc.totals.selected_ultimate.toLocaleString(
                            'en-US'
                          )}
                        </div>
                      </div>

                      <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                        <div className="text-[10px] font-sans text-slate-400">
                          Preview Latest Paid
                        </div>
                        <div className="text-sm font-bold text-slate-100 mt-0.5">
                          {parsedResult.previewCalc.totals.latest_paid.toLocaleString('en-US')}{' '}
                          JPY M
                        </div>
                        <div className="text-[10px] text-slate-400">
                          EP: {parsedResult.previewCalc.totals.earned_premium.toLocaleString('en-US')}
                        </div>
                      </div>

                      <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                        <div className="text-[10px] font-sans text-slate-400">
                          Preview Paid A/E &amp; PYD
                        </div>
                        <div className="text-sm font-bold text-rose-300 mt-0.5">
                          A/E:{' '}
                          {(
                            parsedResult.previewCalc.ave_pyd_totals.ave_paid_ratio * 100
                          ).toFixed(1)}
                          %
                        </div>
                        <div className="text-[10px] text-slate-400">
                          PYD:{' '}
                          {parsedResult.previewCalc.ave_pyd_totals.total_pyd.toLocaleString(
                            'en-US'
                          )}{' '}
                          JPY M
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg text-[11px] text-slate-300 space-y-1">
                      <div className="font-semibold text-slate-100">
                        Supported Ingestion Pipelines:
                      </div>
                      <p>
                        • <strong>Browser UI (Immediate)</strong>: Paste directly from Excel / WTW ResQ or upload `.csv` / `.tsv` files.
                      </p>
                      <p>
                        • <strong>REST API (`/api/calculate`)</strong>: Accepts `custom_data` triangles or PostgreSQL `triangles.raw_records` JSONB payloads.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={isLocked || !recipe.custom_data}
                  onClick={() => {
                    const nextRec = structuredClone(recipe);
                    delete nextRec.custom_data;
                    onUpdateRecipe(nextRec);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg transition-colors disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore Default Sample
                </button>

                <button
                  type="button"
                  disabled={isLocked || !parsedResult.isValid}
                  onClick={handleApplyImport}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Apply Imported Data to Workbench
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
