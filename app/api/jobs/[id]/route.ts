export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'https://api.dcp.sa';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const renterKey = request.headers.get('x-renter-key');
    const providerKey = request.headers.get('x-provider-key');
    const res = await fetch(`${BACKEND}/api/jobs/${params.id}`, {
      headers: {
        ...(renterKey ? { 'x-renter-key': renterKey } : {}),
        ...(providerKey ? { 'x-provider-key': providerKey } : {}),
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'Failed to fetch job from backend' },
        { status: res.status }
      );
    }

    // Backend already returns { job: {...} } — forward as-is. Wrapping again
    // produced { job: { job: {...} } }, which made every consumer's
    // `data.job.job_id` undefined and rendered "#undefined" in the UI.
    const data = await res.json();

    return NextResponse.json(
      data,
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Job detail API error:', error);
    return NextResponse.json(
      { error: 'Failed to connect to backend' },
      { status: 502 }
    );
  }
}
