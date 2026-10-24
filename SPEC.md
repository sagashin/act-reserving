# SPEC.md - ResQ-Next Actuarial Reserving Platform Specification

## 1. Database Schema (PostgreSQL / Cloud SQL / Supabase)

```sql
-- 1. リザービングプロジェクト管理
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
    earned_premium JSONB                 -- 事故年度別の既経過保険料 {"2017": 14200, "2018": 14800, ...}
);

-- 3. トライアングルデータ (Paid, Incurred, Claim Count等)
CREATE TABLE triangles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lob_id UUID REFERENCES lob_segments(id) ON DELETE CASCADE,
    data_type TEXT NOT NULL,             -- 'paid' | 'incurred' | 'count'
    origin_grain TEXT DEFAULT 'Y',       -- 'Y'(年), 'Q'(四半期), 'M'(月)
    dev_grain TEXT DEFAULT 'Y',
    raw_records JSONB NOT NULL,          -- [{ "origin": "2017", "dev": 12, "value": 4500 }, ...]
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
);
```

## 2. API Schema Contract (`CalculationRecipe` & `CalculationResponse`)

- `POST /api/demo-data`: Loads actuarial triangles (`genins`, `ukmotor`, property, casualty) with Paid, Incurred, Claim Counts, and Earned Premiums.
- `POST /api/calculate`: Executes deterministic & Mack stochastic reserving pipeline:
  - `Development`: Volume-weighted, Simple average, Regression, Last 3-year Volume, Last 5-year Volume, with `drop_cells` coordinate exclusion and `manual_ldf_overrides`.
  - `TailCurve` / `TailConstant`: Exponential or Inverse Power curve fitting on link ratios, or manual tail factor.
  - `Chainladder`, `BornhuetterFerguson`, `CapeCod`, and `MackChainladder` (Process + Parameter Risk standard error).
  - Origin-level method blending (`origin_method_weights`) to compute `selected_ultimate`, `selected_ibnr`, `ultimate_loss_ratio`, and `mack_std_error`.
- `POST /api/bootstrap`: Executes ODP Bootstrap simulation (`n_sims=5000`) returning IBNR distribution histogram bins, mean, SD, CoV, and 75th / 95th / 99.5th percentiles for Solvency II / Economic Value assessment.
- `POST /api/ai-actuary`: Invokes server-side Gemini model to inspect the active triangle, link ratios, calendar-year inflation diagonals, outlier link ratios, and CL vs. BF weight transitions, returning structured audit commentary and actionable recommendations.
