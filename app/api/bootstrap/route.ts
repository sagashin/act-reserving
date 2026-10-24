import { NextRequest, NextResponse } from 'next/server';
import { CalculationRecipe, runBootstrapSimulation, LOB_SEGMENTS } from '@/lib/actuarial-engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const recipe: CalculationRecipe = body.recipe || LOB_SEGMENTS[body.lob_id || 'auto_bi']?.default_recipe || LOB_SEGMENTS.auto_bi.default_recipe;
    const nSims = Math.min(10000, Math.max(500, Number(body.n_sims) || 5000));
    const seed = Number(body.seed) || 42;

    const result = runBootstrapSimulation(recipe, nSims, seed);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bootstrap simulation error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
