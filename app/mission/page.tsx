'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

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

type Section = 'overview' | 'board' | 'goals'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<TaskStatus, { dot: string; bg: string; text: string; ring: string }> = {
  todo:        { dot: 'bg-dc1-text-muted',  bg: 'bg-dc1-text-muted/10',  text: 'text-dc1-text-muted',  ring: 'ring-dc1-text-muted/40' },
  in_progress: { dot: 'bg-dc1-amber',       bg: 'bg-dc1-amber/10',       text: 'text-dc1-amber',       ring: 'ring-dc1-amber/40' },
  review:      { dot: 'bg-status-info',     bg: 'bg-status-info/10',     text: 'text-status-info',     ring: 'ring-status-info/40' },
  blocked:     { dot: 'bg-status-error',    bg: 'bg-status-error/10',    text: 'text-status-error',    ring: 'ring-status-error/40' },
  done:        { dot: 'bg-status-success',  bg: 'bg-status-success/10',  text: 'text-status-success',  ring: 'ring-status-success/40' },
  cancelled:   { dot: 'bg-dc1-text-muted',  bg: 'bg-dc1-text-muted/10',  text: 'text-dc1-text-muted',  ring: 'ring-dc1-text-muted/40' },
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  p0: 'P0', p1: 'P1', p2: 'P2', p3: 'P3',
}
const PRIORITY_COLORS: Record<TaskPriority, string> = {
  p0: 'text-status-error',
  p1: 'text-status-warning',
  p2: 'text-dc1-text-secondary',
  p3: 'text-dc1-text-muted',
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
  if (diffDays < 0) return { label: `${-diffDays}d overdue`, color: 'text-status-error' }
  if (diffDays === 0) return { label: 'Due today', color: 'text-status-warning' }
  if (diffDays === 1) return { label: 'Due tomorrow', color: 'text-status-warning' }
  if (diffDays <= 7) return { label: `Due in ${diffDays}d`, color: 'text-dc1-text-secondary' }
  return { label: formatDate(iso) || '', color: 'text-dc1-text-muted' }
}

function authHeaders(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (typeof window === 'undefined') return h
  // Admin token takes precedence — Mission Control is an internal surface and
  // admins should see everything regardless of renter scoping. Key names match
  // the rest of the app (see app/lib/auth.ts: STORAGE_KEYS).
  const adminToken = localStorage.getItem('dc1_admin_token')
  if (adminToken) {
    h['x-admin-token'] = adminToken
    return h
  }
  const renterKey = localStorage.getItem('dc1_renter_key')
  if (renterKey) {
    h['x-renter-key'] = renterKey
  }
  return h
}

export default function MissionControlPage() {
  const router = useRouter()
  const [section, setSection] = useState<Section>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [showNewTask, setShowNewTask] = useState(false)
  const [showNewGoal, setShowNewGoal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const fetchAll = useCallback(async () => {
    setError('')
    try {
      const headers = authHeaders()
      const [ov, tk, gl, as] = await Promise.all([
        fetch(`${API_BASE}/mission/overview`, { headers }),
        fetch(`${API_BASE}/mission/tasks`, { headers }),
        fetch(`${API_BASE}/mission/goals`, { headers }),
        fetch(`${API_BASE}/mission/assignees`, { headers }),
      ])
      if (ov.status === 401 || tk.status === 401) {
        router.push('/login?redirect=/mission')
        return
      }
      if (!ov.ok || !tk.ok || !gl.ok || !as.ok) throw new Error('failed to load mission control')
      const [ovJson, tkJson, glJson, asJson] = await Promise.all([ov.json(), tk.json(), gl.json(), as.json()])
      setOverview(ovJson)
      setTasks(tkJson.tasks || [])
      setGoals(glJson.goals || [])
      setAssignees(asJson.assignees || [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'load failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [router])

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
    // Optimistic
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

  if (loading && !overview) {
    return (
      <div className="min-h-screen bg-dc1-void flex items-center justify-center">
        <div className="text-dc1-text-secondary text-sm">Loading mission control…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dc1-void text-dc1-text-primary">
      <TopBar
        section={section}
        onSection={setSection}
        onRefresh={fetchAll}
        onNewTask={() => setShowNewTask(true)}
        onNewGoal={() => setShowNewGoal(true)}
        generatedAt={overview?.generated_at}
      />

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="rounded-md border border-status-error/40 bg-status-error/10 p-3 text-sm text-status-error">
            {error}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-24 lg:pb-10">
        {section === 'overview' && overview && (
          <Overview overview={overview} onOpenTask={(t) => setEditingTask(t)} />
        )}
        {section === 'board' && (
          <Board
            tasksByStatus={tasksByStatus}
            onMove={moveTask}
            onOpen={(t) => setEditingTask(t)}
          />
        )}
        {section === 'goals' && (
          <Goals goals={goals} tasks={tasks} onOpenTask={(t) => setEditingTask(t)} />
        )}
      </main>

      <MobileNav section={section} onSection={setSection} onNewTask={() => setShowNewTask(true)} />

      {showNewTask && (
        <TaskModal
          assignees={assignees}
          goals={goals}
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
          assignees={assignees}
          goals={goals}
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={() => { setEditingTask(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ───────────────────────────── Top bar ─────────────────────────────────
function TopBar({
  section, onSection, onRefresh, onNewTask, onNewGoal, generatedAt,
}: {
  section: Section
  onSection: (s: Section) => void
  onRefresh: () => void
  onNewTask: () => void
  onNewGoal: () => void
  generatedAt?: string
}) {
  const tabs: { key: Section; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'board',    label: 'Board' },
    { key: 'goals',    label: 'Goals' },
  ]
  return (
    <header className="sticky top-0 z-40 bg-dc1-surface-l1/80 backdrop-blur border-b border-dc1-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link href="/" className="shrink-0">
          <Image src="/dcp-logo-primary.png" alt="DCP" width={88} height={28} className="h-7 w-auto" />
        </Link>
        <div className="flex-1 flex items-center gap-2">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight">Mission Control</h1>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-dc1-amber/10 text-dc1-amber px-2 py-0.5 text-[10px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-dc1-amber animate-pulse" />
            LIVE
          </span>
        </div>
        <nav className="hidden lg:flex items-center gap-1 bg-dc1-surface-l2 rounded-md p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onSection(t.key)}
              className={`px-3 py-1.5 text-sm rounded transition ${
                section === t.key
                  ? 'bg-dc1-amber text-dc1-void font-semibold'
                  : 'text-dc1-text-secondary hover:text-dc1-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            title={generatedAt ? `Updated ${new Date(generatedAt).toLocaleTimeString()}` : 'Refresh'}
            className="hidden sm:inline-flex items-center gap-1 rounded-md border border-dc1-border bg-dc1-surface-l2 px-2.5 py-1.5 text-xs text-dc1-text-secondary hover:text-dc1-text-primary hover:border-dc1-border-light transition"
          >
            ↻
          </button>
          <button
            onClick={section === 'goals' ? onNewGoal : onNewTask}
            className="hidden sm:inline-flex items-center gap-1 rounded-md bg-dc1-amber text-dc1-void px-3 py-1.5 text-xs font-semibold hover:bg-dc1-amber-hover transition"
          >
            + {section === 'goals' ? 'Goal' : 'Task'}
          </button>
        </div>
      </div>
    </header>
  )
}

// ─── Overview ──────────────────────────────────────────────────────────
function Overview({ overview, onOpenTask }: { overview: Overview; onOpenTask: (t: Task) => void }) {
  const { counts, today, blocked, recent_done, active_goals } = overview
  const stats = [
    { label: 'In Progress', value: counts.in_progress || 0, accent: 'text-dc1-amber',     border: 'border-dc1-amber/30' },
    { label: 'To Do',       value: counts.todo || 0,        accent: 'text-dc1-text-primary', border: 'border-dc1-border' },
    { label: 'Blocked',     value: counts.blocked || 0,     accent: 'text-status-error',  border: 'border-status-error/30' },
    { label: 'Review',      value: counts.review || 0,      accent: 'text-status-info',   border: 'border-status-info/30' },
    { label: 'Done',        value: counts.done || 0,        accent: 'text-status-success',border: 'border-status-success/30' },
  ]
  return (
    <div className="pt-6 space-y-8">
      {/* Stats */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {stats.map((s) => (
            <div key={s.label} className={`bg-dc1-surface-l1 border rounded-lg p-4 ${s.border}`}>
              <p className="text-xs uppercase tracking-wide text-dc1-text-secondary mb-1">{s.label}</p>
              <p className={`text-3xl font-bold ${s.accent}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Today / Blocked */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ListCard title="Today" subtitle="In progress + review + due ≤24h" tasks={today} onOpen={onOpenTask} emptyText="Nothing on deck. Add a task." />
        <ListCard title="Blocked" subtitle="Needs unblock" tasks={blocked} onOpen={onOpenTask} emptyText="No blockers." accent="error" />
      </section>

      {/* Active goals */}
      {active_goals && active_goals.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-dc1-text-secondary mb-3">Active Goals</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active_goals.map((g) => (
              <GoalChip key={g.id} goal={g} />
            ))}
          </div>
        </section>
      )}

      {/* Recently done */}
      {recent_done && recent_done.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-dc1-text-secondary mb-3">Recently Shipped</h2>
          <ul className="space-y-2">
            {recent_done.map((t) => (
              <li key={t.id} onClick={() => onOpenTask(t)} className="flex items-center justify-between gap-3 rounded-md border border-dc1-border bg-dc1-surface-l1 px-3 py-2 cursor-pointer hover:border-dc1-border-light">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" />
                  <span className="text-sm truncate">{t.title}</span>
                </div>
                <span className="text-xs text-dc1-text-muted shrink-0">
                  {t.assignee_name || 'unassigned'} · {formatDate(t.completed_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ListCard({
  title, subtitle, tasks, onOpen, emptyText, accent,
}: {
  title: string; subtitle?: string; tasks: Task[]
  onOpen: (t: Task) => void; emptyText: string
  accent?: 'error' | 'info' | 'default'
}) {
  const headerColor = accent === 'error' ? 'text-status-error' : 'text-dc1-text-primary'
  return (
    <div className="bg-dc1-surface-l1 border border-dc1-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-dc1-border flex items-baseline justify-between">
        <div>
          <h2 className={`text-base font-semibold ${headerColor}`}>{title}</h2>
          {subtitle && <p className="text-xs text-dc1-text-muted mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-xs text-dc1-text-muted">{tasks.length}</span>
      </div>
      <div className="divide-y divide-dc1-border max-h-96 overflow-y-auto">
        {tasks.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-dc1-text-muted">{emptyText}</div>
        )}
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

function TaskRow({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const due = dueLabel(task.due_date)
  return (
    <div onClick={() => onOpen(task)} className="px-4 py-3 cursor-pointer hover:bg-dc1-surface-l2/40">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 w-2 h-2 rounded-full ${STATUS_COLORS[task.status].dot} shrink-0`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-dc1-text-primary leading-snug">{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dc1-text-muted">
            <span className={PRIORITY_COLORS[task.priority]}>{PRIORITY_LABEL[task.priority]}</span>
            {task.assignee_name && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  {task.assignee_kind === 'agent' && <span className="text-dc1-amber">⚙</span>}
                  {task.assignee_name}
                </span>
              </>
            )}
            {task.goal_title && (<><span>·</span><span className="truncate max-w-[10rem]">{task.goal_title}</span></>)}
            {due && (<><span>·</span><span className={due.color}>{due.label}</span></>)}
          </div>
        </div>
      </div>
    </div>
  )
}

function GoalChip({ goal }: { goal: Goal }) {
  const total = goal.task_count || 0
  const done = goal.task_done || 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="bg-dc1-surface-l1 border border-dc1-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold leading-tight">{goal.title}</h3>
        {goal.target_date && (
          <span className="text-xs text-dc1-text-muted shrink-0">{formatDate(goal.target_date)}</span>
        )}
      </div>
      <div className="h-1.5 bg-dc1-surface-l3 rounded-full overflow-hidden">
        <div className="h-full bg-dc1-amber" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-dc1-text-muted">{done}/{total} tasks · {pct}%</p>
    </div>
  )
}

// ─── Board (kanban) ────────────────────────────────────────────────────
function Board({
  tasksByStatus, onMove, onOpen,
}: {
  tasksByStatus: Record<TaskStatus, Task[]>
  onMove: (task: Task, status: TaskStatus) => void
  onOpen: (t: Task) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  return (
    <div className="pt-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {BOARD_COLUMNS.map((status) => (
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
            className={`bg-dc1-surface-l1 border border-dc1-border rounded-lg flex flex-col min-h-[200px] ${
              dragId ? 'ring-2 ' + STATUS_COLORS[status].ring : ''
            }`}
          >
            <div className="px-3 py-2 border-b border-dc1-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[status].dot}`} />
                <span className="text-xs font-semibold uppercase tracking-wide">{STATUS_LABEL[status]}</span>
              </div>
              <span className="text-xs text-dc1-text-muted">{tasksByStatus[status].length}</span>
            </div>
            <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[70vh]">
              {tasksByStatus[status].map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => onOpen(task)}
                  className="cursor-grab active:cursor-grabbing bg-dc1-surface-l2 border border-dc1-border rounded-md p-2.5 hover:border-dc1-border-light"
                >
                  <p className="text-sm leading-snug">{task.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dc1-text-muted">
                    <span className={PRIORITY_COLORS[task.priority]}>{PRIORITY_LABEL[task.priority]}</span>
                    {task.assignee_name && (
                      <span className="inline-flex items-center gap-1">
                        {task.assignee_kind === 'agent' && <span className="text-dc1-amber">⚙</span>}
                        {task.assignee_name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {tasksByStatus[status].length === 0 && (
                <div className="text-center text-xs text-dc1-text-muted py-4">empty</div>
              )}
              {/* Mobile move-to dropdown — keyboard/no-drag alt */}
              <details className="lg:hidden">
                <summary className="text-xs text-dc1-text-muted cursor-pointer">⋯</summary>
              </details>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-dc1-text-muted">Tip: drag a card between columns to change status. Tap a card to edit details.</p>
    </div>
  )
}

// ─── Goals ─────────────────────────────────────────────────────────────
function Goals({ goals, tasks, onOpenTask }: { goals: Goal[]; tasks: Task[]; onOpenTask: (t: Task) => void }) {
  return (
    <div className="pt-6 space-y-4">
      {goals.length === 0 && (
        <div className="rounded-lg border border-dashed border-dc1-border bg-dc1-surface-l1 p-8 text-center text-sm text-dc1-text-muted">
          No goals yet. Tap + Goal to add the first one.
        </div>
      )}
      {goals.map((g) => {
        const goalTasks = tasks.filter((t) => t.goal_id === g.id)
        const done = goalTasks.filter((t) => t.status === 'done').length
        const pct = goalTasks.length ? Math.round((done / goalTasks.length) * 100) : 0
        return (
          <div key={g.id} className="bg-dc1-surface-l1 border border-dc1-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-dc1-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{g.title}</h3>
                  {g.description && <p className="text-sm text-dc1-text-secondary mt-1">{g.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dc1-text-muted">
                    <span>{g.owner_name || 'unowned'}</span>
                    {g.target_date && <span>· target {formatDate(g.target_date)}</span>}
                    <span>· {done}/{goalTasks.length} tasks · {pct}%</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-dc1-surface-l3 rounded-full overflow-hidden">
                <div className="h-full bg-dc1-amber" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {goalTasks.length > 0 && (
              <div className="divide-y divide-dc1-border">
                {goalTasks.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpenTask} />)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Mobile bottom nav ─────────────────────────────────────────────────
function MobileNav({ section, onSection, onNewTask }: { section: Section; onSection: (s: Section) => void; onNewTask: () => void }) {
  const tabs: { key: Section; label: string; icon: string }[] = [
    { key: 'overview', label: 'Today',  icon: '◉' },
    { key: 'board',    label: 'Board',  icon: '▦' },
    { key: 'goals',    label: 'Goals',  icon: '◎' },
  ]
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-dc1-surface-l1/95 backdrop-blur border-t border-dc1-border">
      <div className="grid grid-cols-4 max-w-md mx-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onSection(t.key)}
            className={`flex flex-col items-center justify-center py-2 text-[11px] ${
              section === t.key ? 'text-dc1-amber' : 'text-dc1-text-muted'
            }`}
          >
            <span className="text-base leading-none mb-0.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
        <button
          onClick={onNewTask}
          className="flex flex-col items-center justify-center py-2 text-[11px] text-dc1-amber"
        >
          <span className="text-base leading-none mb-0.5">＋</span>
          New
        </button>
      </div>
    </nav>
  )
}

// ─── Modals ────────────────────────────────────────────────────────────
function TaskModal({
  task, assignees, goals, onClose, onSaved,
}: {
  task?: Task
  assignees: Assignee[]; goals: Goal[]
  onClose: () => void
  onSaved: () => void
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
        const j = await res.json().catch(() => ({}))
        setErr(j.error || 'save failed')
        return
      }
      onSaved()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!task) return
    if (!confirm('Delete this task?')) return
    setSaving(true)
    try {
      await fetch(`${API_BASE}/mission/tasks/${task.id}`, { method: 'DELETE', headers: authHeaders() })
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title={task ? 'Edit Task' : 'New Task'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title">
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber"
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber">
              {(['todo','in_progress','review','blocked','done','cancelled'] as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber">
              {(['p0','p1','p2','p3'] as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </Field>
          <Field label="Assignee">
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber">
              <option value="">Unassigned</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.kind === 'agent' ? '⚙ ' : ''}{a.display_name}</option>)}
            </select>
          </Field>
          <Field label="Goal">
            <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber">
              <option value="">None</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </Field>
          <Field label="Due">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber" />
          </Field>
        </div>
        {status === 'blocked' && (
          <Field label="Blocked reason">
            <input type="text" value={blocked} onChange={(e) => setBlocked(e.target.value)} className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-status-error" />
          </Field>
        )}
        {err && <p className="text-sm text-status-error">{err}</p>}
        <div className="flex items-center justify-between gap-3 pt-2">
          {task ? (
            <button onClick={remove} disabled={saving} className="text-sm text-status-error hover:underline">Delete</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-dc1-border rounded-md hover:bg-dc1-surface-l2">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-dc1-amber text-dc1-void font-semibold rounded-md hover:bg-dc1-amber-hover disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
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
        const j = await res.json().catch(() => ({}))
        setErr(j.error || 'save failed')
        return
      }
      onSaved()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'save failed')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="New Goal" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title"><input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber" /></Field>
        <Field label="Description"><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner">
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber">
              <option value="">Unowned</option>
              {assignees.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
            </select>
          </Field>
          <Field label="Target date">
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="w-full bg-dc1-surface-l2 border border-dc1-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-dc1-amber" />
          </Field>
        </div>
        {err && <p className="text-sm text-status-error">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-dc1-border rounded-md hover:bg-dc1-surface-l2">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-dc1-amber text-dc1-void font-semibold rounded-md hover:bg-dc1-amber-hover disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-dc1-void/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-dc1-surface-l1 border-t sm:border border-dc1-border sm:rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-dc1-border">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-dc1-text-muted hover:text-dc1-text-primary text-xl leading-none">×</button>
        </div>
        <div className="p-4 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-dc1-text-secondary mb-1 block">{label}</span>
      {children}
    </label>
  )
}
