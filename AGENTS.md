# AGENTS.md - ResQ-Class Actuarial Reserving Platform Rules

## Project Overview
損害保険の支払備金（IBNR）評価を行うエンタープライズWebアプリケーション。
WTWの「ResQ」に匹敵するスプレッドシート操作性と、`chainladder`ライブラリによる厳密なアクチュアリー計算を提供する。

## Tech Stack & Architecture Constraints
- **Frontend (`apps/web` & root Next.js app)**: Next.js 15 (App Router), TypeScript (strict), Tailwind CSS, tabular-nums financial grid, interactive SVG/Canvas diagnostic charts.
- **Backend (`apps/api` & Next.js `/api/*` routes)**: Python 3.12, FastAPI, Pydantic v2, `chainladder`, `pandas`, `polars`, `numpy`, SQLAlchemy (Async PostgreSQL), plus isomorphic TypeScript actuarial calculation engine for zero-latency preview & serverless execution.
- **Deployment Target**: Google Cloud Run (Dockerized microservices in `asia-northeast1`).

## Actuarial & Coding Rules (CRITICAL)
1. **Precision & NaN Handling**:
   - Pythonの `chainladder` が返す `np.nan` や `np.inf` は、JSONシリアライズ前に必ず `None` (`null`) に変換すること。
   - 金額表示はカンマ区切り、LDF/CDFは小数点第4位（例: `1.2345`）、損害率はパーセント表示（小数点第1位、例: `65.4%`）に統一すること。
2. **chainladder Pipeline Implementation**:
   - 外れ値除外は `cl.Development(average=..., n_periods=..., drop=recipe.drop_cells)` を使用すること。
   - ユーザーがLDFを手動でオーバーライドした場合は、計算後の `ldf_.values` を書き換えて `cdf_` を再計算させた上で `cl.Chainladder()` や `cl.BornhuetterFerguson()` に渡すこと。
3. **UI/UX Standards**:
   - アクチュアリーが高速に作業できるよう、プロフェッショナルな金融・数理ワークベンチUIとすること。
   - Link Ratio（進展率）テーブルのセルをクリックすると、`drop_cells` のON/OFFがトグルされ、除外されたセルには打ち消し線と赤枠ハイライトが適用され、即座に平均LDF・CDF・IBNRが再計算されること。
