'use client';

import React, { useState } from 'react';
import { X, Terminal, Database, FileCode, Cloud, Copy, Check } from 'lucide-react';

interface ArchitectureSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BLUEPRINT_TABS = [
  {
    id: 'agents',
    label: 'AGENTS.md (Rules)',
    icon: FileCode,
    content: `# AGENTS.md - ResQ-Class Actuarial Reserving Platform Rules

## Project Overview
損害保険の支払備金（IBNR）評価を行うエンタープライズWebアプリケーション。
WTWの「ResQ」に匹敵するスプレッドシート操作性と、\`chainladder\`ライブラリによる厳密なアクチュアリー計算を提供する。

## Tech Stack & Architecture Constraints
- **Frontend (\`apps/web\`)**: Next.js (App Router), TypeScript (strict), Tailwind CSS, tabular-nums financial grid, interactive diagnostic charts.
- **Backend (\`apps/api\`)**: Python 3.12, FastAPI, Pydantic v2, \`chainladder\`, \`pandas\`, \`polars\`, \`numpy\`, SQLAlchemy (Async PostgreSQL).
- **Deployment Target**: Google Cloud Run (Dockerized microservices in \`asia-northeast1\`).

## Actuarial & Coding Rules (CRITICAL)
1. **Precision & NaN Handling**:
   - Pythonの \`chainladder\` が返す \`np.nan\` や \`np.inf\` は、JSONシリアライズ前に必ず \`None\` に変換すること。
   - 金額表示はカンマ区切り、LDF/CDFは小数点第4位（例: \`1.2345\`）、損害率はパーセント表示（小数点第1位、例: \`65.4%\`）に統一すること。
2. **chainladder Pipeline Implementation**:
   - 外れ値除外は \`cl.Development(average=..., n_periods=..., drop=recipe.drop_cells)\` を使用すること。
   - ユーザーがLDFを手動でオーバーライドした場合は、計算後の \`ldf_.values\` を書き換えて \`cdf_\` を再計算させた上で \`cl.Chainladder()\` や \`cl.BornhuetterFerguson()\` に渡すこと。`,
  },
  {
    id: 'sql',
    label: 'SPEC.md (PostgreSQL Schema)',
    icon: Database,
    content: `-- 1. リザービングプロジェクト管理
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                  -- 例: "2026年3月期 支払備金評価"
    valuation_date DATE NOT NULL,        -- 評価基準日
    currency_unit TEXT DEFAULT 'JPY_M',  -- 単位（百万円など）
    is_locked BOOLEAN DEFAULT FALSE,     -- 監査ロック用
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 商品・担保階層 (LoB: Line of Business)
CREATE TABLE lob_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES lob_segments(id),
    name TEXT NOT NULL,                  -- 例: "自動車保険 > 対人賠償"
    earned_premium JSONB                 -- 事故年度別の既経過保険料 {"2020": 15000, "2021": 16200, ...}
);

-- 3. トライアングルデータ (Paid, Incurred, Claim Count等)
CREATE TABLE triangles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lob_id UUID REFERENCES lob_segments(id) ON DELETE CASCADE,
    data_type TEXT NOT NULL,             -- 'paid' | 'incurred' | 'count'
    origin_grain TEXT DEFAULT 'Y',       -- 'Y'(年), 'Q'(四半期), 'M'(月)
    dev_grain TEXT DEFAULT 'Y',
    raw_records JSONB NOT NULL,          -- [{ "origin": "2020", "dev": 12, "value": 4500 }, ...]
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. アクチュアリーのパラメータ選択状態（ResQのコア機能）
CREATE TABLE model_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lob_id UUID REFERENCES lob_segments(id) ON DELETE CASCADE,
    selection_recipe JSONB NOT NULL,     -- CalculationRecipe をそのまま保存
    cached_results JSONB,                -- 計算結果のキャッシュ（サマリ高速集計用）
    comment TEXT,                        -- 監査用コメント
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);`,
  },
  {
    id: 'python',
    label: 'apps/api (FastAPI + chainladder)',
    icon: Terminal,
    content: `# apps/api/app/engine/deterministic.py & stochastic.py
import numpy as np
import chainladder as cl
from ..schemas import CalculationRecipe, DevelopmentConfig, TailConfig

def build_development_pipe(tri: cl.Triangle, dev_cfg: DevelopmentConfig, tail_cfg: TailConfig) -> cl.Triangle:
    drop_list = [(str(origin), int(dev)) for origin, dev in dev_cfg.drop_cells] if dev_cfg.drop_cells else None
    dev = cl.Development(average=dev_cfg.average, n_periods=dev_cfg.n_periods, drop=drop_list).fit_transform(tri)

    # Apply manual LDF overrides if provided
    if dev_cfg.manual_ldf_overrides:
        devs = list(tri.development[:-1])
        ldf_vals = dev.ldf_.values.copy()
        for idx, d in enumerate(devs):
            if int(d) in dev_cfg.manual_ldf_overrides:
                ldf_vals[..., idx] = float(dev_cfg.manual_ldf_overrides[int(d)])
        dev.ldf_.values = ldf_vals

    # Apply Tail Factor
    if tail_cfg.method == "constant" and tail_cfg.tail_factor > 1.0:
        dev = cl.TailConstant(tail=tail_cfg.tail_factor).fit_transform(dev)
    elif tail_cfg.method == "curve":
        dev = cl.TailCurve(curve=tail_cfg.curve_type, extrap_periods=tail_cfg.extrap_periods).fit_transform(dev)

    return dev`,
  },
  {
    id: 'cloudrun',
    label: 'Cloud Run MCP Deploy',
    icon: Cloud,
    content: `# Phase 3: Google Cloud Run Autonomous Deployment Commands (asia-northeast1)

# 1. Deploy Backend (FastAPI + chainladder, 2 vCPU / 4 GiB RAM for 5,000-sim ODP Bootstrap)
gcloud run deploy resq-api \\
  --source ./apps/api \\
  --region asia-northeast1 \\
  --cpu 2 \\
  --memory 4Gi \\
  --port 8080 \\
  --allow-unauthenticated

# 2. Deploy Frontend (Next.js App Router Actuarial Workbench)
gcloud run deploy resq-web \\
  --source . \\
  --region asia-northeast1 \\
  --set-env-vars NEXT_PUBLIC_API_URL=https://resq-api-xxxx-an.a.run.app \\
  --port 8080 \\
  --allow-unauthenticated`,
  },
];

export default function ArchitectureSpecModal({
  isOpen,
  onClose,
}: ArchitectureSpecModalProps) {
  const [activeTab, setActiveTab] = useState<string>('agents');
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentItem = BLUEPRINT_TABS.find((t) => t.id === activeTab) || BLUEPRINT_TABS[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentItem.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Antigravity Spec & Cloud Run Architecture"
    >
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Antigravity Spec-Driven Blueprint (`AGENTS.md` / `SPEC.md` / `Cloud Run MCP`)
            </h2>
            <p className="text-xs text-slate-400">
              ワークスペースルートおよび `apps/api/` に配置済みの自律実装・Cloud Runデプロイ定義ファイル
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Spec Modal"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-950/60 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            {BLUEPRINT_TABS.map((t) => {
              const Icon = t.icon;
              const isAct = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    isAct
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Code'}
          </button>
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-950">
          <pre className="font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
            {currentItem.content}
          </pre>
        </div>
      </div>
    </div>
  );
}
