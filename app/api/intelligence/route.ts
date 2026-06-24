export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || process.env.DC1_BACKEND_URL || 'https://api.dcp.sa';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint') || 'fleet';

  try {
    const res = await fetch(`${BACKEND_URL}/api/intelligence/${endpoint}`, {
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 });
  }
}
