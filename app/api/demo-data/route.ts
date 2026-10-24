import { NextResponse } from 'next/server';
import { LOB_SEGMENTS, calculateReserves } from '@/lib/actuarial-engine';

export async function GET() {
  const segments = Object.values(LOB_SEGMENTS);
  const initialCalculations = Object.fromEntries(
    segments.map((seg) => [seg.id, calculateReserves(seg.default_recipe)])
  );

  return NextResponse.json({
    project: {
      id: 'proj-2026-q1',
      name: '2026年3月期 支払備金評価 (FY2025 Year-End Statutory & IFRS 17 Valuation)',
      valuation_date: '2026-03-31',
      currency_unit: 'JPY_M',
      is_locked: false,
    },
    segments,
    initial_calculations: initialCalculations,
  });
}

export async function POST() {
  return GET();
}
