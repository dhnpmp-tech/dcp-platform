'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google'

// Page-scoped fonts. Matches the Claude Design "DCP Redesign" preview —
// Instrument Serif for editorial display, Inter for body, JetBrains Mono
// for tabular/metadata. Loaded only on /mission so the rest of the app
// keeps its existing typography stack.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--mc-sans' })
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--mc-serif' })
const mono  = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--mc-mono' })

const API_BASE = '/api'

type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled'
type TaskPriority = 'p0' | 'p1' | 'p2' | 'p3'
type AssigneeKind = 'human' | 'agent'

interface Assignee {
  id: string
  display_name: string
  kind: AssigneeKind
  external_id?: string | null
  active?: number
}

interface Task {
  id: string
  title: string
  description?: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id?: string | null
  assignee_name?: string | null
  assignee_kind?: AssigneeKind | null
  milestone_id?: string | null
  milestone_name?: string | null
  goal_id?: string | null
  goal_title?: string | null
  due_date?: string | null
  blocked_reason?: string | null
  source?: string | null
  source_url?: string | null
  external_id?: string | null
  created_at: string
  updated_at: string
  completed_at?: string | null
}

interface Goal {
  id: string
  title: string
  description?: string | null
  status: 'active' | 'paused' | 'done' | 'dropped'
  target_date?: string | null
  owner_name?: string | null
  task_count?: number
  task_done?: number
  milestone_count?: number
  milestone_done?: number
}

interface Overview {
  counts: Record<TaskStatus, number>
  today: Task[]
  blocked: Task[]
  recent_done: Task[]
  active_goals: Goal[]
  generated_at: string
}

interface FleetProvider {
  id: number
  name: string
  state: 'online' | 'stale' | 'offline' | 'paused' | 'unreachable' | 'never_seen' | 'unknown'
  reason: string | null
  gpu_model: string | null
  vram_gb: number | null
  wg_mesh_ip: string | null
  last_heartbeat: string | null
  last_heartbeat_age_seconds: number | null
}

interface Fleet {
  counts: { online: number; stale: number; unreachable: number; paused: number; total: number }
  jobs: { last_24h: number; failed_24h: number; lifetime: number }
  renters: { total: number; active_24h: number }
  online: FleetProvider[]
  stale: FleetProvider[]
  unreachable: FleetProvider[]
  offline_recent: FleetProvider[]
  paused: FleetProvider[]
}

interface Repo {
  slug: string
  label: string
  tagline?: string
  default_branch?: string
  pushed_at?: string
  open_issues?: number
  last_commit?: { sha: string; message: string; author: string; date: string; url: string }
  error?: string | null
}

interface FileLink {
  label: string
  url: string
  kind: 'folder' | 'file'
}

type Section = 'overview' | 'board' | 'goals'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  p0: 'P0', p1: 'P1', p2: 'P2', p3: 'P3',
}

const BOARD_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'review', 'blocked', 'done']

function formatDate(iso?: string | null) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch { return null }
}

function dueLabel(iso?: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: `${-diffDays}d overdue`, tone: 'hot' }
  if (diffDays === 0) return { label: 'Due today', tone: 'hot' }
  if (diffDays === 1) return { label: 'Due tomorrow', tone: 'warm' }
  if (diffDays <= 7) return { label: `Due in ${diffDays}d`, tone: 'cool' }
  return { label: formatDate(iso) || '', tone: 'mute' }
}

function authHeaders(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (typeof window === 'undefined') return h
  const adminToken = localStorage.getItem('dc1_admin_token')
  if (adminToken) { h['x-admin-token'] = adminToken; return h }
  const renterKey = localStorage.getItem('dc1_renter_key')
  if (renterKey) h['x-renter-key'] = renterKey
  return h
}

export default function MissionControlPage() {
  const [section, setSection] = useState<Section>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [fleet, setFleet] = useState<Fleet | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [fileLinks, setFileLinks] = useState<FileLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [showNewTask, setShowNewTask] = useState(false)
  const [showNewGoal, setShowNewGoal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchAll = useCallback(async () => {
    setError('')
    try {
      const headers = authHeaders()
      const [ov, tk, gl, as, fl, rp, fi] = await Promise.all([
        fetch(`${API_BASE}/mission/overview`, { headers }),
        fetch(`${API_BASE}/mission/tasks`, { headers }),
        fetch(`${API_BASE}/mission/goals`, { headers }),
        fetch(`${API_BASE}/mission/assignees`, { headers }),
        fetch(`${API_BASE}/mission/fleet`, { headers }),
        fetch(`${API_BASE}/mission/repos`, { headers }),
        fetch(`${API_BASE}/mission/files`, { headers }),
      ])
      if (ov.status === 401 || tk.status === 401) {
        const detail = await ov.json().catch(() => null) as { error?: string } | null
        const hasAdmin = typeof window !== 'undefined' && !!localStorage.getItem('dc1_admin_token')
        const hasRenter = typeof window !== 'undefined' && !!localStorage.getItem('dc1_renter_key')
        const which = hasAdmin ? 'admin token' : hasRenter ? 'renter key' : 'no DCP key found in this browser'
        setError(`Auth rejected (401${detail?.error ? ` — ${detail.error}` : ''}). Browser is sending: ${which}. ` +
          (!hasAdmin && !hasRenter
            ? 'Open /login and sign in, then come back to /mission.'
            : 'The token may be revoked or mismatched. Try clearing localStorage and signing in again.'))
        setLoading(false)
        return
      }
      if (!ov.ok || !tk.ok || !gl.ok || !as.ok) throw new Error('failed to load mission control')
      const [ovJson, tkJson, glJson, asJson] = await Promise.all([ov.json(), tk.json(), gl.json(), as.json()])
      setOverview(ovJson)
      setTasks(tkJson.tasks || [])
      setGoals(glJson.goals || [])
      setAssignees(asJson.assignees || [])
      if (fl.ok) { try { setFleet(await fl.json()) } catch {} }
      if (rp.ok) { try { const j = await rp.json(); setRepos(j.repos || []) } catch {} }
      if (fi.ok) { try { const j = await fi.json(); setFileLinks(j.links || []) } catch {} }
      setLastUpdated(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const tasksByStatus = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], blocked: [], review: [], done: [], cancelled: [] }
    for (const t of tasks) m[t.status]?.push(t)
    return m
  }, [tasks])

  const moveTask = useCallback(async (task: Task, status: TaskStatus) => {
    if (task.status === status) return
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)))
    try {
      const res = await fetch(`${API_BASE}/mission/tasks/${task.id}`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('move failed')
    } catch {
      fetchAll()
    }
  }, [fetchAll])

  return (
    <div className={`mc-root ${inter.variable} ${serif.variable} ${mono.variable}`}>
      <style jsx global>{`
        .mc-root {
          /* Midnight palette ported from public/preview-bundle/DCP Redesign.html */
          --bg:    #0a0b1a;
          --bg-2:  #10122a;
          --paper: #161834;
          --ink:   #f5f3ee;
          --ink-2: #c9c5bd;
          --mut:   #7b7a92;
          --dim:   #4e4d67;
          --line:  #272848;
          --hair:  #1f2040;
          --teal:  #2dd4b6;
          --orange:#ee7a3c;
          --hot:   #ee7a3c;
          --grad:  linear-gradient(90deg, #2dd4b6 0%, #2dd4b6 28%, #6bb39a 55%, #ee7a3c 100%);
          --sans:  var(--mc-sans), system-ui, -apple-system, sans-serif;
          --serif: var(--mc-serif), 'Times New Roman', serif;
          --mono:  var(--mc-mono), ui-monospace, Menlo, monospace;
          font-family: var(--sans);
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
        }
        .mc-root *, .mc-root *::before, .mc-root *::after { box-sizing: border-box; }
        .mc-mono { font-family: var(--mono); }
        .mc-serif { font-family: var(--serif); }
        .mc-eyebrow {
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: var(--mut);
        }
        .mc-grad-text {
          background-image: var(--grad);
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
        }
        @keyframes mcPulse { 0%,100% { opacity:1; } 50% { opacity:.25; } }
        .mc-pulse-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--teal);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--teal) 25%, transparent);
          animation: mcPulse 1.8s ease-in-out infinite;
        }
        .mc-pulse-dot.hot {
          background: var(--orange);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--orange) 25%, transparent);
        }
        @media (max-width: 700px) { .mc-main { padding: 24px 18px 120px !important; } }
        @keyframes mcMarq { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .mc-marq-in { display: inline-flex; gap: 48px; animation: mcMarq 60s linear infinite; }
        .mc-marq-in span { display: inline-flex; align-items: center; gap: 12px; }
        .mc-marq-in span::before { content: '∞'; color: var(--teal); font-size: 13px; }
        @media (prefers-reduced-motion: reduce) { .mc-marq-in { animation: none; } }
        @media (max-width: 700px) { .mc-topbar { padding: 14px 18px !important; gap: 12px !important; } }
        @media (max-width: 900px) { .mc-tabs { display: none !important; } }
        @media (max-width: 900px) { .mc-stats-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 500px) { .mc-stats-grid { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 900px) { .mc-two-col { grid-template-columns: 1fr !important; gap: 24px !important; } }
        @media (max-width: 900px) { .mc-goal-grid { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 600px) { .mc-goal-grid { grid-template-columns: 1fr !important; } }
        @media (max-width: 1100px) { .mc-board-grid { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (max-width: 760px) { .mc-board-grid { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 500px) { .mc-board-grid { grid-template-columns: 1fr !important; } }
        @media (max-width: 600px) { .mc-modal-grid { grid-template-columns: 1fr !important; } }
        .mc-mobnav { display: none; }
        @media (max-width: 900px) { .mc-mobnav { display: block !important; } }
        .mc-row { transition: background .15s; }
        .mc-row:hover { background: color-mix(in oklab, var(--ink) 4%, transparent); }
        .mc-modal-overlay { align-items: flex-end; }
        @media (min-width: 700px) { .mc-modal-overlay { align-items: center; } }
        .mc-modal-sheet { position: relative; }
        .mc-modal-sheet::before { content: ''; position: absolute; inset-inline: -1px; top: -1px; height: 2px; background: var(--grad); }
        @media (min-width: 700px) { .mc-modal-sheet { box-shadow: 0 30px 80px -20px rgba(0,0,0,.6); } }
      `}</style>

      <Marquee lastUpdated={lastUpdated} />
      <TopBar
        section={section}
        onSection={setSection}
        onRefresh={fetchAll}
        onNewTask={() => setShowNewTask(true)}
        onNewGoal={() => setShowNewGoal(true)}
        lastUpdated={lastUpdated}
      />

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 32px 120px' }} className="mc-main">
        {error && (
          <div style={{
            border: '1px solid color-mix(in oklab, var(--orange) 40%, var(--line))',
            background: 'color-mix(in oklab, var(--orange) 8%, var(--paper))',
            padding: '14px 16px',
            marginBottom: 24,
            fontSize: 13.5,
            color: 'var(--ink-2)',
            lineHeight: 1.5,
          }}>{error}</div>
        )}

        {loading && !overview ? (
          <div className="mc-eyebrow" style={{ textAlign: 'center', padding: '80px 0' }}>Loading…</div>
        ) : (
          <>
            {section === 'overview' && overview && <Overview overview={overview} fleet={fleet} repos={repos} fileLinks={fileLinks} onOpenTask={setEditingTask} />}
            {section === 'board' && (
              <Board tasksByStatus={tasksByStatus} onMove={moveTask} onOpen={setEditingTask} />
            )}
            {section === 'goals' && <Goals goals={goals} tasks={tasks} onOpenTask={setEditingTask} />}
          </>
        )}
      </main>

      <MobileNav section={section} onSection={setSection} onNewTask={() => setShowNewTask(true)} />

      {showNewTask && (
        <TaskModal
          assignees={assignees} goals={goals}
          onClose={() => setShowNewTask(false)}
          onSaved={() => { setShowNewTask(false); fetchAll() }}
        />
      )}
      {showNewGoal && (
        <GoalModal
          assignees={assignees}
          onClose={() => setShowNewGoal(false)}
          onSaved={() => { setShowNewGoal(false); fetchAll() }}
        />
      )}
      {editingTask && (
        <TaskModal
          assignees={assignees} goals={goals} task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={() => { setEditingTask(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ── Marquee strip (top of page) ─────────────────────────────────────────
function Marquee({ lastUpdated }: { lastUpdated: Date | null }) {
  const items = [
    'MISSION CONTROL',
    'TASKS · GOALS · MILESTONES',
    'HUMANS + AGENTS',
    'SAUDI SOVEREIGN COMPUTE',
    lastUpdated ? `LAST SYNC ${lastUpdated.toLocaleTimeString()}` : 'LIVE',
  ]
  return (
    <div style={{
      background: '#04050d',
      color: 'var(--ink-2)',
      fontFamily: 'var(--mono)',
      fontSize: 11,
      letterSpacing: '.18em',
      borderBottom: '1px solid var(--line)',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      padding: '9px 0',
    }}>
      <div className="mc-marq-in">
        {[...items, ...items, ...items].map((s, i) => <span key={i}>{s}</span>)}
      </div>
    </div>
  )
}

// ── Sticky top bar ─────────────────────────────────────────────────────
function TopBar({
  section, onSection, onRefresh, onNewTask, onNewGoal, lastUpdated,
}: {
  section: Section
  onSection: (s: Section) => void
  onRefresh: () => void
  onNewTask: () => void
  onNewGoal: () => void
  lastUpdated: Date | null
}) {
  const tabs: { key: Section; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'board',    label: 'Board' },
    { key: 'goals',    label: 'Goals' },
  ]
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: 'color-mix(in oklab, var(--bg) 88%, transparent)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--hair)',
    }}>
      <div style={{
        maxWidth: 1280, margin: '0 auto',
        padding: '18px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
      }} className="mc-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <span className="mc-grad-text mc-serif" style={{ fontWeight: 700, fontSize: 24, lineHeight: 1 }}>∞</span>
          <span className="mc-serif" style={{ fontSize: 22, letterSpacing: '-.01em', lineHeight: 1 }}>
            Mission <em className="mc-grad-text" style={{ fontStyle: 'italic' }}>Control</em>
          </span>
        </div>

        <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }} className="mc-tabs">
          {tabs.map((t) => {
            const on = section === t.key
            return (
              <button
                key={t.key}
                onClick={() => onSection(t.key)}
                className="mc-mono"
                style={{
                  padding: '8px 14px',
                  fontSize: 11,
                  letterSpacing: '.16em',
                  textTransform: 'uppercase',
                  color: on ? 'var(--ink)' : 'var(--mut)',
                  border: '1px solid',
                  borderColor: on ? 'var(--ink)' : 'transparent',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: 2,
                  transition: 'all .15s',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mc-mono" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', border: '1px solid var(--hair)', borderRadius: 999,
            fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mut)',
          }} title={lastUpdated ? `Last sync ${lastUpdated.toLocaleTimeString()}` : 'Live'}>
            <span className="mc-pulse-dot" />
            LIVE
          </span>
          <button
            onClick={onRefresh}
            className="mc-mono mc-refresh"
            title="Refresh"
            style={{
              padding: '8px 10px', fontSize: 12, color: 'var(--mut)',
              border: '1px solid var(--hair)', borderRadius: 2, background: 'transparent', cursor: 'pointer',
            }}
          >↻</button>
          <button
            onClick={section === 'goals' ? onNewGoal : onNewTask}
            className="mc-mono mc-new"
            style={{
              padding: '8px 16px', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
              color: 'var(--bg)', background: 'var(--ink)', border: '1px solid var(--ink)',
              borderRadius: 2, cursor: 'pointer',
            }}
          >+ {section === 'goals' ? 'Goal' : 'Task'}</button>
        </div>
      </div>
    </header>
  )
}

// ── Section meta strip (mono eyebrow with index + label) ───────────────
function SectionMeta({ index, label, right }: { index: string; label: string; right?: React.ReactNode }) {
  return (
    <div className="mc-eyebrow" style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      paddingBottom: 18, borderBottom: '1px solid var(--hair)', marginBottom: 28, gap: 16,
    }}>
      <span><span style={{ color: 'var(--ink)' }}>{index}</span> &nbsp; / &nbsp; {label}</span>
      {right && <span>{right}</span>}
    </div>
  )
}

// ── Overview ───────────────────────────────────────────────────────────
function Overview({
  overview, fleet, repos, fileLinks, onOpenTask,
}: {
  overview: Overview
  fleet: Fleet | null
  repos: Repo[]
  fileLinks: FileLink[]
  onOpenTask: (t: Task) => void
}) {
  const { counts, today, blocked, recent_done, active_goals } = overview
  const stats: { label: string; value: number; tone: 'teal' | 'orange' | 'ink' | 'mut' }[] = [
    { label: 'In Progress', value: counts.in_progress || 0, tone: 'teal' },
    { label: 'Review',      value: counts.review || 0,      tone: 'ink' },
    { label: 'Blocked',     value: counts.blocked || 0,     tone: 'orange' },
    { label: 'To Do',       value: counts.todo || 0,        tone: 'mut' },
    { label: 'Done',        value: counts.done || 0,        tone: 'teal' },
  ]
  const toneColor = { teal: 'var(--teal)', orange: 'var(--orange)', ink: 'var(--ink)', mut: 'var(--mut)' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 56 }}>
      <section>
        <SectionMeta index="01" label="Snapshot" right={overview.generated_at ? new Date(overview.generated_at).toLocaleTimeString() : ''} />
        <div className="mc-stats-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
          border: '1px solid var(--line)', background: 'var(--paper)',
        }}>
          {stats.map((s, i) => (
            <div key={s.label} style={{
              padding: '24px 20px',
              borderRight: i < stats.length - 1 ? '1px solid var(--hair)' : 'none',
              borderBottom: '1px solid var(--hair)',
            }}>
              <div className="mc-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mut)' }}>
                {s.label}
              </div>
              <div className="mc-serif" style={{
                fontSize: 52, lineHeight: 1, marginTop: 6, letterSpacing: '-.02em',
                color: toneColor[s.tone],
              }}>{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      {fleet && <FleetGlimpse fleet={fleet} />}

      <section>
        <SectionMeta index="03" label="Today & Blocked" right={`${today.length + blocked.length} items`} />
        <div className="mc-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <ListCard title="Today" caption="In progress, review, or due in ≤ 24h" tasks={today} onOpen={onOpenTask} emptyText="Nothing on deck." />
          <ListCard title="Blocked" caption="Awaiting unblock" tasks={blocked} onOpen={onOpenTask} emptyText="No blockers." accentHot />
        </div>
      </section>

      {active_goals && active_goals.length > 0 && (
        <section>
          <SectionMeta index="04" label="Active Goals" />
          <div className="mc-goal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {active_goals.map((g) => <GoalChip key={g.id} goal={g} />)}
          </div>
        </section>
      )}

      {repos.length > 0 && <ReposSection repos={repos} />}

      {fileLinks.length > 0 && <FilesSection links={fileLinks} />}

      {recent_done && recent_done.length > 0 && (
        <section>
          <SectionMeta index="07" label="Recently Shipped" />
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--line)', background: 'var(--paper)' }}>
            {recent_done.map((t, i) => (
              <li key={t.id} onClick={() => onOpenTask(t)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px',
                borderBottom: i === recent_done.length - 1 ? 'none' : '1px solid var(--hair)',
                cursor: 'pointer',
              }}>
                <Avatar name={t.assignee_name} kind={t.assignee_kind} size={22} />
                <span style={{ fontSize: 14, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                <span className="mc-mono" style={{ fontSize: 11, color: 'var(--mut)', flexShrink: 0 }}>
                  {formatDate(t.completed_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ── Avatar (initials bubble, color-coded by assignee kind) ─────────────
function Avatar({ name, kind, size = 28 }: { name?: string | null; kind?: AssigneeKind | null; size?: number }) {
  const initials = (() => {
    if (!name) return '?'
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    const ch = (parts[0]?.[0] || '') + (parts.length > 1 ? (parts[parts.length - 1][0] || '') : '')
    return ch.toUpperCase().slice(0, 2)
  })()
  const bg = kind === 'agent' ? 'color-mix(in oklab, var(--teal) 22%, var(--paper))' : 'color-mix(in oklab, var(--orange) 14%, var(--paper))'
  const fg = kind === 'agent' ? 'var(--teal)' : 'var(--ink)'
  const border = kind === 'agent' ? 'color-mix(in oklab, var(--teal) 50%, transparent)' : 'color-mix(in oklab, var(--orange) 40%, transparent)'
  return (
    <span title={name || 'unassigned'} className="mc-mono" style={{
      width: size, height: size, borderRadius: '50%',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: bg, color: fg, border: `1px solid ${border}`,
      fontSize: Math.round(size * 0.42), fontWeight: 600,
      flexShrink: 0, letterSpacing: 0,
    }}>{initials}</span>
  )
}

// ── Fleet glimpse: who's online, who's offline + why, jobs ─────────────
function FleetGlimpse({ fleet }: { fleet: Fleet }) {
  const stateColor = (s: FleetProvider['state']) =>
    s === 'online' ? 'var(--teal)'
    : s === 'stale' || s === 'unreachable' ? 'var(--orange)'
    : s === 'paused' ? '#e8a854'
    : 'var(--mut)'
  return (
    <section>
      <SectionMeta
        index="02"
        label="Fleet"
        right={`${fleet.counts.online}/${fleet.counts.total} online · ${fleet.jobs.last_24h} jobs/24h · ${fleet.renters.active_24h} active renters`}
      />
      <div className="mc-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        {/* Online */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 2, background: 'var(--teal)' }} />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--hair)' }}>
            <div>
              <div className="mc-serif" style={{ fontSize: 22, letterSpacing: '-.01em' }}>Online</div>
              <div className="mc-mono" style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 4, letterSpacing: '.08em' }}>
                Heartbeat in the last 90s
              </div>
            </div>
            <span className="mc-mono" style={{ fontSize: 11, color: 'var(--mut)' }}>{String(fleet.online.length).padStart(2, '0')}</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {fleet.online.length === 0 ? (
              <div className="mc-eyebrow" style={{ textAlign: 'center', padding: '32px 18px' }}>No providers online</div>
            ) : fleet.online.map((p, i) => (
              <div key={p.id} style={{ padding: '12px 18px', borderBottom: i === fleet.online.length - 1 ? 'none' : '1px solid var(--hair)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stateColor(p.state), flexShrink: 0, boxShadow: `0 0 0 3px color-mix(in oklab, ${stateColor(p.state)} 25%, transparent)` }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14 }}>{p.name}</div>
                  <div className="mc-mono" style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 2, letterSpacing: '.04em' }}>
                    {p.gpu_model || '—'}{p.vram_gb ? ` · ${p.vram_gb}GB` : ''}{p.wg_mesh_ip ? ` · ${p.wg_mesh_ip}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Offline / stale / unreachable */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 2, background: 'var(--orange)' }} />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--hair)' }}>
            <div>
              <div className="mc-serif" style={{ fontSize: 22, letterSpacing: '-.01em', color: 'var(--orange)' }}>Offline</div>
              <div className="mc-mono" style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 4, letterSpacing: '.08em' }}>
                Why each provider is down
              </div>
            </div>
            <span className="mc-mono" style={{ fontSize: 11, color: 'var(--mut)' }}>{String(fleet.offline_recent.length + fleet.stale.length + fleet.unreachable.length).padStart(2, '0')}</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {[...fleet.unreachable, ...fleet.stale, ...fleet.offline_recent].slice(0, 12).map((p, i, arr) => (
              <div key={p.id} style={{ padding: '12px 18px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--hair)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stateColor(p.state), flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    {p.name}
                    <span className="mc-mono" style={{ fontSize: 10, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '.1em' }}>{p.state}</span>
                  </div>
                  {p.reason && <div className="mc-mono" style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 2 }}>{p.reason}</div>}
                </div>
              </div>
            ))}
            {fleet.offline_recent.length === 0 && fleet.stale.length === 0 && fleet.unreachable.length === 0 && (
              <div className="mc-eyebrow" style={{ textAlign: 'center', padding: '32px 18px' }}>Whole fleet is up.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mc-mono" style={{ marginTop: 12, fontSize: 10.5, color: 'var(--mut)', letterSpacing: '.1em', textTransform: 'uppercase', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span>Last 24h · <span style={{ color: 'var(--ink)' }}>{fleet.jobs.last_24h}</span> jobs</span>
        <span>Failed · <span style={{ color: fleet.jobs.failed_24h > 0 ? 'var(--orange)' : 'var(--mut)' }}>{fleet.jobs.failed_24h}</span></span>
        <span>Lifetime · <span style={{ color: 'var(--ink)' }}>{fleet.jobs.lifetime}</span></span>
        <span>Renters · <span style={{ color: 'var(--ink)' }}>{fleet.renters.active_24h}</span> active / {fleet.renters.total} total</span>
      </div>
    </section>
  )
}

// ── Repos: last commit per tracked GitHub repo ─────────────────────────
function ReposSection({ repos }: { repos: Repo[] }) {
  const since = (iso?: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    const diffMs = Date.now() - d.getTime()
    const mins = Math.round(diffMs / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const h = Math.round(mins / 60)
    if (h < 48) return `${h}h ago`
    return `${Math.round(h / 24)}d ago`
  }
  return (
    <section>
      <SectionMeta index="05" label="Repos" right={`${repos.length} tracked`} />
      <div className="mc-goal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {repos.map((r) => (
          <a key={r.slug} href={r.last_commit?.url || `https://github.com/${r.slug}`} target="_blank" rel="noreferrer" style={{
            display: 'block',
            background: 'var(--paper)', border: '1px solid var(--line)', padding: '16px 18px',
            color: 'inherit', textDecoration: 'none', transition: 'border-color .15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div className="mc-serif" style={{ fontSize: 19, letterSpacing: '-.01em' }}>{r.label}</div>
                {r.tagline && <div className="mc-mono" style={{ fontSize: 10, color: 'var(--mut)', marginTop: 2, letterSpacing: '.08em' }}>{r.tagline}</div>}
              </div>
              <span className="mc-mono" style={{ fontSize: 10.5, color: 'var(--mut)', flexShrink: 0 }}>{since(r.last_commit?.date || r.pushed_at)}</span>
            </div>
            {r.last_commit ? (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as unknown as undefined, overflow: 'hidden' }}>
                {r.last_commit.message}
              </div>
            ) : r.error ? (
              <div className="mc-mono" style={{ marginTop: 10, fontSize: 11, color: 'var(--orange)' }}>{r.error}</div>
            ) : null}
            {r.last_commit && (
              <div className="mc-mono" style={{ marginTop: 8, fontSize: 10.5, color: 'var(--mut)', letterSpacing: '.04em' }}>
                {r.last_commit.author} · {r.last_commit.sha}{r.open_issues != null ? ` · ${r.open_issues} open issues` : ''}
              </div>
            )}
          </a>
        ))}
      </div>
    </section>
  )
}

// ── Files (Nextcloud quick links) ──────────────────────────────────────
function FilesSection({ links }: { links: FileLink[] }) {
  return (
    <section>
      <SectionMeta index="06" label="Files" right="Nextcloud" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {links.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--paper)', border: '1px solid var(--line)', padding: '12px 14px',
            color: 'inherit', textDecoration: 'none', transition: 'border-color .15s',
          }}>
            <span className="mc-serif mc-grad-text" style={{ fontSize: 22, lineHeight: 1, fontStyle: 'italic' }}>{l.kind === 'folder' ? '◰' : '▢'}</span>
            <span style={{ fontSize: 13.5, flex: 1 }}>{l.label}</span>
            <span className="mc-mono" style={{ fontSize: 10, color: 'var(--mut)' }}>↗</span>
          </a>
        ))}
      </div>
    </section>
  )
}

function ListCard({
  title, caption, tasks, onOpen, emptyText, accentHot,
}: {
  title: string; caption?: string; tasks: Task[]
  onOpen: (t: Task) => void; emptyText: string; accentHot?: boolean
}) {
  return (
    <div style={{
      background: 'var(--paper)', border: '1px solid var(--line)',
      position: 'relative', overflow: 'hidden',
    }}>
      {accentHot && <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 2, background: 'var(--orange)' }} />}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        padding: '16px 18px', borderBottom: '1px solid var(--hair)',
      }}>
        <div>
          <div className="mc-serif" style={{ fontSize: 22, letterSpacing: '-.01em', color: accentHot ? 'var(--orange)' : 'var(--ink)' }}>{title}</div>
          {caption && <div className="mc-mono" style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 4, letterSpacing: '.08em' }}>{caption}</div>}
        </div>
        <span className="mc-mono" style={{ fontSize: 11, color: 'var(--mut)' }}>{tasks.length.toString().padStart(2, '0')}</span>
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {tasks.length === 0 && (
          <div className="mc-eyebrow" style={{ textAlign: 'center', padding: '40px 18px' }}>{emptyText}</div>
        )}
        {tasks.map((t, i) => <TaskRow key={t.id} task={t} onOpen={onOpen} isLast={i === tasks.length - 1} />)}
      </div>
    </div>
  )
}

function TaskRow({ task, onOpen, isLast }: { task: Task; onOpen: (t: Task) => void; isLast?: boolean }) {
  const due = dueLabel(task.due_date)
  const dueColor = due?.tone === 'hot' ? 'var(--orange)' : due?.tone === 'warm' ? '#e8a854' : due?.tone === 'cool' ? 'var(--ink-2)' : 'var(--mut)'
  const prMatch = task.source_url && /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/.exec(task.source_url)
  return (
    <div onClick={() => onOpen(task)} style={{
      padding: '14px 18px', borderBottom: isLast ? 'none' : '1px solid var(--hair)',
      cursor: 'pointer', transition: 'background .15s',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }} className="mc-row">
      <Avatar name={task.assignee_name} kind={task.assignee_kind} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.4, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span>{task.title}</span>
          {prMatch && (
            <a href={task.source_url || '#'} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mc-mono" style={{
              fontSize: 10, color: 'var(--teal)', textDecoration: 'none',
              border: '1px solid color-mix(in oklab, var(--teal) 40%, transparent)', padding: '1px 6px',
              borderRadius: 2, letterSpacing: '.08em', textTransform: 'uppercase',
            }}>PR #{prMatch[1]}</a>
          )}
        </div>
        <div className="mc-mono" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: 'var(--mut)', letterSpacing: '.04em' }}>
          <span style={{ color: task.priority === 'p0' ? 'var(--orange)' : task.priority === 'p1' ? '#e8a854' : 'var(--mut)' }}>
            {PRIORITY_LABEL[task.priority]}
          </span>
          {task.assignee_name && (
            <span style={{ color: task.assignee_kind === 'agent' ? 'var(--teal)' : 'var(--ink-2)' }}>
              {task.assignee_name}
            </span>
          )}
          {task.goal_title && <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {task.goal_title}</span>}
          {due && <span style={{ color: dueColor }}>{due.label}</span>}
        </div>
        {task.status === 'blocked' && task.blocked_reason && (
          <div className="mc-mono" style={{ marginTop: 4, fontSize: 11, color: 'var(--orange)', letterSpacing: '.02em', lineHeight: 1.4 }}>
            ↳ {task.blocked_reason}
          </div>
        )}
      </div>
    </div>
  )
}

function GoalChip({ goal }: { goal: Goal }) {
  const total = goal.task_count || 0
  const done = goal.task_done || 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div style={{
      background: 'var(--paper)', border: '1px solid var(--line)',
      padding: '18px 18px 16px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <h3 className="mc-serif" style={{ fontSize: 19, letterSpacing: '-.01em', margin: 0, lineHeight: 1.2 }}>{goal.title}</h3>
        {goal.target_date && (
          <span className="mc-mono" style={{ fontSize: 10.5, color: 'var(--mut)', flexShrink: 0, letterSpacing: '.06em' }}>
            {formatDate(goal.target_date)}
          </span>
        )}
      </div>
      <div style={{ height: 4, background: 'var(--hair)', position: 'relative', marginTop: 8 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--grad)', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform .6s cubic-bezier(.2,.7,.2,1)' }} />
      </div>
      <div className="mc-mono" style={{ marginTop: 10, fontSize: 10.5, letterSpacing: '.1em', color: 'var(--mut)', textTransform: 'uppercase' }}>
        {done}/{total} · <span style={{ color: 'var(--ink)' }}>{pct}%</span>
      </div>
    </div>
  )
}

// ── Board (Kanban) ─────────────────────────────────────────────────────
function Board({
  tasksByStatus, onMove, onOpen,
}: {
  tasksByStatus: Record<TaskStatus, Task[]>
  onMove: (task: Task, status: TaskStatus) => void
  onOpen: (t: Task) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const total = BOARD_COLUMNS.reduce((acc, s) => acc + tasksByStatus[s].length, 0)
  return (
    <div>
      <SectionMeta index="02" label="Board" right={`${total} tasks`} />
      <div className="mc-board-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {BOARD_COLUMNS.map((status) => {
          const accent = status === 'in_progress' ? 'var(--teal)' : status === 'blocked' ? 'var(--orange)' : status === 'done' ? 'var(--teal)' : 'var(--mut)'
          return (
            <div
              key={status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragId) return
                const all = Object.values(tasksByStatus).flat()
                const t = all.find((x) => x.id === dragId)
                if (t) onMove(t, status)
                setDragId(null)
              }}
              style={{
                background: 'var(--paper)', border: '1px solid var(--line)',
                display: 'flex', flexDirection: 'column', minHeight: 240,
                position: 'relative', overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 1, background: accent, opacity: 0.6 }} />
              <div style={{
                padding: '12px 14px', borderBottom: '1px solid var(--hair)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span className="mc-mono" style={{ fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink)' }}>
                  {STATUS_LABEL[status]}
                </span>
                <span className="mc-mono" style={{ fontSize: 11, color: 'var(--mut)' }}>{tasksByStatus[status].length}</span>
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, maxHeight: '70vh', overflowY: 'auto' }}>
                {tasksByStatus[status].map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => onOpen(task)}
                    style={{
                      background: 'var(--bg-2)', border: '1px solid var(--hair)',
                      padding: '10px 12px', cursor: 'grab', borderRadius: 2,
                      transition: 'border-color .15s',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <Avatar name={task.assignee_name} kind={task.assignee_kind} size={22} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.35 }}>{task.title}</div>
                        <div className="mc-mono" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10.5, color: 'var(--mut)' }}>
                          <span style={{ color: task.priority === 'p0' ? 'var(--orange)' : task.priority === 'p1' ? '#e8a854' : 'var(--mut)' }}>
                            {PRIORITY_LABEL[task.priority]}
                          </span>
                          {task.assignee_name && <span style={{ color: task.assignee_kind === 'agent' ? 'var(--teal)' : 'var(--ink-2)' }}>{task.assignee_name}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {tasksByStatus[status].length === 0 && (
                  <div className="mc-eyebrow" style={{ textAlign: 'center', padding: '32px 0' }}>empty</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mc-mono" style={{ marginTop: 16, fontSize: 10.5, color: 'var(--mut)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
        Drag cards to move · Tap to edit
      </p>
    </div>
  )
}

// ── Goals view ─────────────────────────────────────────────────────────
function Goals({ goals, tasks, onOpenTask }: { goals: Goal[]; tasks: Task[]; onOpenTask: (t: Task) => void }) {
  return (
    <div>
      <SectionMeta index="03" label="Goals" right={`${goals.length}`} />
      {goals.length === 0 ? (
        <div className="mc-eyebrow" style={{
          padding: '60px 20px', textAlign: 'center',
          border: '1px dashed var(--line)', background: 'var(--paper)',
        }}>No goals yet — tap + Goal to add the first one.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {goals.map((g) => {
            const goalTasks = tasks.filter((t) => t.goal_id === g.id)
            const done = goalTasks.filter((t) => t.status === 'done').length
            const pct = goalTasks.length ? Math.round((done / goalTasks.length) * 100) : 0
            return (
              <div key={g.id} style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
                <div style={{ padding: '20px 22px', borderBottom: goalTasks.length ? '1px solid var(--hair)' : 'none' }}>
                  <h3 className="mc-serif" style={{ fontSize: 26, letterSpacing: '-.01em', margin: 0, lineHeight: 1.15 }}>{g.title}</h3>
                  {g.description && <p style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5 }}>{g.description}</p>}
                  <div className="mc-mono" style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 10.5, color: 'var(--mut)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    <span>{g.owner_name || 'unowned'}</span>
                    {g.target_date && <span>Target · {formatDate(g.target_date)}</span>}
                    <span>{done}/{goalTasks.length} · <span style={{ color: 'var(--ink)' }}>{pct}%</span></span>
                  </div>
                  <div style={{ height: 4, background: 'var(--hair)', position: 'relative', marginTop: 14 }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'var(--grad)', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform .6s' }} />
                  </div>
                </div>
                {goalTasks.length > 0 && goalTasks.map((t, i) => (
                  <TaskRow key={t.id} task={t} onOpen={onOpenTask} isLast={i === goalTasks.length - 1} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Mobile bottom nav ──────────────────────────────────────────────────
function MobileNav({ section, onSection, onNewTask }: { section: Section; onSection: (s: Section) => void; onNewTask: () => void }) {
  const tabs: { key: Section; label: string; glyph: string }[] = [
    { key: 'overview', label: 'Today', glyph: '◉' },
    { key: 'board',    label: 'Board', glyph: '▦' },
    { key: 'goals',    label: 'Goals', glyph: '◎' },
  ]
  return (
    <nav className="mc-mobnav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
      background: 'color-mix(in oklab, var(--bg) 92%, transparent)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderTop: '1px solid var(--line)',
      display: 'none',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        maxWidth: 480, margin: '0 auto',
      }}>
        {tabs.map((t) => {
          const on = section === t.key
          return (
            <button key={t.key} onClick={() => onSection(t.key)} className="mc-mono" style={{
              padding: '12px 0 14px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: on ? 'var(--ink)' : 'var(--mut)',
              fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase',
            }}>
              <span style={{ fontSize: 16, color: on ? 'var(--teal)' : 'var(--mut)' }}>{t.glyph}</span>
              {t.label}
            </button>
          )
        })}
        <button onClick={onNewTask} className="mc-mono" style={{
          padding: '12px 0 14px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--teal)',
          fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase',
        }}>
          <span style={{ fontSize: 16 }}>＋</span>
          New
        </button>
      </div>
    </nav>
  )
}

// ── Modals ─────────────────────────────────────────────────────────────
function TaskModal({
  task, assignees, goals, onClose, onSaved,
}: {
  task?: Task
  assignees: Assignee[]; goals: Goal[]
  onClose: () => void; onSaved: () => void
}) {
  const [title, setTitle]             = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [status, setStatus]           = useState<TaskStatus>(task?.status || 'todo')
  const [priority, setPriority]       = useState<TaskPriority>(task?.priority || 'p2')
  const [assigneeId, setAssigneeId]   = useState<string>(task?.assignee_id || '')
  const [goalId, setGoalId]           = useState<string>(task?.goal_id || '')
  const [dueDate, setDueDate]         = useState<string>(task?.due_date ? task.due_date.slice(0, 10) : '')
  const [blocked, setBlocked]         = useState<string>(task?.blocked_reason || '')
  const [saving, setSaving]           = useState(false)
  const [err, setErr]                 = useState<string>('')

  const save = async () => {
    if (!title.trim()) { setErr('Title is required'); return }
    setSaving(true); setErr('')
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      status, priority,
      assignee_id: assigneeId || null,
      goal_id: goalId || null,
      due_date: dueDate || null,
      blocked_reason: status === 'blocked' ? (blocked.trim() || null) : null,
    }
    try {
      const url = task ? `${API_BASE}/mission/tasks/${task.id}` : `${API_BASE}/mission/tasks`
      const res = await fetch(url, {
        method: task ? 'PATCH' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setErr(j.error || 'save failed'); return
      }
      onSaved()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'save failed')
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!task || !confirm('Delete this task?')) return
    setSaving(true)
    try {
      await fetch(`${API_BASE}/mission/tasks/${task.id}`, { method: 'DELETE', headers: authHeaders() })
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title={task ? 'Edit Task' : 'New Task'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Title">
          <Input autoFocus value={title} onChange={(v) => setTitle(v)} />
        </Field>
        <Field label="Description">
          <Textarea rows={3} value={description} onChange={(v) => setDescription(v)} />
        </Field>
        <div className="mc-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Status">
            <Select value={status} onChange={(v) => setStatus(v as TaskStatus)} options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(v) => setPriority(v as TaskPriority)} options={Object.entries(PRIORITY_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Field>
          <Field label="Assignee">
            <Select value={assigneeId} onChange={(v) => setAssigneeId(v)} options={[{ value: '', label: 'Unassigned' }, ...assignees.map((a) => ({ value: a.id, label: `${a.kind === 'agent' ? '⚙ ' : ''}${a.display_name}` }))]} />
          </Field>
          <Field label="Goal">
            <Select value={goalId} onChange={(v) => setGoalId(v)} options={[{ value: '', label: 'None' }, ...goals.map((g) => ({ value: g.id, label: g.title }))]} />
          </Field>
          <Field label="Due">
            <Input type="date" value={dueDate} onChange={(v) => setDueDate(v)} />
          </Field>
        </div>
        {status === 'blocked' && (
          <Field label="Blocked reason">
            <Input value={blocked} onChange={(v) => setBlocked(v)} />
          </Field>
        )}
        {err && <div className="mc-mono" style={{ color: 'var(--orange)', fontSize: 12 }}>{err}</div>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
          {task ? (
            <button onClick={remove} disabled={saving} className="mc-mono" style={{
              fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
              color: 'var(--orange)', background: 'transparent', border: 'none', cursor: 'pointer',
            }}>Delete</button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn primary onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

function GoalModal({ assignees, onClose, onSaved }: { assignees: Assignee[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [ownerId, setOwnerId]         = useState<string>('')
  const [targetDate, setTargetDate]   = useState<string>('')
  const [saving, setSaving]           = useState(false)
  const [err, setErr]                 = useState<string>('')

  const save = async () => {
    if (!title.trim()) { setErr('Title is required'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch(`${API_BASE}/mission/goals`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          owner_id: ownerId || null,
          target_date: targetDate || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setErr(j.error || 'save failed'); return
      }
      onSaved()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'save failed')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="New Goal" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Title"><Input autoFocus value={title} onChange={(v) => setTitle(v)} /></Field>
        <Field label="Description"><Textarea rows={3} value={description} onChange={(v) => setDescription(v)} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Owner">
            <Select value={ownerId} onChange={(v) => setOwnerId(v)} options={[{ value: '', label: 'Unowned' }, ...assignees.map((a) => ({ value: a.id, label: a.display_name }))]} />
          </Field>
          <Field label="Target date"><Input type="date" value={targetDate} onChange={(v) => setTargetDate(v)} /></Field>
        </div>
        {err && <div className="mc-mono" style={{ color: 'var(--orange)', fontSize: 12 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'color-mix(in oklab, var(--bg) 75%, transparent)',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} className="mc-modal-overlay">
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 560,
        background: 'var(--paper)', border: '1px solid var(--line)',
      }} className="mc-modal-sheet">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--hair)',
        }}>
          <h2 className="mc-serif" style={{ fontSize: 22, letterSpacing: '-.01em', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ color: 'var(--mut)', background: 'transparent', border: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 20, maxHeight: '78vh', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Form primitives ────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div className="mc-mono" style={{ fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mut)', marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-2)',
  border: '1px solid var(--hair)',
  color: 'var(--ink)',
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'var(--sans)',
  borderRadius: 2,
  outline: 'none',
}

function Input({ value, onChange, type, autoFocus }: { value: string; onChange: (v: string) => void; type?: string; autoFocus?: boolean }) {
  return <input type={type || 'text'} autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--teal)')} onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hair)')} />
}
function Textarea({ value, onChange, rows }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--teal)')} onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hair)')} />
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--teal)')} onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hair)')}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
function Btn({ children, primary, onClick, disabled }: { children: React.ReactNode; primary?: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="mc-mono" style={{
      padding: '10px 18px', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
      color: primary ? 'var(--bg)' : 'var(--ink)',
      background: primary ? 'var(--ink)' : 'transparent',
      border: '1px solid var(--ink)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      borderRadius: 2,
      transition: 'all .15s',
    }}>{children}</button>
  )
}
