import { NextRequest, NextResponse } from 'next/server';
import { CalculationRecipe, calculateReserves, LOB_SEGMENTS } from '@/lib/actuarial-engine';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CalculationRecipe;
    if (!body || !body.lob_id) {
      return NextResponse.json(
        { error: 'Invalid CalculationRecipe payload: lob_id is required' },
        { status: 400 }
      );
    }
    const result = calculateReserves(body);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Calculation error';
    const fallback = calculateReserves(LOB_SEGMENTS.auto_bi.default_recipe);
    return NextResponse.json({ ...fallback, warning: message }, { status: 200 });
  }
}
