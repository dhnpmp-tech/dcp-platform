export const dynamic = 'force-dynamic'

/**
 * DCP — GPU restock waitlist API
 *
 * POST /api/pods/notify-me   { gpu_type: string, email?: string }
 *   Captures interest in a GPU type that is currently out of stock, so a
 *   visitor can ask to be told when that card is rentable again. Submitted
 *   from the out-of-stock cards on the GPU availability grid.
 *
 * Storage strategy (Phase 1 — mirrors /api/feedback):
 *   - Appends JSONL records to /tmp/dcp-notify-me.jsonl on the server
 *   - Also logs to stdout for immediate visibility
 *   - Swap for a database write / CRM event when accounts are provisioned
 *
 * INVISIBILITY: this only ever records a GPU TYPE string the visitor saw on
 * the public grid. It never accepts or stores a machine name, node/provider
 * count, vendor, or endpoint — there is nothing here for a caller to inject.
 *
 * Admin access:
 *   GET /api/pods/notify-me — returns all captured interest (DC1_ADMIN_TOKEN)
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const NOTIFY_FILE = path.join('/tmp', 'dcp-notify-me.jsonl')

// Defensive bounds — the public grid only ever sends short GPU-type labels.
const MAX_GPU_TYPE_LEN = 120
const MAX_EMAIL_LEN = 254
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface NotifyRecord {
  id: string
  gpu_type: string
  email?: string
  url: string
  timestamp: string
  ip: string
  userAgent: string
}

function appendRecord(record: NotifyRecord): void {
  try {
    fs.appendFileSync(NOTIFY_FILE, JSON.stringify(record) + '\n', 'utf8')
  } catch {
    // /tmp write failure is non-fatal; we still have the console log
  }
}

function readAll(): NotifyRecord[] {
  try {
    if (!fs.existsSync(NOTIFY_FILE)) return []
    const lines = fs.readFileSync(NOTIFY_FILE, 'utf8').trim().split('\n').filter(Boolean)
    return lines.map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

// ── POST /api/pods/notify-me ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let payload: { gpu_type?: unknown; email?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const gpuType = typeof payload.gpu_type === 'string' ? payload.gpu_type.trim().slice(0, MAX_GPU_TYPE_LEN) : ''
  if (!gpuType) {
    return NextResponse.json({ error: 'Missing gpu_type' }, { status: 400 })
  }

  // Email is optional; if present it must look like an address.
  let email: string | undefined
  if (typeof payload.email === 'string' && payload.email.trim()) {
    const candidate = payload.email.trim().slice(0, MAX_EMAIL_LEN)
    if (!EMAIL_RE.test(candidate)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    email = candidate
  }

  const record: NotifyRecord = {
    id: `nm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    gpu_type: gpuType,
    email,
    url: (req.headers.get('referer') ?? '').slice(0, 500),
    timestamp: new Date().toISOString(),
    ip: req.headers.get('x-forwarded-for') ?? 'unknown',
    userAgent: (req.headers.get('user-agent') ?? '').slice(0, 200),
  }

  appendRecord(record)
  console.log('[DCP NotifyMe]', JSON.stringify(record))

  return NextResponse.json({ ok: true, id: record.id }, { status: 201 })
}

// ── GET /api/pods/notify-me (admin only) ────────────────────────────────────

export async function GET(req: NextRequest) {
  const adminToken = process.env.DC1_ADMIN_TOKEN
  const authHeader = req.headers.get('authorization')

  if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const records = readAll()

  return NextResponse.json(
    { count: records.length, records },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Disposition': 'inline; filename="dcp-notify-me.json"',
      },
    },
  )
}
