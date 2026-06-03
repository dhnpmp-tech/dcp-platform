'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bi, useV2 } from '@/app/v2/lib/i18n'
import { getApiBase } from '@/lib/api'
import './admin.css'

type LoadState = 'checking' | 'loading' | 'ready' | 'missing-key' | 'error'
type Severity = 'critical' | 'watch' | 'routine'
type AgentMode = 'read' | 'notify' | 'propose' | 'guarded'

interface AdminStats {
  total_providers?: number
  online_now?: number
  total_renters?: number
  active_renters?: number
  total_jobs?: number
  completed_jobs?: number
  failed_jobs?: number
  active_jobs?: number
  total_revenue_halala?: number
  total_dc1_fees_halala?: number
  today_revenue_halala?: number
  today_jobs?: number
}

interface DashboardPayload {
  stats?: AdminStats
  gpu_breakdown?: unknown[]
  recent_signups?: unknown[]
  recent_heartbeats?: unknown[]
}

type DashboardResponse = DashboardPayload & {
  dashboard?: DashboardPayload
}

interface PayoutRow {
  payout_id?: string
  provider_id?: number
  provider_name?: string | null
  provider_email?: string | null
  amount_sar?: number
  amount_halala?: number
  status?: string
  moyasar_payout_id?: string | null
  moyasar_status?: string | null
  failure_reason?: string | null
  requested_at?: string | null
  processed_at?: string | null
  payment_ref?: string | null
}

interface BillingRow {
  request_id?: string
  renter_id?: number
  renter_name?: string | null
  renter_email?: string | null
  provider_id?: number | null
  cost_sar?: number
  provider_earned_sar?: number
  status?: string
  error_code?: string | null
  settled_at?: string | null
}

interface AutoTopupRow {
  attempt_id?: string
  renter_id?: number
  renter_name?: string | null
  renter_email?: string | null
  amount_sar?: number
  status?: string
  moyasar_payment_id?: string | null
  trigger_reason?: string | null
  balance_before_sar?: number | null
  balance_after_sar?: number | null
  error_code?: string | null
  error_message?: string | null
  created_at?: string | null
  completed_at?: string | null
}

interface RefundRequestRow {
  request_id?: string
  payment_id?: string
  moyasar_id?: string | null
  renter_id?: number
  renter_name?: string | null
  renter_email?: string | null
  amount_sar?: number
  amount_halala?: number
  reason?: string
  status?: string
  requested_at?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
  admin_note?: string | null
  moyasar_refund_id?: string | null
  payment_amount_sar?: number | null
  payment_status?: string | null
  payment_created_at?: string | null
}

interface PaymentsAuditPayload {
  payouts?: PayoutRow[]
  billing?: BillingRow[]
  auto_topup?: AutoTopupRow[]
  refund_requests?: RefundRequestRow[]
  summary?: {
    payouts?: Record<string, number>
    billing_attempts?: Record<string, number>
    auto_topup?: Record<string, number>
    refund_requests?: Record<string, number>
  }
}

interface HealthPayload {
  status?: string
  ok?: boolean
  database?: { status?: string }
  queues?: Record<string, unknown>
  cleanup?: Record<string, unknown>
  checks?: {
    database?: string
    providers?: { online?: number; total?: number }
    jobs?: { active?: number; stuck?: number }
    errors?: { failed_last_hour?: number; critical_events?: number }
    withdrawals?: { pending?: number }
  }
  [key: string]: unknown
}

interface SecurityPayload {
  total?: number
  critical?: number
  high?: number
  recent?: unknown[]
  summary?: Record<string, number>
}

interface AdminMetricsPayload {
  queue?: {
    pending_jobs?: number
    running_jobs?: number
    failed_last_1h?: number
    avg_wait_seconds?: number
  }
  providers?: {
    online?: number
    active?: number
    registered?: number
    total_registered?: number
    pending_approval?: number
    avg_heartbeat_age_seconds?: number
  }
  renters?: {
    total_registered?: number
    active_last_24h?: number
    total_balance_halala?: number
  }
  revenue?: {
    today_halala?: number
    this_week_halala?: number
    this_month_halala?: number
  }
  system?: {
    uptime_seconds?: number
    db_size_bytes?: number
    node_version?: string
  }
}

interface AdminDemandPayload {
  demand?: Record<string, unknown>
  error?: string
}

interface ProviderListPayload {
  providers?: unknown[]
  data?: unknown[]
  rows?: unknown[]
}

interface ApprovalProvider {
  provider_id?: number
  name?: string
  email?: string
  approval_status?: string
  created_at?: string | null
  pending_duration_seconds?: number | null
  pending_duration?: string | null
  reason?: string | null
  sla_target_seconds?: number
  sla_deadline_at?: string | null
  sla_remaining_seconds?: number | null
  sla_breached?: boolean | null
}

interface ApprovalQueuePayload {
  count?: number
  sla_target_seconds?: number
  providers?: ApprovalProvider[]
  generated_at?: string
}

interface FleetHealthPayload {
  total_providers?: number
  online?: number
  offline?: number
  degraded?: number
  usable_online?: number
  verified_online?: number
  serving_now?: boolean
  metering_last_token_at?: string | null
  providers?: FleetProviderRow[]
  generated_at?: string
}

interface FleetAlertsPayload {
  total_alerts?: number
  alerts?: FleetAlertRow[]
  generated_at?: string
}

interface ProbeEvidenceGate {
  gate?: string
  state?: 'pass' | 'fail' | 'unknown' | string
  detail?: string
}

interface ProbeEvidenceRow {
  provider_id?: number | string
  name?: string | null
  email?: string | null
  gpu_model?: string | null
  status?: string | null
  is_paused?: boolean | null
  last_heartbeat?: string | null
  heartbeat_age_seconds?: number | null
  endpoint_reachable?: boolean | null
  endpoint_probed_at?: string | null
  endpoint_probe_error?: string | null
  endpoint_probe_failures?: number | null
  wg_handshake_age_s?: number | null
  wg_tunnel_healthy?: boolean | null
  cached_models?: string[] | null
  cached_models_count?: number | null
  verified_online?: boolean | null
  verified_at?: string | null
  verified_models?: string[] | null
  verified_models_count?: number | null
  verify_chat_ok?: boolean | null
  verify_latency_ms?: number | null
  verify_error?: string | null
  verify_endpoint?: string | null
  focus_code?: string | null
  recovery_focus?: string | null
  recommended_next_action?: string | null
  severity?: Severity | string | null
  agent_mode?: AgentMode | string | null
  gates?: ProbeEvidenceGate[] | null
}

interface ProbeEvidencePayload {
  generated_at?: string
  summary?: {
    total?: number
    online?: number
    endpoint_reachable?: number
    verified_online?: number
    route_blocked?: number
    inference_blocked?: number
    timeout?: number
    model_gap?: number
    ready?: number
    focus_counts?: Record<string, number>
  }
  providers?: ProbeEvidenceRow[]
}

interface FleetProviderRow {
  id?: number | string
  name?: string | null
  email?: string | null
  gpu_model?: string | null
  vram_mb?: number | null
  gpu_count?: number | null
  last_heartbeat?: string | null
  heartbeat_age_seconds?: number | null
  status?: string | null
  status_claimed?: string | null
  jobs_running?: number | null
  jobs_failed_24h?: number | null
  container_restart_count_24h?: number | null
  model_cache_disk_mb?: number | null
  verified_online?: boolean | null
  verified_at?: string | null
  verified_models?: string[] | null
  verify_chat_ok?: boolean | null
  verify_latency_ms?: number | null
  verify_error?: string | null
  verify_endpoint?: string | null
  wg_handshake_age_s?: number | null
  wg_tunnel_healthy?: boolean | null
  endpoint_reachable?: boolean | null
  endpoint_probed_at?: string | null
  engines?: number | null
  cached_models?: string[] | null
  cached_models_count?: number | null
  gpu_temp_c?: number | null
  gpu_util_pct?: number | null
  gpu_vram_used_mib?: number | null
  gpu_vram_total_mib?: number | null
}

interface FleetAlertRow {
  provider_id?: number | string
  email?: string | null
  gpu_model?: string | null
  last_heartbeat?: string | null
  heartbeat_age_seconds?: number | null
  status?: string | null
  jobs_in_progress?: number | null
  restart_count_last_hour?: number | null
  model_cache_disk_mb?: number | null
  model_cache_disk_total_mb?: number | null
  model_cache_disk_used_pct?: number | null
  reasons?: string[] | null
}

interface ReconciliationPayload {
  period_days?: number
  summary?: {
    total_completed_jobs?: number
    total_billed_halala?: number
    split_mismatches?: number
    missing_billing?: number
    provider_drift_count?: number
    renter_drift_count?: number
  }
  issues?: Record<string, unknown[]>
}

interface ErrorEventRow {
  id?: number | string
  message?: string | null
  severity?: string | null
  daemon_version?: string | null
  hostname?: string | null
  os_info?: string | null
  details?: string | null
  created_at?: string | null
  source?: string | null
}

interface ErrorsPayload {
  errors?: ErrorEventRow[]
}

interface ControlPlaneSignalRow {
  id?: number | string
  pricing_class?: string | null
  capacity_class?: string | null
  compute_type?: string | null
  queued_total?: number | null
  active_total?: number | null
  providers_online?: number | null
  providers_degraded?: number | null
  providers_warm?: number | null
  avg_queue_wait_seconds?: number | null
  p95_queue_wait_seconds?: number | null
  recommended_warm_pool?: number | null
  recommended_scale_delta?: number | null
  recommended_action?: string | null
  reason?: string | null
  created_at?: string | null
}

interface ControlPlaneSignalsPayload {
  mode?: string
  count?: number
  signals?: ControlPlaneSignalRow[]
  snapshot?: unknown
}

interface IncidentTimelineItem {
  source?: 'audit' | 'daemon' | 'status' | string
  severity?: 'info' | 'warning' | 'critical' | string
  timestamp?: string
  title?: string
  actor?: string
  target?: string | null
  provider_id?: number | null
  details?: string | null
  ref_id?: string
}

interface IncidentsFeedPayload {
  generated_at?: string
  period_hours?: number
  counts?: {
    audit?: number
    daemon?: number
    status?: number
    merged?: number
  }
  items?: IncidentTimelineItem[]
}

type MissionTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled'
type MissionTaskPriority = 'p0' | 'p1' | 'p2' | 'p3'
type MissionAssigneeKind = 'human' | 'agent'

const TASK_STATUSES: MissionTaskStatus[] = ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled']

interface MissionAssignee {
  id?: string
  display_name?: string
  kind?: MissionAssigneeKind | string
  active?: number
}

interface MissionTask {
  id?: string
  title?: string
  status?: MissionTaskStatus | string
  priority?: MissionTaskPriority | string
  assignee_id?: string | null
  assignee_name?: string | null
  assignee_kind?: MissionAssigneeKind | string | null
  goal_title?: string | null
  due_date?: string | null
  blocked_reason?: string | null
  source?: string | null
  source_url?: string | null
  updated_at?: string | null
  completed_at?: string | null
}

interface MissionGoal {
  id?: string
  title?: string
  status?: string
  owner_name?: string | null
  target_date?: string | null
  task_count?: number
  task_done?: number
  milestone_count?: number
  milestone_done?: number
}

interface MissionOverviewPayload {
  counts?: Partial<Record<MissionTaskStatus, number>>
  today?: MissionTask[]
  blocked?: MissionTask[]
  recent_done?: MissionTask[]
  active_goals?: MissionGoal[]
  generated_at?: string
}

interface MissionTasksPayload {
  tasks?: MissionTask[]
}

interface MissionAssigneesPayload {
  assignees?: MissionAssignee[]
}

interface MissionGoalsPayload {
  goals?: MissionGoal[]
}

interface MissionPulsePayload {
  since?: string
  hours?: number
  shipped?: MissionTask[]
  created?: MissionTask[]
  moved?: MissionTask[]
}

interface AccessPolicyPayload {
  generated_at?: string
  admin_surface?: {
    token_configured?: boolean
    ip_allowlist_configured?: boolean
    auth_contract?: string
    audit_log?: string
    write_policy?: string
  }
  mission_surface?: {
    read_principals?: string[]
    write_policy?: string
    strict_write_auth_enabled?: boolean
    mission_agent_key_configured?: boolean
    current_risk?: string
    next_gate?: string
  }
  agent_permissions?: Array<{
    level?: string
    state?: string
    description?: string
  }>
}

interface NotificationPosturePayload {
  generated_at?: string
  enabled?: boolean
  updated_at?: string | null
  channels?: Array<{
    id?: string
    label?: string
    configured?: boolean
    active?: boolean
    destination?: string | null
    secret_exposed?: boolean
  }>
  agent_policy?: {
    notify_state?: string
    write_policy?: string
    next_gate?: string
  }
}

interface AdminAuditEntry {
  id?: number | string
  action?: string
  admin_user_id?: string | null
  target_type?: string | null
  target_id?: string | number | null
  details?: string | null
  timestamp?: string | null
}

interface AdminAuditPayload {
  entries?: AdminAuditEntry[]
  audit_log?: AdminAuditEntry[]
  pagination?: {
    page?: number
    limit?: number
    total?: number
    total_pages?: number
  }
}

interface SupportContactRow {
  id?: number | string
  name?: string | null
  email?: string | null
  category?: string | null
  message?: string | null
  source?: string | null
  provider_state?: string | null
  created_at?: string | null
}

interface SupportContactsPayload {
  contacts?: SupportContactRow[]
  total?: number
  pagination?: {
    limit?: number
    offset?: number
    total?: number
  }
  summary?: {
    recent_24h?: number
    by_category?: Record<string, number>
  }
}

interface RenterSupportRow {
  id?: number | string
  name?: string | null
  email?: string | null
  organization?: string | null
  balance_halala?: number | null
  status?: string | null
  created_at?: string | null
  total_jobs?: number | null
  completed_jobs?: number | null
  failed_jobs?: number | null
  total_spent_halala?: number | null
}

interface AdminRentersPayload {
  total?: number
  active?: number
  suspended?: number
  renters?: RenterSupportRow[]
  pagination?: {
    page?: number
    limit?: number
    total?: number
    total_pages?: number
  }
}

interface AdminJobRow {
  id?: number | string
  job_id?: string | null
  provider_id?: number | string | null
  renter_id?: number | string | null
  status?: string | null
  job_type?: string | null
  model?: string | null
  cost_halala?: number | null
  actual_cost_halala?: number | null
  duration_minutes?: number | null
  duration_seconds?: number | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
  submitted_at?: string | null
  started_at?: string | null
  completed_at?: string | null
  created_at?: string | null
  provider_name?: string | null
  gpu_model?: string | null
  renter_name?: string | null
}

interface AdminJobsPayload {
  stats?: {
    total?: number
    completed?: number
    failed?: number
    active?: number
    total_revenue_halala?: number
  }
  jobs?: AdminJobRow[]
  pagination?: {
    page?: number
    limit?: number
    total?: number
    total_pages?: number
  }
}

interface AdminPaymentRow {
  id?: number | string
  payment_id?: string | null
  amount_sar?: number | null
  amount_halala?: number | null
  status?: string | null
  source_type?: string | null
  description?: string | null
  created_at?: string | null
  confirmed_at?: string | null
  refunded_at?: string | null
  refund_amount_halala?: number | null
  renter_id?: number | string | null
  renter_name?: string | null
  renter_email?: string | null
}

interface AdminPaymentsPayload {
  payments?: AdminPaymentRow[]
  pagination?: {
    limit?: number
    offset?: number
    total?: number
  }
  summary?: {
    total_payments?: number
    total_revenue_halala?: number
    total_refunded_halala?: number
    pending_count?: number
    paid_count?: number
    failed_count?: number
    refunded_count?: number
    total_revenue_sar?: number
    total_refunded_sar?: number
  }
}

interface ApprovalDecisionResult {
  success?: boolean
  provider_id?: number
  approval_status?: string
  decided_at?: string
  rejected_reason?: string | null
  audit_entry?: unknown
  error?: string
}

interface ActionMessage {
  kind: 'success' | 'error'
  text: string
}

interface TaskItem {
  id: string
  titleEn: string
  titleAr: string
  detailEn: string
  detailAr: string
  owner: string
  source: string
  severity: Severity
  agentMode: AgentMode
  href: string
}

interface WorkflowItem {
  key: string
  labelEn: string
  labelAr: string
  value: string
  status: Severity
  noteEn: string
  noteAr: string
}

interface ReadinessCheck {
  key: string
  labelEn: string
  labelAr: string
  value: string
  status: Severity
  detailEn: string
  detailAr: string
  href: string
}

interface RunbookStep {
  key: string
  owner: string
  titleEn: string
  titleAr: string
  evidence: string
  actionEn: string
  actionAr: string
  severity: Severity
  agentMode: AgentMode
  href: string
}

interface ServingRecoveryItem {
  key: string
  provider: FleetProviderRow
  focusEn: string
  focusAr: string
  actionEn: string
  actionAr: string
  detail: string
  severity: Severity
  agentMode: AgentMode
}

const API_BASE = getApiBase()
const AUTH_HREF = '/v2/auth?role=admin&method=apikey&redirect=/v2/admin'
const HEARTBEAT_STALE_SECONDS = 5 * 60
const HEARTBEAT_CRITICAL_SECONDS = 15 * 60
const WG_STALE_SECONDS = 3 * 60

const numFmt = new Intl.NumberFormat('en-US')

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function countByStatus(summary: Record<string, number> | undefined, keys: string[]): number {
  if (!summary) return 0
  return keys.reduce((total, key) => total + toNumber(summary[key]), 0)
}

function formatHalala(value: unknown): string {
  const sar = toNumber(value) / 100
  return `SAR ${sar.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function formatSar(value: unknown): string {
  const sar = toNumber(value)
  return `SAR ${sar.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

function shortId(value: string | null | undefined, length = 10): string {
  if (!value) return 'unknown'
  return value.length > length ? `${value.slice(0, length)}...` : value
}

function formatAgeSeconds(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unknown'
  const seconds = value
  if (seconds <= 0) return 'fresh'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

async function fetchJson<T>(path: string, token: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-admin-token': token },
  })
  if (res.status === 401) {
    throw new Error('admin-auth-expired')
  }
  if (!res.ok) return null
  return (await res.json().catch(() => null)) as T | null
}

async function patchJson<T>(path: string, token: string, body: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'x-admin-token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => null)) as T | null
  if (res.status === 401) {
    throw new Error('admin-auth-expired')
  }
  if (!res.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: unknown }).error || 'Admin action failed.')
      : 'Admin action failed.'
    throw new Error(message)
  }
  return payload
}

async function postJson<T>(path: string, token: string, body: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'x-admin-token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => null)) as T | null
  if (res.status === 401) {
    throw new Error('admin-auth-expired')
  }
  if (!res.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: unknown }).error || 'Admin action failed.')
      : 'Admin action failed.'
    throw new Error(message)
  }
  return payload
}

function unwrapDashboard(payload: DashboardResponse | null): DashboardPayload | null {
  if (!payload) return null
  return payload.dashboard || payload
}

function providerRows(payload: ProviderListPayload | unknown[] | null): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload) return []
  return payload.providers || payload.data || payload.rows || []
}

function approvalRows(payload: ApprovalQueuePayload | null): ApprovalProvider[] {
  if (!payload || !Array.isArray(payload.providers)) return []
  return payload.providers.filter((provider) => toNumber(provider.provider_id) > 0)
}

function missionTaskRows(payload: MissionTasksPayload | null): MissionTask[] {
  if (!payload || !Array.isArray(payload.tasks)) return []
  return payload.tasks
}

function missionAssigneeRows(payload: MissionAssigneesPayload | null): MissionAssignee[] {
  if (!payload || !Array.isArray(payload.assignees)) return []
  return payload.assignees
}

function missionGoalRows(payload: MissionGoalsPayload | null): MissionGoal[] {
  if (!payload || !Array.isArray(payload.goals)) return []
  return payload.goals
}

function adminAuditRows(payload: AdminAuditPayload | null): AdminAuditEntry[] {
  if (!payload) return []
  if (Array.isArray(payload.entries)) return payload.entries
  if (Array.isArray(payload.audit_log)) return payload.audit_log
  return []
}

function supportContactRows(payload: SupportContactsPayload | null): SupportContactRow[] {
  return Array.isArray(payload?.contacts) ? payload.contacts : []
}

function renterSupportRows(payload: AdminRentersPayload | null): RenterSupportRow[] {
  return Array.isArray(payload?.renters) ? payload.renters : []
}

function jobSupportRows(payload: AdminJobsPayload | null): AdminJobRow[] {
  return Array.isArray(payload?.jobs) ? payload.jobs : []
}

function paymentSupportRows(payload: AdminPaymentsPayload | null): AdminPaymentRow[] {
  return Array.isArray(payload?.payments) ? payload.payments : []
}

function refundRequestRows(payload: PaymentsAuditPayload | null): RefundRequestRow[] {
  return Array.isArray(payload?.refund_requests) ? payload.refund_requests : []
}

function payoutRows(payload: PaymentsAuditPayload | null): PayoutRow[] {
  return Array.isArray(payload?.payouts) ? payload.payouts : []
}

function billingRows(payload: PaymentsAuditPayload | null): BillingRow[] {
  return Array.isArray(payload?.billing) ? payload.billing : []
}

function autoTopupRows(payload: PaymentsAuditPayload | null): AutoTopupRow[] {
  return Array.isArray(payload?.auto_topup) ? payload.auto_topup : []
}

function fleetProviderRows(payload: FleetHealthPayload | null): FleetProviderRow[] {
  return Array.isArray(payload?.providers) ? payload.providers : []
}

function fleetAlertRows(payload: FleetAlertsPayload | null): FleetAlertRow[] {
  return Array.isArray(payload?.alerts) ? payload.alerts : []
}

function probeEvidenceRows(payload: ProbeEvidencePayload | null): ProbeEvidenceRow[] {
  return Array.isArray(payload?.providers) ? payload.providers : []
}

function errorEventRows(payload: ErrorsPayload | null): ErrorEventRow[] {
  return Array.isArray(payload?.errors) ? payload.errors : []
}

function controlPlaneSignalRows(payload: ControlPlaneSignalsPayload | null): ControlPlaneSignalRow[] {
  return Array.isArray(payload?.signals) ? payload.signals : []
}

function incidentTimelineRows(payload: IncidentsFeedPayload | null): IncidentTimelineItem[] {
  return Array.isArray(payload?.items) ? payload.items : []
}

function demandModelKeys(payload: AdminDemandPayload | null): string[] {
  if (!payload?.demand || typeof payload.demand !== 'object' || Array.isArray(payload.demand)) return []
  return Object.keys(payload.demand)
}

function listSize(value: unknown[] | undefined): number {
  return Array.isArray(value) ? value.length : 0
}

function fleetProviderLabel(provider: FleetProviderRow): string {
  return provider.name || provider.email || `Provider #${provider.id || 'unknown'}`
}

function fleetCachedModels(provider: FleetProviderRow): string[] {
  if (Array.isArray(provider.cached_models)) return provider.cached_models.filter(Boolean)
  return []
}

function fleetProviderBlockers(provider: FleetProviderRow): string[] {
  const blockers: string[] = []
  const heartbeatAge = provider.heartbeat_age_seconds
  const wgAge = provider.wg_handshake_age_s
  const cachedModelCount = toNumber(provider.cached_models_count) || fleetCachedModels(provider).length

  if (provider.verified_online !== true) blockers.push('earned-online missing')
  if (provider.endpoint_reachable !== true) blockers.push(provider.endpoint_reachable === false ? 'endpoint unreachable' : 'endpoint unprobed')
  if (provider.wg_tunnel_healthy === false) blockers.push('WireGuard unhealthy')
  if (typeof wgAge !== 'number' || !Number.isFinite(wgAge) || wgAge > WG_STALE_SECONDS) blockers.push('WireGuard stale')
  if (typeof heartbeatAge !== 'number' || !Number.isFinite(heartbeatAge)) blockers.push('heartbeat missing')
  else if (heartbeatAge > HEARTBEAT_CRITICAL_SECONDS) blockers.push('heartbeat critical')
  else if (heartbeatAge > HEARTBEAT_STALE_SECONDS) blockers.push('heartbeat stale')
  if (cachedModelCount <= 0) blockers.push('no cached models')
  if (toNumber(provider.jobs_failed_24h) > 0) blockers.push(`${toNumber(provider.jobs_failed_24h)} failed job${toNumber(provider.jobs_failed_24h) === 1 ? '' : 's'} / 24h`)
  if (toNumber(provider.container_restart_count_24h) > 5) blockers.push('restart loop risk')
  return blockers
}

function fleetProviderSeverity(provider: FleetProviderRow): Severity {
  const blockers = fleetProviderBlockers(provider)
  if (blockers.length === 0) return 'routine'
  if (
    provider.verified_online !== true
    || provider.endpoint_reachable !== true
    || blockers.includes('heartbeat missing')
    || blockers.includes('heartbeat critical')
    || blockers.includes('no cached models')
  ) return 'critical'
  return 'watch'
}

function buildServingRecoveryItem(provider: FleetProviderRow): ServingRecoveryItem {
  const blockers = fleetProviderBlockers(provider)
  const cachedModelCount = toNumber(provider.cached_models_count) || fleetCachedModels(provider).length
  const verifyError = provider.verify_error || null
  const endpoint = shortId(provider.verify_endpoint, 34)
  const base = {
    key: String(provider.id || fleetProviderLabel(provider)),
    provider,
    detail: [
      `${blockers.length || 0} blocker${blockers.length === 1 ? '' : 's'}`,
      `endpoint ${provider.endpoint_reachable === true ? 'reachable' : provider.endpoint_reachable === false ? 'down' : 'unprobed'}`,
      `earned ${provider.verified_online === true ? 'yes' : 'no'}`,
      `models ${cachedModelCount}`,
      verifyError ? `probe ${shortId(verifyError, 44)}` : `probe ${endpoint}`,
    ].join(' · '),
  }

  if (provider.endpoint_reachable !== true) {
    return {
      ...base,
      focusEn: 'Endpoint route',
      focusAr: 'مسار النقطة',
      actionEn: 'From the VPS, confirm the provider endpoint is reachable, then inspect WireGuard routing, bind address, and runtime port before changing catalog state.',
      actionAr: 'من الخادم، أكد إمكانية الوصول إلى نقطة المزوّد ثم افحص توجيه WireGuard وعنوان الربط والمنفذ قبل تغيير حالة الكتالوج.',
      severity: 'critical',
      agentMode: 'propose',
    }
  }

  if (provider.verified_online !== true) {
    return {
      ...base,
      focusEn: verifyError && verifyError.toLowerCase().includes('timeout') ? 'Inference timeout' : 'Inference probe',
      focusAr: verifyError && verifyError.toLowerCase().includes('timeout') ? 'انتهاء مهلة الاستدلال' : 'فحص الاستدلال',
      actionEn: 'Run /v1/models and a one-token inference from the VPS, inspect vLLM or Ollama logs, and confirm the served model alias matches the catalog.',
      actionAr: 'شغّل /v1/models واستدلالاً برمز واحد من الخادم، وافحص سجلات vLLM أو Ollama، وأكد أن اسم النموذج المخدوم يطابق الكتالوج.',
      severity: 'critical',
      agentMode: 'propose',
    }
  }

  if (cachedModelCount <= 0) {
    return {
      ...base,
      focusEn: 'Model coverage',
      focusAr: 'تغطية النماذج',
      actionEn: 'Confirm daemon-reported cached models and catalog aliases before allowing this provider to satisfy renter model availability.',
      actionAr: 'أكد النماذج المخزنة التي يرسلها الخادم المحلي ومرادفات الكتالوج قبل السماح للمزوّد بتلبية توفر نماذج المستأجرين.',
      severity: 'critical',
      agentMode: 'propose',
    }
  }

  if (provider.wg_tunnel_healthy === false || blockers.some((blocker) => blocker.includes('WireGuard'))) {
    return {
      ...base,
      focusEn: 'WireGuard freshness',
      focusAr: 'حداثة WireGuard',
      actionEn: 'Confirm handshake age, peer IP, and tunnel health from the verified fleet console before touching provider routing.',
      actionAr: 'أكد عمر المصافحة وعنوان النظير وصحة النفق من لوحة الأسطول المتحققة قبل لمس توجيه المزوّد.',
      severity: 'watch',
      agentMode: 'propose',
    }
  }

  if (blockers.some((blocker) => blocker.includes('heartbeat'))) {
    return {
      ...base,
      focusEn: 'Daemon heartbeat',
      focusAr: 'نبض الخادم المحلي',
      actionEn: 'Confirm the provider daemon is running and heartbeating before using the provider for catalog or routing decisions.',
      actionAr: 'أكد أن خادم المزوّد المحلي يعمل ويرسل النبض قبل استخدامه في قرارات الكتالوج أو التوجيه.',
      severity: 'watch',
      agentMode: 'notify',
    }
  }

  return {
    ...base,
    focusEn: blockers.length > 0 ? 'Serving stability' : 'Ready provider',
    focusAr: blockers.length > 0 ? 'استقرار الخدمة' : 'مزوّد جاهز',
    actionEn: blockers.length > 0
      ? 'Review job failures, restart count, and runtime health before moving public capacity language.'
      : 'Keep this provider under observation and confirm metered traffic before widening public promises.',
    actionAr: blockers.length > 0
      ? 'راجع فشل المهام وعدد إعادة التشغيل وصحة وقت التشغيل قبل تغيير لغة السعة العامة.'
      : 'أبقِ هذا المزوّد تحت المراقبة وأكد وجود حركة مقاسة قبل توسيع الوعود العامة.',
    severity: blockers.length > 0 ? 'watch' : 'routine',
    agentMode: blockers.length > 0 ? 'propose' : 'read',
  }
}

function probeEvidenceToFleetProvider(row: ProbeEvidenceRow): FleetProviderRow {
  return {
    id: row.provider_id,
    name: row.name,
    email: row.email,
    gpu_model: row.gpu_model,
    last_heartbeat: row.last_heartbeat,
    heartbeat_age_seconds: row.heartbeat_age_seconds,
    status: row.status,
    status_claimed: row.status,
    jobs_running: 0,
    jobs_failed_24h: 0,
    container_restart_count_24h: 0,
    verified_online: row.verified_online,
    verified_at: row.verified_at,
    verified_models: row.verified_models,
    verify_chat_ok: row.verify_chat_ok,
    verify_latency_ms: row.verify_latency_ms,
    verify_error: row.verify_error,
    verify_endpoint: row.verify_endpoint,
    wg_handshake_age_s: row.wg_handshake_age_s,
    wg_tunnel_healthy: row.wg_tunnel_healthy,
    endpoint_reachable: row.endpoint_reachable,
    endpoint_probed_at: row.endpoint_probed_at,
    cached_models: row.cached_models,
    cached_models_count: row.cached_models_count,
  }
}

function probeFocusCopy(row: ProbeEvidenceRow): { focusEn: string; focusAr: string; actionEn: string; actionAr: string } | null {
  const code = row.focus_code || ''
  if (code === 'endpoint_route') {
    return {
      focusEn: 'Endpoint route',
      focusAr: 'مسار النقطة',
      actionEn: 'From the VPS, confirm the provider endpoint route, bind address, and runtime port before changing catalog state.',
      actionAr: 'من الخادم، أكد مسار نقطة المزوّد وعنوان الربط والمنفذ قبل تغيير حالة الكتالوج.',
    }
  }
  if (code === 'inference_timeout') {
    return {
      focusEn: 'Inference timeout',
      focusAr: 'انتهاء مهلة الاستدلال',
      actionEn: 'Run /v1/models and a one-token inference from the VPS, then inspect runtime logs and catalog aliases.',
      actionAr: 'شغّل /v1/models واستدلالاً برمز واحد من الخادم، ثم افحص سجلات وقت التشغيل ومرادفات الكتالوج.',
    }
  }
  if (code === 'earned_probe') {
    return {
      focusEn: 'Inference probe',
      focusAr: 'فحص الاستدلال',
      actionEn: 'Run /v1/models and a one-token inference from the VPS, then inspect runtime logs and catalog aliases.',
      actionAr: 'شغّل /v1/models واستدلالاً برمز واحد من الخادم، ثم افحص سجلات وقت التشغيل ومرادفات الكتالوج.',
    }
  }
  if (code === 'model_coverage') {
    return {
      focusEn: 'Model coverage',
      focusAr: 'تغطية النماذج',
      actionEn: 'Confirm daemon-reported cached models and catalog aliases before this provider counts toward model availability.',
      actionAr: 'أكد النماذج المخزنة التي يرسلها الخادم المحلي ومرادفات الكتالوج قبل احتساب المزوّد ضمن توفر النماذج.',
    }
  }
  if (code === 'wireguard') {
    return {
      focusEn: 'WireGuard freshness',
      focusAr: 'حداثة WireGuard',
      actionEn: 'Confirm handshake age, peer IP, and tunnel health in the verified fleet console before touching routing.',
      actionAr: 'أكد عمر المصافحة وعنوان النظير وصحة النفق في لوحة الأسطول المتحققة قبل لمس التوجيه.',
    }
  }
  if (code === 'heartbeat') {
    return {
      focusEn: 'Daemon heartbeat',
      focusAr: 'نبض الخادم المحلي',
      actionEn: 'Confirm the provider daemon is running and heartbeating before catalog or routing decisions use this provider.',
      actionAr: 'أكد أن خادم المزوّد المحلي يعمل ويرسل النبض قبل استخدامه في قرارات الكتالوج أو التوجيه.',
    }
  }
  if (code === 'ready') {
    return {
      focusEn: 'Ready provider',
      focusAr: 'مزوّد جاهز',
      actionEn: 'Keep this provider under observation and confirm metered traffic before widening public promises.',
      actionAr: 'أبقِ هذا المزوّد تحت المراقبة وأكد وجود حركة مقاسة قبل توسيع الوعود العامة.',
    }
  }
  return null
}

function buildServingRecoveryItemFromProbe(row: ProbeEvidenceRow): ServingRecoveryItem {
  const provider = probeEvidenceToFleetProvider(row)
  const fallback = buildServingRecoveryItem(provider)
  const copy = probeFocusCopy(row)
  const severity = row.severity === 'critical' || row.severity === 'watch' || row.severity === 'routine'
    ? row.severity
    : fallback.severity
  const agentMode = row.agent_mode === 'read' || row.agent_mode === 'notify' || row.agent_mode === 'propose' || row.agent_mode === 'guarded'
    ? row.agent_mode
    : fallback.agentMode
  const gateDetail = Array.isArray(row.gates)
    ? row.gates.map((gate) => `${gate.gate || 'gate'} ${gate.state || 'unknown'}`).join(' · ')
    : fallback.detail
  return {
    ...fallback,
    key: String(row.provider_id || fallback.key),
    focusEn: copy?.focusEn || row.recovery_focus || fallback.focusEn,
    focusAr: copy?.focusAr || fallback.focusAr,
    actionEn: copy?.actionEn || row.recommended_next_action || fallback.actionEn,
    actionAr: copy?.actionAr || fallback.actionAr,
    detail: gateDetail,
    severity,
    agentMode,
  }
}

function fleetReasonLabel(reason: string): string {
  return reason.replace(/_/g, ' ')
}

function incidentSeverity(value: string | null | undefined): Severity {
  if (value === 'critical' || value === 'error') return 'critical'
  if (value === 'warning' || value === 'warn') return 'watch'
  return 'routine'
}

function controlSignalSeverity(signal: ControlPlaneSignalRow): Severity {
  const action = String(signal.recommended_action || '').toLowerCase()
  const queue = toNumber(signal.queued_total)
  const warm = toNumber(signal.providers_warm)
  if (action === 'scale_up' || (queue > 0 && warm === 0)) return 'critical'
  if (action === 'scale_down' || queue > 0) return 'watch'
  return 'routine'
}

function missionCount(payload: MissionOverviewPayload | null, status: MissionTaskStatus): number {
  return toNumber(payload?.counts?.[status])
}

function formatDuration(value: unknown): string {
  const seconds = toNumber(value)
  if (seconds <= 0) return 'new'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${Math.max(1, minutes)}m`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function approvalSlaClass(provider: ApprovalProvider): Severity {
  if (provider.sla_breached) return 'critical'
  const remaining = toNumber(provider.sla_remaining_seconds)
  if (remaining > 0 && remaining <= 3600) return 'watch'
  return 'routine'
}

function severityRank(severity: Severity): number {
  if (severity === 'critical') return 0
  if (severity === 'watch') return 1
  return 2
}

function agentLabel(mode: AgentMode): { en: string; ar: string } {
  if (mode === 'read') return { en: 'agent read', ar: 'قراءة للوكيل' }
  if (mode === 'notify') return { en: 'agent notify', ar: 'تنبيه الوكيل' }
  if (mode === 'propose') return { en: 'agent propose', ar: 'اقتراح الوكيل' }
  return { en: 'human approval', ar: 'موافقة بشرية' }
}

function missionStatusLabel(status: string | undefined | null): string {
  if (status === 'in_progress') return 'in progress'
  return status ? status.replace(/_/g, ' ') : 'unknown'
}

function missionPriorityRank(priority: string | undefined | null): number {
  if (priority === 'p0') return 0
  if (priority === 'p1') return 1
  if (priority === 'p2') return 2
  return 3
}

function missionStatusRank(status: string | undefined | null): number {
  if (status === 'blocked') return 0
  if (status === 'review') return 1
  if (status === 'in_progress') return 2
  if (status === 'todo') return 3
  return 4
}

function missionGoalProgress(goal: MissionGoal): string {
  const total = toNumber(goal.task_count)
  const done = toNumber(goal.task_done)
  if (total <= 0) return '0%'
  return `${Math.round((done / total) * 100)}%`
}

function isLegacyAdminHref(href: string): boolean {
  return href === '/admin' || href.startsWith('/admin/')
}

function buildTasks(
  dashboard: DashboardPayload | null,
  audit: PaymentsAuditPayload | null,
  health: HealthPayload | null,
  security: SecurityPayload | null,
  providers: unknown[],
  approvalQueue: ApprovalQueuePayload | null,
  fleet: FleetHealthPayload | null,
  fleetAlerts: FleetAlertsPayload | null,
  reconciliation: ReconciliationPayload | null,
  errorsPayload: ErrorsPayload | null,
): TaskItem[] {
  const stats = dashboard?.stats || {}
  const refundPending = countByStatus(audit?.summary?.refund_requests, ['pending', 'processing'])
  const payoutPending = countByStatus(audit?.summary?.payouts, ['pending', 'processing'])
  const billingExceptions = countByStatus(audit?.summary?.billing_attempts, ['error', 'insufficient_balance'])
  const autoTopupIssues = countByStatus(audit?.summary?.auto_topup, ['failed', 'capped', 'paused'])
  const approvalPending = toNumber(approvalQueue?.count)
  const failedJobs = toNumber(stats.failed_jobs)
  const activeJobs = toNumber(stats.active_jobs)
  const totalProviders = toNumber(stats.total_providers) || providers.length
  const usableOnline = toNumber(fleet?.usable_online)
  const usableRatio = totalProviders > 0 ? usableOnline / totalProviders : 0
  const verifiedOnline = toNumber(fleet?.verified_online)
  const fleetAlertCount = toNumber(fleetAlerts?.total_alerts) || listSize(fleetAlerts?.alerts)
  const reconciliationIssues =
    toNumber(reconciliation?.summary?.split_mismatches)
    + toNumber(reconciliation?.summary?.missing_billing)
    + toNumber(reconciliation?.summary?.provider_drift_count)
    + toNumber(reconciliation?.summary?.renter_drift_count)
  const recentErrors = listSize(errorsPayload?.errors)
  const criticalSecurity = toNumber(security?.critical) + toNumber(security?.high)
  const healthBad = health && (health.ok === false || String(health.status || '').toLowerCase().includes('fail'))

  const tasks: TaskItem[] = []

  if (approvalPending > 0) {
    tasks.push({
      id: 'provider-approvals',
      titleEn: `${approvalPending} provider approval${approvalPending === 1 ? '' : 's'} waiting`,
      titleAr: `${approvalPending} موافقة مزوّد بانتظار القرار`,
      detailEn: 'Keep the first provider experience human-reviewed; agents may collect logs, SLA age, and onboarding notes.',
      detailAr: 'أبقِ تجربة المزوّد الأولى بمراجعة بشرية؛ يمكن للوكلاء جمع السجلات وعمر SLA وملاحظات التجهيز.',
      owner: 'Fleet',
      source: 'approval queue',
      severity: 'critical',
      agentMode: 'guarded',
      href: '/admin/providers',
    })
  }

  if (refundPending > 0) {
    tasks.push({
      id: 'refunds',
      titleEn: `${refundPending} refund request${refundPending === 1 ? '' : 's'} need review`,
      titleAr: `${refundPending} طلب استرداد يحتاج مراجعة`,
      detailEn: 'Money movement stays human-approved; agents can summarize evidence and draft the decision.',
      detailAr: 'تبقى حركة الأموال بموافقة بشرية؛ يمكن للوكلاء تلخيص الأدلة وصياغة القرار.',
      owner: 'Finance',
      source: 'payments audit',
      severity: 'critical',
      agentMode: 'guarded',
      href: '/admin/payments',
    })
  }

  if (payoutPending > 0) {
    tasks.push({
      id: 'payouts',
      titleEn: `${payoutPending} provider payout${payoutPending === 1 ? '' : 's'} pending`,
      titleAr: `${payoutPending} دفعة مزوّد معلّقة`,
      detailEn: 'Review claimable earnings, payout account state, and admin notes before completion.',
      detailAr: 'راجع الأرباح القابلة للمطالبة وحالة حساب الدفع وملاحظات الإدارة قبل الإكمال.',
      owner: 'Finance',
      source: 'withdrawals',
      severity: 'critical',
      agentMode: 'guarded',
      href: '/admin/withdrawals',
    })
  }

  if (billingExceptions + autoTopupIssues > 0) {
    tasks.push({
      id: 'billing-exceptions',
      titleEn: `${billingExceptions + autoTopupIssues} billing exception${billingExceptions + autoTopupIssues === 1 ? '' : 's'}`,
      titleAr: `${billingExceptions + autoTopupIssues} استثناء فوترة`,
      detailEn: 'Agents may classify patterns; balance corrections and refunds require a human.',
      detailAr: 'يمكن للوكلاء تصنيف الأنماط؛ تصحيحات الرصيد والاسترداد تتطلب إنساناً.',
      owner: 'Finance',
      source: 'billing ledger',
      severity: 'watch',
      agentMode: 'propose',
      href: '/admin/payments',
    })
  }

  if (failedJobs > 0) {
    tasks.push({
      id: 'failed-jobs',
      titleEn: `${failedJobs} failed job${failedJobs === 1 ? '' : 's'} in history`,
      titleAr: `${failedJobs} مهمة فاشلة في السجل`,
      detailEn: 'Look for repeated provider, model, or routing failures before adding capacity.',
      detailAr: 'ابحث عن فشل متكرر حسب المزوّد أو النموذج أو التوجيه قبل إضافة السعة.',
      owner: 'Ops',
      source: 'jobs',
      severity: failedJobs > 10 ? 'critical' : 'watch',
      agentMode: 'propose',
      href: '/admin/jobs',
    })
  }

  if (activeJobs > 0) {
    tasks.push({
      id: 'active-jobs',
      titleEn: `${activeJobs} active job${activeJobs === 1 ? '' : 's'} running`,
      titleAr: `${activeJobs} مهمة نشطة قيد التشغيل`,
      detailEn: 'Monitor settlement and provider health; cancellation remains human-confirmed.',
      detailAr: 'راقب التسوية وصحة المزوّد؛ الإلغاء يبقى بتأكيد بشري.',
      owner: 'Ops',
      source: 'jobs',
      severity: 'routine',
      agentMode: 'notify',
      href: '/admin/jobs',
    })
  }

  if (fleetAlertCount > 0) {
    tasks.push({
      id: 'fleet-alerts',
      titleEn: `${fleetAlertCount} fleet alert${fleetAlertCount === 1 ? '' : 's'} need triage`,
      titleAr: `${fleetAlertCount} تنبيه أسطول يحتاج فرزاً`,
      detailEn: 'Prioritize providers with running jobs, restart loops, or model-cache disk pressure.',
      detailAr: 'أعطِ الأولوية للمزوّدين مع مهام نشطة أو حلقات إعادة تشغيل أو ضغط تخزين للنماذج.',
      owner: 'Fleet',
      source: 'fleet alerts',
      severity: 'critical',
      agentMode: 'notify',
      href: '/admin/fleet',
    })
  }

  if ((totalProviders > 0 && usableOnline === 0) || (fleet?.serving_now === false && verifiedOnline === 0)) {
    tasks.push({
      id: 'verified-serving-capacity',
      titleEn: 'No verified serving capacity',
      titleAr: 'لا توجد سعة خدمة متحققة',
      detailEn: 'Heartbeat-only nodes are not enough. Check endpoint reachability, WireGuard, and earned-online probes before enabling catalog promises.',
      detailAr: 'النبض وحده لا يكفي. تحقق من الوصول للنقاط و WireGuard وفحوصات الخدمة المتحققة قبل وعود الكتالوج.',
      owner: 'Fleet',
      source: 'earned verification',
      severity: 'critical',
      agentMode: 'notify',
      href: '/admin/fleet',
    })
  } else if (usableOnline === 0 || usableRatio < 0.35) {
    tasks.push({
      id: 'fleet-capacity',
      titleEn: 'Fleet capacity is thin',
      titleAr: 'سعة الأسطول منخفضة',
      detailEn: 'Check verified-online state, endpoint reachability, and model coverage before promoting catalog availability.',
      detailAr: 'تحقق من الحالة المتحققة والوصول للنقاط وتغطية النماذج قبل إعلان التوفر.',
      owner: 'Fleet',
      source: 'provider health',
      severity: 'critical',
      agentMode: 'notify',
      href: '/admin/fleet',
    })
  }

  if (reconciliationIssues > 0) {
    tasks.push({
      id: 'finance-reconciliation',
      titleEn: `${reconciliationIssues} reconciliation issue${reconciliationIssues === 1 ? '' : 's'}`,
      titleAr: `${reconciliationIssues} مشكلة مطابقة مالية`,
      detailEn: 'Review billing splits, missing billing, and renter/provider drift before finance reporting.',
      detailAr: 'راجع تقسيمات الفوترة والفوترة الناقصة وانحرافات المستأجر/المزوّد قبل التقارير المالية.',
      owner: 'Finance',
      source: 'reconciliation',
      severity: 'critical',
      agentMode: 'guarded',
      href: '/admin/finance',
    })
  }

  if (recentErrors > 0) {
    tasks.push({
      id: 'recent-errors',
      titleEn: `${recentErrors} recent error event${recentErrors === 1 ? '' : 's'}`,
      titleAr: `${recentErrors} حدث خطأ حديث`,
      detailEn: 'Group by daemon, provider, and job source before deciding whether to page a human.',
      detailAr: 'جمّع حسب الخادم والمزوّد والمهمة قبل قرار تنبيه إنسان.',
      owner: 'Engineering',
      source: 'error feed',
      severity: recentErrors > 5 ? 'critical' : 'watch',
      agentMode: 'propose',
      href: '/admin/incidents',
    })
  }

  if (healthBad) {
    tasks.push({
      id: 'system-health',
      titleEn: 'System health needs review',
      titleAr: 'صحة النظام تحتاج مراجعة',
      detailEn: 'Review DB, queues, cleanup, and live service probes before trusting green dashboard totals.',
      detailAr: 'راجع قاعدة البيانات والطوابير والتنظيف وفحوصات الخدمة قبل الوثوق بالأرقام الخضراء.',
      owner: 'Engineering',
      source: 'admin health',
      severity: 'critical',
      agentMode: 'notify',
      href: '/admin/security',
    })
  }

  if (criticalSecurity > 0) {
    tasks.push({
      id: 'security',
      titleEn: `${criticalSecurity} high-priority security event${criticalSecurity === 1 ? '' : 's'}`,
      titleAr: `${criticalSecurity} حدث أمني عالي الأولوية`,
      detailEn: 'Agents can enrich context; token rotation and access revocation stay approval-gated.',
      detailAr: 'يمكن للوكلاء إثراء السياق؛ تدوير المفاتيح وسحب الوصول بموافقة.',
      owner: 'Security',
      source: 'security events',
      severity: 'critical',
      agentMode: 'guarded',
      href: '/admin/security',
    })
  }

  if (tasks.length === 0) {
    tasks.push({
      id: 'quiet-ops',
      titleEn: 'No urgent admin tasks detected',
      titleAr: 'لا توجد مهام إدارية عاجلة',
      detailEn: 'Use this quiet window for provider onboarding, pricing review, and access-policy hardening.',
      detailAr: 'استغل الهدوء لتجهيز المزوّدين ومراجعة التسعير وتقوية سياسات الوصول.',
      owner: 'Founders',
      source: 'command center',
      severity: 'routine',
      agentMode: 'propose',
      href: '/admin',
    })
  }

  return tasks.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 7)
}

function buildWorkflows(
  dashboard: DashboardPayload | null,
  audit: PaymentsAuditPayload | null,
  health: HealthPayload | null,
  providers: unknown[],
  fleet: FleetHealthPayload | null,
  reconciliation: ReconciliationPayload | null,
): WorkflowItem[] {
  const stats = dashboard?.stats || {}
  const totalProviders = toNumber(stats.total_providers) || providers.length
  const usableOnline = toNumber(fleet?.usable_online)
  const usableRatio = totalProviders > 0 ? usableOnline / totalProviders : 0
  const refundPending = countByStatus(audit?.summary?.refund_requests, ['pending', 'processing'])
  const payoutPending = countByStatus(audit?.summary?.payouts, ['pending', 'processing'])
  const billingExceptions = countByStatus(audit?.summary?.billing_attempts, ['error', 'insufficient_balance'])
  const reconciliationIssues =
    toNumber(reconciliation?.summary?.split_mismatches)
    + toNumber(reconciliation?.summary?.missing_billing)
    + toNumber(reconciliation?.summary?.provider_drift_count)
    + toNumber(reconciliation?.summary?.renter_drift_count)
  const healthStatus = health?.ok === false ? 'review' : String(health?.status || 'unknown')

  return [
    {
      key: 'launch',
      labelEn: 'Launch readiness',
      labelAr: 'جاهزية الإطلاق',
      value: usableOnline > 0 && refundPending === 0 && reconciliationIssues === 0 ? 'steady' : 'watch',
      status: usableOnline > 0 && refundPending === 0 && reconciliationIssues === 0 ? 'routine' : 'watch',
      noteEn: 'Combines supply, money queue, and system health into a simple founder signal.',
      noteAr: 'يجمع العرض وطابور المال وصحة النظام في إشارة مؤسسين بسيطة.',
    },
    {
      key: 'money',
      labelEn: 'Money queue',
      labelAr: 'طابور الأموال',
      value: `${refundPending + payoutPending}`,
      status: refundPending + payoutPending > 0 ? 'critical' : 'routine',
      noteEn: 'Refunds and payouts stay human-approved; agents can prepare summaries.',
      noteAr: 'الاستردادات والدفعات بموافقة بشرية؛ يمكن للوكلاء تحضير الملخصات.',
    },
    {
      key: 'fleet',
      labelEn: 'Serving supply',
      labelAr: 'عرض الخدمة',
      value: `${usableOnline}/${totalProviders || 0}`,
      status: usableOnline === 0 ? 'critical' : usableRatio < 0.5 ? 'watch' : 'routine',
      noteEn: 'Verified serving state matters more than heartbeat freshness.',
      noteAr: 'حالة الخدمة المتحققة أهم من حداثة النبض فقط.',
    },
    {
      key: 'billing',
      labelEn: 'Billing exceptions',
      labelAr: 'استثناءات الفوترة',
      value: `${billingExceptions}`,
      status: billingExceptions > 0 ? 'watch' : 'routine',
      noteEn: 'Agents may group errors, but balance changes need approval.',
      noteAr: 'يمكن للوكلاء تجميع الأخطاء، لكن تغييرات الرصيد تحتاج موافقة.',
    },
    {
      key: 'reconciliation',
      labelEn: 'Reconciliation',
      labelAr: 'المطابقة المالية',
      value: `${reconciliationIssues}`,
      status: reconciliationIssues > 0 ? 'critical' : 'routine',
      noteEn: 'Split drift, missing billing, and account drift are launch blockers.',
      noteAr: 'انحراف التقسيم والفوترة الناقصة وانحراف الحسابات عوائق إطلاق.',
    },
    {
      key: 'system',
      labelEn: 'System health',
      labelAr: 'صحة النظام',
      value: healthStatus,
      status: health?.ok === false ? 'critical' : 'routine',
      noteEn: 'DB, queue, cleanup, and probe status should be checked before launch pushes.',
      noteAr: 'يجب فحص قاعدة البيانات والطوابير والتنظيف والفحوصات قبل دفعات الإطلاق.',
    },
  ]
}

function buildReadinessChecks(
  fleet: FleetHealthPayload | null,
  fleetAlerts: FleetAlertsPayload | null,
  approvalQueue: ApprovalQueuePayload | null,
  audit: PaymentsAuditPayload | null,
  reconciliation: ReconciliationPayload | null,
  errorsPayload: ErrorsPayload | null,
  signals: ControlPlaneSignalsPayload | null,
): ReadinessCheck[] {
  const usableOnline = toNumber(fleet?.usable_online)
  const totalProviders = toNumber(fleet?.total_providers)
  const fleetAlertCount = toNumber(fleetAlerts?.total_alerts) || listSize(fleetAlerts?.alerts)
  const approvalPending = toNumber(approvalQueue?.count)
  const moneyQueue = countByStatus(audit?.summary?.refund_requests, ['pending', 'processing'])
    + countByStatus(audit?.summary?.payouts, ['pending', 'processing'])
  const reconciliationIssues =
    toNumber(reconciliation?.summary?.split_mismatches)
    + toNumber(reconciliation?.summary?.missing_billing)
    + toNumber(reconciliation?.summary?.provider_drift_count)
    + toNumber(reconciliation?.summary?.renter_drift_count)
  const errorCount = listSize(errorsPayload?.errors)
  const signalCount = toNumber(signals?.count) || listSize(signals?.signals)

  return [
    {
      key: 'verified-supply',
      labelEn: 'Verified supply',
      labelAr: 'العرض المتحقق',
      value: `${usableOnline}/${totalProviders || 0}`,
      status: usableOnline > 0 ? 'routine' : 'critical',
      detailEn: 'Requires earned-online serving capacity, not just heartbeats.',
      detailAr: 'يتطلب سعة خدمة متحققة، وليس نبضات فقط.',
      href: '/admin/fleet',
    },
    {
      key: 'fleet-alerts',
      labelEn: 'Fleet alerts',
      labelAr: 'تنبيهات الأسطول',
      value: `${fleetAlertCount}`,
      status: fleetAlertCount > 0 ? 'critical' : 'routine',
      detailEn: 'Running jobs, restart loops, and disk pressure surface here.',
      detailAr: 'تظهر هنا المهام النشطة وحلقات الإعادة وضغط التخزين.',
      href: '/admin/fleet',
    },
    {
      key: 'approvals',
      labelEn: 'Provider approvals',
      labelAr: 'موافقات المزوّدين',
      value: `${approvalPending}`,
      status: approvalPending > 0 ? 'watch' : 'routine',
      detailEn: 'First provider activation stays human-reviewed.',
      detailAr: 'تفعيل المزوّد الأول يبقى بمراجعة بشرية.',
      href: '/admin/providers',
    },
    {
      key: 'money',
      labelEn: 'Money queue',
      labelAr: 'طابور الأموال',
      value: `${moneyQueue}`,
      status: moneyQueue > 0 ? 'critical' : 'routine',
      detailEn: 'Refunds and payouts are approval-gated.',
      detailAr: 'الاستردادات والدفعات محكومة بالموافقة.',
      href: '/admin/payments',
    },
    {
      key: 'reconciliation',
      labelEn: 'Reconciliation',
      labelAr: 'المطابقة',
      value: `${reconciliationIssues}`,
      status: reconciliationIssues > 0 ? 'critical' : 'routine',
      detailEn: 'Billing split and account drift checks for finance confidence.',
      detailAr: 'فحوصات تقسيم الفوترة وانحراف الحسابات لثقة المالية.',
      href: '/admin/finance',
    },
    {
      key: 'incidents',
      labelEn: 'Error feed',
      labelAr: 'سجل الأخطاء',
      value: `${errorCount}`,
      status: errorCount > 5 ? 'critical' : errorCount > 0 ? 'watch' : 'routine',
      detailEn: 'Recent daemon and job failures feed incident review.',
      detailAr: 'أخطاء الخوادم والمهام الحديثة تغذي مراجعة الحوادث.',
      href: '/admin/incidents',
    },
    {
      key: 'control-plane',
      labelEn: 'Control plane',
      labelAr: 'لوحة التحكم',
      value: signalCount > 0 ? `${signalCount}` : 'quiet',
      status: 'routine',
      detailEn: 'Demand, prewarm, and capacity signals remain read-only here.',
      detailAr: 'إشارات الطلب والتسخين والسعة تبقى للقراءة هنا.',
      href: '/admin/fleet',
    },
  ]
}

export default function V2AdminPage() {
  const router = useRouter()
  const { lang, toggle } = useV2()
  const [state, setState] = useState<LoadState>('checking')
  const [error, setError] = useState('')
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null)
  const [audit, setAudit] = useState<PaymentsAuditPayload | null>(null)
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [security, setSecurity] = useState<SecurityPayload | null>(null)
  const [adminMetrics, setAdminMetrics] = useState<AdminMetricsPayload | null>(null)
  const [adminDemand, setAdminDemand] = useState<AdminDemandPayload | null>(null)
  const [providers, setProviders] = useState<unknown[]>([])
  const [approvalQueue, setApprovalQueue] = useState<ApprovalQueuePayload | null>(null)
  const [fleet, setFleet] = useState<FleetHealthPayload | null>(null)
  const [fleetAlerts, setFleetAlerts] = useState<FleetAlertsPayload | null>(null)
  const [probeEvidence, setProbeEvidence] = useState<ProbeEvidencePayload | null>(null)
  const [reconciliation, setReconciliation] = useState<ReconciliationPayload | null>(null)
  const [errorsPayload, setErrorsPayload] = useState<ErrorsPayload | null>(null)
  const [signals, setSignals] = useState<ControlPlaneSignalsPayload | null>(null)
  const [incidentsFeed, setIncidentsFeed] = useState<IncidentsFeedPayload | null>(null)
  const [missionOverview, setMissionOverview] = useState<MissionOverviewPayload | null>(null)
  const [missionTasks, setMissionTasks] = useState<MissionTask[]>([])
  const [missionAssignees, setMissionAssignees] = useState<MissionAssignee[]>([])
  const [missionGoals, setMissionGoals] = useState<MissionGoal[]>([])
  const [missionPulse, setMissionPulse] = useState<MissionPulsePayload | null>(null)
  const [accessPolicy, setAccessPolicy] = useState<AccessPolicyPayload | null>(null)
  const [notificationPosture, setNotificationPosture] = useState<NotificationPosturePayload | null>(null)
  const [adminAuditEntries, setAdminAuditEntries] = useState<AdminAuditEntry[]>([])
  const [supportContacts, setSupportContacts] = useState<SupportContactsPayload | null>(null)
  const [renterSupport, setRenterSupport] = useState<AdminRentersPayload | null>(null)
  const [jobSupport, setJobSupport] = useState<AdminJobsPayload | null>(null)
  const [paymentSupport, setPaymentSupport] = useState<AdminPaymentsPayload | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [selectedApprovalId, setSelectedApprovalId] = useState<number | null>(null)
  const [approvalReason, setApprovalReason] = useState('')
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null)
  const [approvalMessage, setApprovalMessage] = useState<ActionMessage | null>(null)
  const [selectedMissionTaskId, setSelectedMissionTaskId] = useState<string | null>(null)
  const [missionTargetStatus, setMissionTargetStatus] = useState<MissionTaskStatus>('in_progress')
  const [missionTargetAssignee, setMissionTargetAssignee] = useState('')
  const [missionActionNote, setMissionActionNote] = useState('')
  const [missionAction, setMissionAction] = useState<'status' | 'reassign' | 'comment' | null>(null)
  const [missionActionMessage, setMissionActionMessage] = useState<ActionMessage | null>(null)

  const load = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null
    if (!token) {
      setState('missing-key')
      router.replace(AUTH_HREF)
      return
    }

    setState('loading')
    setError('')
    try {
      const [
        dashRes,
        auditRes,
        healthRes,
        securityRes,
        metricsRes,
        demandRes,
        providerRes,
        approvalRes,
        fleetRes,
        fleetAlertsRes,
        probeEvidenceRes,
        reconciliationRes,
        errorsRes,
        signalsRes,
        incidentsFeedRes,
        missionOverviewRes,
        missionTasksRes,
        missionAssigneesRes,
        missionGoalsRes,
        missionPulseRes,
        accessPolicyRes,
        notificationPostureRes,
        adminAuditRes,
        supportContactsRes,
        renterSupportRes,
        jobSupportRes,
        paymentSupportRes,
      ] = await Promise.all([
        fetchJson<DashboardResponse>('/admin/dashboard', token),
        fetchJson<PaymentsAuditPayload>('/admin/payments/audit?limit=40', token),
        fetchJson<HealthPayload>('/admin/health', token),
        fetchJson<SecurityPayload>('/admin/security/summary', token),
        fetchJson<AdminMetricsPayload>('/admin/metrics', token),
        fetchJson<AdminDemandPayload>('/admin/demand', token),
        fetchJson<ProviderListPayload | unknown[]>('/admin/providers?page=0&limit=200', token),
        fetchJson<ApprovalQueuePayload>('/admin/providers/approval-queue?limit=100', token),
        fetchJson<FleetHealthPayload>('/admin/fleet/health', token),
        fetchJson<FleetAlertsPayload>('/admin/fleet/alerts', token),
        fetchJson<ProbeEvidencePayload>('/admin/fleet/probe-evidence?limit=50', token),
        fetchJson<ReconciliationPayload>('/admin/finance/reconciliation?days=7', token),
        fetchJson<ErrorsPayload>('/admin/errors?limit=20', token),
        fetchJson<ControlPlaneSignalsPayload>('/admin/control-plane/signals?limit=5', token),
        fetchJson<IncidentsFeedPayload>('/admin/incidents/feed?hours=24&limit=8', token),
        fetchJson<MissionOverviewPayload>('/mission/overview', token),
        fetchJson<MissionTasksPayload>('/mission/tasks?status=todo,in_progress,blocked,review', token),
        fetchJson<MissionAssigneesPayload>('/mission/assignees', token),
        fetchJson<MissionGoalsPayload>('/mission/goals', token),
        fetchJson<MissionPulsePayload>('/mission/pulse?hours=24', token),
        fetchJson<AccessPolicyPayload>('/admin/access/policy', token),
        fetchJson<NotificationPosturePayload>('/admin/notifications/posture', token),
        fetchJson<AdminAuditPayload>('/admin/audit?limit=8', token),
        fetchJson<SupportContactsPayload>('/admin/support/contacts?limit=12', token),
        fetchJson<AdminRentersPayload>('/admin/renters?page=1&limit=12', token),
        fetchJson<AdminJobsPayload>('/admin/jobs?limit=12', token),
        fetchJson<AdminPaymentsPayload>('/admin/payments?limit=12', token),
      ])
      setDashboard(unwrapDashboard(dashRes))
      setAudit(auditRes)
      setHealth(healthRes)
      setSecurity(securityRes)
      setAdminMetrics(metricsRes)
      setAdminDemand(demandRes)
      setProviders(providerRows(providerRes))
      setApprovalQueue(approvalRes)
      setFleet(fleetRes)
      setFleetAlerts(fleetAlertsRes)
      setProbeEvidence(probeEvidenceRes)
      setReconciliation(reconciliationRes)
      setErrorsPayload(errorsRes)
      setSignals(signalsRes)
      setIncidentsFeed(incidentsFeedRes)
      setMissionOverview(missionOverviewRes)
      setMissionTasks(missionTaskRows(missionTasksRes))
      setMissionAssignees(missionAssigneeRows(missionAssigneesRes))
      setMissionGoals(missionGoalRows(missionGoalsRes))
      setMissionPulse(missionPulseRes)
      setAccessPolicy(accessPolicyRes)
      setNotificationPosture(notificationPostureRes)
      setAdminAuditEntries(adminAuditRows(adminAuditRes))
      setSupportContacts(supportContactsRes)
      setRenterSupport(renterSupportRes)
      setJobSupport(jobSupportRes)
      setPaymentSupport(paymentSupportRes)
      setRefreshedAt(new Date())
      setState('ready')
    } catch (err) {
      if (err instanceof Error && err.message === 'admin-auth-expired') {
        localStorage.removeItem('dc1_admin_token')
        setState('missing-key')
        router.replace(AUTH_HREF)
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to load admin command center.')
      setState('error')
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const stats = dashboard?.stats || {}
  const approvalProviders = useMemo(() => approvalRows(approvalQueue), [approvalQueue])
  const selectedApproval = useMemo(() => {
    if (approvalProviders.length === 0) return null
    return approvalProviders.find((provider) => provider.provider_id === selectedApprovalId) || approvalProviders[0]
  }, [approvalProviders, selectedApprovalId])

  useEffect(() => {
    if (approvalProviders.length === 0) {
      if (selectedApprovalId !== null) setSelectedApprovalId(null)
      return
    }
    if (!selectedApproval || selectedApproval.provider_id !== selectedApprovalId) {
      setSelectedApprovalId(approvalProviders[0].provider_id || null)
    }
  }, [approvalProviders, selectedApproval, selectedApprovalId])

  const submitApprovalDecision = useCallback(async (decision: 'approve' | 'reject') => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null
    const providerId = toNumber(selectedApproval?.provider_id)
    if (!token) {
      setState('missing-key')
      router.replace(AUTH_HREF)
      return
    }
    if (!providerId) {
      setApprovalMessage({ kind: 'error', text: 'No pending provider is selected.' })
      return
    }
    const reason = approvalReason.trim()
    if (decision === 'reject' && reason.length < 8) {
      setApprovalMessage({ kind: 'error', text: 'Rejection needs a clear reason before it can be audited.' })
      return
    }

    setApprovalAction(decision)
    setApprovalMessage(null)
    try {
      const result = await patchJson<ApprovalDecisionResult>(
        `/admin/providers/${providerId}/approval-decision`,
        token,
        decision === 'approve' ? { decision } : { decision, reason },
      )
      const nextStatus = result?.approval_status || (decision === 'approve' ? 'approved' : 'rejected')
      setApprovalMessage({
        kind: 'success',
        text: `${selectedApproval?.name || `Provider #${providerId}`} marked ${nextStatus}; audit row recorded.`,
      })
      setApprovalReason('')
      await load()
    } catch (err) {
      if (err instanceof Error && err.message === 'admin-auth-expired') {
        localStorage.removeItem('dc1_admin_token')
        setState('missing-key')
        router.replace(AUTH_HREF)
        return
      }
      setApprovalMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Provider approval decision failed.',
      })
    } finally {
      setApprovalAction(null)
    }
  }, [approvalReason, load, router, selectedApproval])

  const tasks = useMemo(
    () => buildTasks(dashboard, audit, health, security, providers, approvalQueue, fleet, fleetAlerts, reconciliation, errorsPayload),
    [dashboard, audit, health, security, providers, approvalQueue, fleet, fleetAlerts, reconciliation, errorsPayload],
  )
  const workflows = useMemo(
    () => buildWorkflows(dashboard, audit, health, providers, fleet, reconciliation),
    [dashboard, audit, health, providers, fleet, reconciliation],
  )
  const readiness = useMemo(
    () => buildReadinessChecks(fleet, fleetAlerts, approvalQueue, audit, reconciliation, errorsPayload, signals),
    [fleet, fleetAlerts, approvalQueue, audit, reconciliation, errorsPayload, signals],
  )
  const refundReviewRows = refundRequestRows(audit)
    .filter((row) => ['pending', 'processing'].includes(String(row.status || '').toLowerCase()))
    .slice(0, 4)
  const payoutReviewRows = payoutRows(audit)
    .filter((row) => ['pending', 'processing'].includes(String(row.status || '').toLowerCase()))
    .slice(0, 4)
  const billingExceptionRows = billingRows(audit)
    .filter((row) => ['error', 'insufficient_balance'].includes(String(row.status || '').toLowerCase()))
    .slice(0, 4)
  const autoTopupIssueRows = autoTopupRows(audit)
    .filter((row) => ['failed', 'capped', 'paused'].includes(String(row.status || '').toLowerCase()))
    .slice(0, 4)
  const financeQueueTotal =
    countByStatus(audit?.summary?.refund_requests, ['pending', 'processing'])
    + countByStatus(audit?.summary?.payouts, ['pending', 'processing'])
    + countByStatus(audit?.summary?.billing_attempts, ['error', 'insufficient_balance'])
    + countByStatus(audit?.summary?.auto_topup, ['failed', 'capped', 'paused'])
  const financeReviewHasRows =
    refundReviewRows.length
    + payoutReviewRows.length
    + billingExceptionRows.length
    + autoTopupIssueRows.length > 0
  const supportContactList = supportContactRows(supportContacts)
  const renterSupportList = renterSupportRows(renterSupport)
  const jobSupportList = jobSupportRows(jobSupport)
  const paymentSupportList = paymentSupportRows(paymentSupport)
  const supportRecent24h = toNumber(supportContacts?.summary?.recent_24h)
  const supportCategoryCount = Object.keys(supportContacts?.summary?.by_category || {}).length
  const failedJobRows = jobSupportList
    .filter((row) => ['failed', 'error', 'cancelled'].includes(String(row.status || '').toLowerCase()))
    .slice(0, 4)
  const activeJobRows = jobSupportList
    .filter((row) => ['pending', 'assigned', 'running', 'queued'].includes(String(row.status || '').toLowerCase()))
    .slice(0, 4)
  const jobPainRows = (failedJobRows.length > 0 ? failedJobRows : activeJobRows).slice(0, 4)
  const lowBalanceRenterRows = renterSupportList
    .filter((row) => toNumber(row.balance_halala) <= 1000 || String(row.status || '').toLowerCase() === 'suspended' || toNumber(row.failed_jobs) > 0)
    .sort((a, b) => toNumber(a.balance_halala) - toNumber(b.balance_halala))
    .slice(0, 4)
  const paymentIssueRows = paymentSupportList
    .filter((row) => ['failed', 'initiated', 'pending', 'refunded'].includes(String(row.status || '').toLowerCase()))
    .slice(0, 4)
  const supportQueueTotal =
    supportContactList.length
    + failedJobRows.length
    + lowBalanceRenterRows.length
    + paymentIssueRows.length
  const supportDeskHasRows =
    supportContactList.length
    + lowBalanceRenterRows.length
    + jobPainRows.length
    + paymentIssueRows.length > 0
  const urgentCount = tasks.filter((task) => task.severity === 'critical').length
  const watchCount = tasks.filter((task) => task.severity === 'watch').length
  const totalProviders = toNumber(fleet?.total_providers) || toNumber(stats.total_providers)
  const usableOnline = toNumber(fleet?.usable_online)
  const verifiedOnline = toNumber(fleet?.verified_online)
  const fleetAlertCount = toNumber(fleetAlerts?.total_alerts) || listSize(fleetAlerts?.alerts)
  const approvalPending = toNumber(approvalQueue?.count)
  const reconciliationIssues =
    toNumber(reconciliation?.summary?.split_mismatches)
    + toNumber(reconciliation?.summary?.missing_billing)
    + toNumber(reconciliation?.summary?.provider_drift_count)
    + toNumber(reconciliation?.summary?.renter_drift_count)
  const recentErrors = listSize(errorsPayload?.errors)
  const signalCount = toNumber(signals?.count) || listSize(signals?.signals)
  const incidentTimeline = incidentTimelineRows(incidentsFeed).slice(0, 6)
  const errorEvents = errorEventRows(errorsPayload).slice(0, 6)
  const controlSignals = controlPlaneSignalRows(signals).slice(0, 5)
  const incidentMergedCount = toNumber(incidentsFeed?.counts?.merged) || incidentTimeline.length
  const daemonIncidentCount = toNumber(incidentsFeed?.counts?.daemon)
  const auditIncidentCount = toNumber(incidentsFeed?.counts?.audit)
  const statusIncidentCount = toNumber(incidentsFeed?.counts?.status)
  const controlPlaneMode = signals?.mode || 'unknown'
  const controlCriticalCount = controlSignals.filter((signal) => controlSignalSeverity(signal) === 'critical').length
  const incidentCriticalCount = incidentTimeline.filter((item) => incidentSeverity(item.severity) === 'critical').length
  const errorCriticalCount = errorEvents.filter((event) => incidentSeverity(event.severity) === 'critical').length
  const incidentCommandHasCritical = incidentCriticalCount + errorCriticalCount + controlCriticalCount > 0
  const openMissionWork = missionCount(missionOverview, 'todo')
    + missionCount(missionOverview, 'in_progress')
    + missionCount(missionOverview, 'review')
    + missionCount(missionOverview, 'blocked')
  const missionBlockedCount = missionCount(missionOverview, 'blocked') || listSize(missionOverview?.blocked)
  const missionTodayCount = listSize(missionOverview?.today)
  const missionShippedCount = listSize(missionPulse?.shipped) || listSize(missionOverview?.recent_done)
  const activeMissionGoals = (missionOverview?.active_goals && missionOverview.active_goals.length > 0)
    ? missionOverview.active_goals
    : missionGoals.filter((goal) => goal.status === 'active').slice(0, 6)
  const humanAssignees = missionAssignees.filter((assignee) => assignee.kind === 'human')
  const agentAssignees = missionAssignees.filter((assignee) => assignee.kind === 'agent')
  const missionTaskPreview = [...missionTasks]
    .sort((a, b) => {
      const byStatus = missionStatusRank(a.status) - missionStatusRank(b.status)
      if (byStatus !== 0) return byStatus
      return missionPriorityRank(a.priority) - missionPriorityRank(b.priority)
    })
    .slice(0, 5)
  const selectedMissionTask = missionTaskPreview.find((task) => task.id === selectedMissionTaskId) || missionTaskPreview[0] || null
  const missionRosterPreview = [...missionAssignees]
    .sort((a, b) => {
      const aCount = missionTasks.filter((task) => task.assignee_id === a.id).length
      const bCount = missionTasks.filter((task) => task.assignee_id === b.id).length
      return bCount - aCount
    })
    .slice(0, 8)
  const missionStrictWrites = accessPolicy?.mission_surface?.strict_write_auth_enabled === true
  const missionWritePolicy = accessPolicy?.mission_surface?.write_policy || 'unknown'
  const agentWriteState = accessPolicy?.agent_permissions?.find((permission) => permission.level === 'guarded_write')?.state || 'unknown'
  const fleetProviderList = fleetProviderRows(fleet)
  const probeEvidenceList = probeEvidenceRows(probeEvidence)
  const hasProbeEvidence = probeEvidence !== null
  const fleetReadyProviders = fleetProviderList.filter((provider) => fleetProviderBlockers(provider).length === 0)
  const fleetBlockedProviders = fleetProviderList.filter((provider) => fleetProviderBlockers(provider).length > 0)
  const fleetEndpointReachable = probeEvidence?.summary?.endpoint_reachable != null
    ? toNumber(probeEvidence.summary.endpoint_reachable)
    : fleetProviderList.filter((provider) => provider.endpoint_reachable === true).length
  const fleetModelReady = fleetProviderList.filter((provider) => (toNumber(provider.cached_models_count) || fleetCachedModels(provider).length) > 0).length
  const fleetProviderPreview = [...fleetProviderList]
    .sort((a, b) => {
      const bySeverity = severityRank(fleetProviderSeverity(a)) - severityRank(fleetProviderSeverity(b))
      if (bySeverity !== 0) return bySeverity
      const byRunningJobs = toNumber(b.jobs_running) - toNumber(a.jobs_running)
      if (byRunningJobs !== 0) return byRunningJobs
      return toNumber(a.id) - toNumber(b.id)
    })
    .slice(0, 6)
  const servingRecoveryRows = hasProbeEvidence
    ? probeEvidenceList.map(buildServingRecoveryItemFromProbe)
    : (fleetBlockedProviders.length > 0 ? fleetBlockedProviders : fleetProviderList).map(buildServingRecoveryItem)
  const servingRecoveryPreview = servingRecoveryRows
    .sort((a, b) => {
      const bySeverity = severityRank(a.severity) - severityRank(b.severity)
      if (bySeverity !== 0) return bySeverity
      return toNumber(a.provider.id) - toNumber(b.provider.id)
    })
    .slice(0, 5)
  const servingRecoveryCritical = servingRecoveryRows.filter((item) => item.severity === 'critical').length
  const servingInferenceProbeBlocked = probeEvidence?.summary?.inference_blocked != null
    ? toNumber(probeEvidence.summary.inference_blocked)
    : fleetProviderList.filter((provider) => provider.endpoint_reachable === true && provider.verified_online !== true).length
  const servingTimeoutCount = probeEvidence?.summary?.timeout != null
    ? toNumber(probeEvidence.summary.timeout)
    : fleetProviderList.filter((provider) => String(provider.verify_error || '').toLowerCase().includes('timeout')).length
  const servingNoModelCount = probeEvidence?.summary?.model_gap != null
    ? toNumber(probeEvidence.summary.model_gap)
    : fleetProviderList.filter((provider) => (toNumber(provider.cached_models_count) || fleetCachedModels(provider).length) <= 0).length
  const servingProbeEvidenceAge = probeEvidence?.generated_at ? formatDate(probeEvidence.generated_at) : 'fleet fallback'
  const fleetAlertsPreview = fleetAlertRows(fleetAlerts).slice(0, 4)
  const notificationChannels = notificationPosture?.channels || []
  const activeNotificationChannels = notificationChannels.filter((channel) => channel.active).length
  const configuredNotificationChannels = notificationChannels.filter((channel) => channel.configured).length
  const notificationNotifyState = notificationPosture?.agent_policy?.notify_state || 'unknown'
  const securityPriorityCount = toNumber(security?.critical) + toNumber(security?.high)
  const metricsPendingJobs = toNumber(adminMetrics?.queue?.pending_jobs)
  const metricsRunningJobs = toNumber(adminMetrics?.queue?.running_jobs)
  const metricsFailedLastHour = toNumber(adminMetrics?.queue?.failed_last_1h)
  const metricsAvgWaitSeconds = toNumber(adminMetrics?.queue?.avg_wait_seconds)
  const healthStuckJobs = toNumber(health?.checks?.jobs?.stuck)
  const healthCriticalEvents = toNumber(health?.checks?.errors?.critical_events)
  const healthPendingWithdrawals = toNumber(health?.checks?.withdrawals?.pending)
  const demandKeys = demandModelKeys(adminDemand)
  const demandSignalCount = demandKeys.length
  const publicCapacityReady = fleet?.serving_now === true && usableOnline > 0 && verifiedOnline > 0 && fleetModelReady > 0
  const launchMoneyBlockers = financeQueueTotal + reconciliationIssues + healthPendingWithdrawals
  const launchSystemBlockers = (health?.status === 'healthy' || health?.ok === true) && healthStuckJobs === 0 && healthCriticalEvents === 0 ? 0 : 1
  const launchCapacityBlockers = publicCapacityReady ? 0 : 1
  const launchSecurityBlockers = securityPriorityCount
  const launchIncidentBlockers = incidentCommandHasCritical ? 1 : 0
  const launchBlockers =
    launchCapacityBlockers
    + launchSystemBlockers
    + launchMoneyBlockers
    + launchSecurityBlockers
    + launchIncidentBlockers
  const launchState = launchBlockers > 0 ? 'blocked' : 'ready'
  const runbookSteps: RunbookStep[] = [
    {
      key: 'public-capacity',
      owner: 'Fleet',
      titleEn: publicCapacityReady ? 'Prepare public capacity language' : 'Keep public capacity gated',
      titleAr: publicCapacityReady ? 'حضّر لغة السعة العامة' : 'أبقِ السعة العامة محجوبة',
      evidence: `${usableOnline} usable · ${verifiedOnline} earned · ${fleetModelReady} model-ready`,
      actionEn: publicCapacityReady
        ? 'Confirm /status, catalog model coverage, and support readiness before changing marketplace copy.'
        : 'Do not update marketplace copy. Repair endpoint, WireGuard, earned-online, and model blockers first.',
      actionAr: publicCapacityReady
        ? 'أكد /status وتغطية نماذج الكتالوج وجاهزية الدعم قبل تغيير نص السوق.'
        : 'لا تحدّث نص السوق. أصلح عوائق النقطة و WireGuard والتحقق وتغطية النماذج أولاً.',
      severity: publicCapacityReady ? 'routine' : 'critical',
      agentMode: 'notify',
      href: '#fleet',
    },
    {
      key: 'provider-activation',
      owner: 'Fleet',
      titleEn: approvalPending > 0 ? 'Clear provider approval queue' : 'Prepare next provider activation',
      titleAr: approvalPending > 0 ? 'صفِّ طابور موافقات المزوّدين' : 'حضّر تفعيل المزوّد التالي',
      evidence: `${approvalPending} approvals · ${fleetBlockedProviders.length} blocked providers`,
      actionEn: approvalPending > 0
        ? 'Review pending providers one at a time; approve or reject with an audited reason.'
        : 'Use fleet blockers to prepare the next provider onboarding call and daemon evidence request.',
      actionAr: approvalPending > 0
        ? 'راجع المزوّدين المعلقين واحداً تلو الآخر؛ وافق أو ارفض بسبب مدقق.'
        : 'استخدم عوائق الأسطول لتحضير مكالمة تجهيز المزوّد التالية وطلب دليل الخادم.',
      severity: approvalPending > 0 ? 'watch' : fleetBlockedProviders.length > 0 ? 'critical' : 'routine',
      agentMode: approvalPending > 0 ? 'guarded' : 'propose',
      href: '#approvals',
    },
    {
      key: 'money-ops',
      owner: 'Finance',
      titleEn: launchMoneyBlockers > 0 ? 'Assign money blockers' : 'Keep finance queue clear',
      titleAr: launchMoneyBlockers > 0 ? 'أسند عوائق المال' : 'أبقِ طابور المالية واضحاً',
      evidence: `${financeQueueTotal} review · ${reconciliationIssues} reconciliation · ${healthPendingWithdrawals} withdrawals`,
      actionEn: launchMoneyBlockers > 0
        ? 'Assign refunds, payouts, withdrawals, or reconciliation drift before public launch pushes.'
        : 'Keep refunds and payouts in verified consoles; use this quiet window for pricing and settlement review.',
      actionAr: launchMoneyBlockers > 0
        ? 'أسند الاستردادات والدفعات والسحوبات أو انحراف المطابقة قبل دفعات الإطلاق العامة.'
        : 'أبقِ الاستردادات والدفعات في اللوحات المتحققة؛ استخدم الهدوء لمراجعة التسعير والتسوية.',
      severity: launchMoneyBlockers > 0 ? 'critical' : 'routine',
      agentMode: launchMoneyBlockers > 0 ? 'guarded' : 'propose',
      href: '#finance',
    },
    {
      key: 'incident-handoff',
      owner: 'Engineering',
      titleEn: incidentCommandHasCritical || recentErrors > 0 ? 'Triage incident evidence' : 'Keep incident watch quiet',
      titleAr: incidentCommandHasCritical || recentErrors > 0 ? 'افرز دليل الحوادث' : 'أبقِ مراقبة الحوادث هادئة',
      evidence: `${incidentMergedCount} incidents · ${recentErrors} errors · ${signalCount} signals`,
      actionEn: incidentCommandHasCritical || recentErrors > 0
        ? 'Group daemon, job, audit, and control-plane evidence; page a human only with owner and rollback notes.'
        : 'Let agents summarize the feed daily; keep control-plane and daemon repair actions in verified consoles.',
      actionAr: incidentCommandHasCritical || recentErrors > 0
        ? 'جمّع دليل الخادم والمهام والتدقيق ولوحة التحكم؛ نبّه إنساناً فقط مع مالك وملاحظات رجوع.'
        : 'دع الوكلاء يلخصون التغذية يومياً؛ أبقِ إجراءات لوحة التحكم وإصلاح الخادم في اللوحات المتحققة.',
      severity: incidentCommandHasCritical ? 'critical' : recentErrors > 0 ? 'watch' : 'routine',
      agentMode: 'propose',
      href: '#incidents',
    },
    {
      key: 'access-agent',
      owner: 'Ops',
      titleEn: missionStrictWrites ? 'Guarded agent writes can be piloted' : 'Harden mission write gate',
      titleAr: missionStrictWrites ? 'يمكن تجربة كتابة الوكلاء المحروسة' : 'قوِّ بوابة كتابة المهمة',
      evidence: `${missionWritePolicy} · agent ${agentWriteState} · notify ${notificationNotifyState}`,
      actionEn: missionStrictWrites
        ? 'Pilot one low-risk mission action with owner, note, and audit trail before expanding agent writes.'
        : 'Keep agents propose-only until strict mission writes and notification allowlists are enabled.',
      actionAr: missionStrictWrites
        ? 'جرّب إجراء مهمة منخفض المخاطر مع مالك وملاحظة وسجل تدقيق قبل توسيع كتابة الوكلاء.'
        : 'أبقِ الوكلاء في وضع الاقتراح فقط حتى تفعيل كتابة المهمة الصارمة وقوائم التنبيه.',
      severity: missionStrictWrites ? 'watch' : 'routine',
      agentMode: missionStrictWrites ? 'guarded' : 'propose',
      href: '#access',
    },
    {
      key: 'mission-ownership',
      owner: 'Founders',
      titleEn: missionBlockedCount > 0 ? 'Unblock mission work' : 'Review mission ownership',
      titleAr: missionBlockedCount > 0 ? 'فك عوائق عمل المهمة' : 'راجع ملكية المهمة',
      evidence: `${openMissionWork || missionTasks.length} open · ${missionBlockedCount} blocked · ${missionShippedCount} shipped`,
      actionEn: missionBlockedCount > 0
        ? 'Move blocked tasks to a named owner with evidence notes; avoid creating broad new work.'
        : 'Use the action desk for status moves, reassignments, and notes only; create/delete stays outside v2.',
      actionAr: missionBlockedCount > 0
        ? 'انقل المهام المحظورة إلى مالك محدد مع ملاحظات دليل؛ تجنب إنشاء عمل واسع جديد.'
        : 'استخدم مكتب الإجراءات لنقل الحالة وإعادة الإسناد والملاحظات فقط؛ الإنشاء والحذف خارج v2.',
      severity: missionBlockedCount > 0 ? 'watch' : 'routine',
      agentMode: 'guarded',
      href: '#mission',
    },
  ]

  useEffect(() => {
    if (!selectedMissionTask) {
      if (selectedMissionTaskId !== null) setSelectedMissionTaskId(null)
      return
    }
    if (selectedMissionTask.id && selectedMissionTask.id !== selectedMissionTaskId) {
      setSelectedMissionTaskId(selectedMissionTask.id)
    }
    if (selectedMissionTask.status && TASK_STATUSES.includes(selectedMissionTask.status as MissionTaskStatus)) {
      setMissionTargetStatus(selectedMissionTask.status as MissionTaskStatus)
    }
    setMissionTargetAssignee(selectedMissionTask.assignee_id || '')
  }, [selectedMissionTask, selectedMissionTaskId])

  const handleMissionAuthError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof Error && err.message === 'admin-auth-expired') {
      localStorage.removeItem('dc1_admin_token')
      setState('missing-key')
      router.replace(AUTH_HREF)
      return true
    }
    setMissionActionMessage({
      kind: 'error',
      text: err instanceof Error ? err.message : fallback,
    })
    return false
  }, [router])

  const submitMissionStatus = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null
    const taskId = selectedMissionTask?.id
    if (!token) {
      setState('missing-key')
      router.replace(AUTH_HREF)
      return
    }
    if (!taskId) {
      setMissionActionMessage({ kind: 'error', text: 'No mission task is selected.' })
      return
    }
    if (missionTargetStatus === 'done' && missionActionNote.trim().length < 8) {
      setMissionActionMessage({ kind: 'error', text: 'Closing a task needs a short evidence note.' })
      return
    }

    setMissionAction('status')
    setMissionActionMessage(null)
    try {
      await patchJson<{ task?: MissionTask }>(
        `/mission/tasks/${taskId}`,
        token,
        {
          status: missionTargetStatus,
          closing_comment: missionTargetStatus === 'done' ? missionActionNote.trim() : undefined,
          author_id: 'admin',
        },
      )
      setMissionActionMessage({ kind: 'success', text: `Task moved to ${missionStatusLabel(missionTargetStatus)}.` })
      if (missionTargetStatus === 'done') setMissionActionNote('')
      await load()
    } catch (err) {
      handleMissionAuthError(err, 'Mission status update failed.')
    } finally {
      setMissionAction(null)
    }
  }, [handleMissionAuthError, load, missionActionNote, missionTargetStatus, router, selectedMissionTask])

  const submitMissionReassign = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null
    const taskId = selectedMissionTask?.id
    if (!token) {
      setState('missing-key')
      router.replace(AUTH_HREF)
      return
    }
    if (!taskId) {
      setMissionActionMessage({ kind: 'error', text: 'No mission task is selected.' })
      return
    }
    if (!missionTargetAssignee) {
      setMissionActionMessage({ kind: 'error', text: 'Choose a mission assignee before reassigning.' })
      return
    }
    const note = missionActionNote.trim()
    if (note.length < 8) {
      setMissionActionMessage({ kind: 'error', text: 'Reassignment needs a rationale of at least 8 characters.' })
      return
    }

    setMissionAction('reassign')
    setMissionActionMessage(null)
    try {
      await postJson<{ task?: MissionTask }>(
        `/mission/tasks/${taskId}/reassign`,
        token,
        { new_assignee_id: missionTargetAssignee, comment: note, author_id: 'admin' },
      )
      setMissionActionMessage({ kind: 'success', text: 'Task reassigned with rationale.' })
      setMissionActionNote('')
      await load()
    } catch (err) {
      handleMissionAuthError(err, 'Mission reassignment failed.')
    } finally {
      setMissionAction(null)
    }
  }, [handleMissionAuthError, load, missionActionNote, missionTargetAssignee, router, selectedMissionTask])

  const submitMissionComment = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null
    const taskId = selectedMissionTask?.id
    if (!token) {
      setState('missing-key')
      router.replace(AUTH_HREF)
      return
    }
    if (!taskId) {
      setMissionActionMessage({ kind: 'error', text: 'No mission task is selected.' })
      return
    }
    const note = missionActionNote.trim()
    if (note.length < 8) {
      setMissionActionMessage({ kind: 'error', text: 'Notes need at least 8 characters.' })
      return
    }

    setMissionAction('comment')
    setMissionActionMessage(null)
    try {
      await postJson<{ comment?: unknown }>(
        `/mission/tasks/${taskId}/comments`,
        token,
        { body: note, author_id: 'admin', source: 'v2_admin', kind: 'admin_note' },
      )
      setMissionActionMessage({ kind: 'success', text: 'Mission note recorded.' })
      setMissionActionNote('')
      await load()
    } catch (err) {
      handleMissionAuthError(err, 'Mission note failed.')
    } finally {
      setMissionAction(null)
    }
  }, [handleMissionAuthError, load, missionActionNote, router, selectedMissionTask])

  const refreshedLabel = refreshedAt
    ? refreshedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '--:--'

  return (
    <div className="v2-admin">
      <aside className="admin-rail">
        <Link href="/v2/home" className="admin-brand">
          <span>DCP</span><i>∞</i>
        </Link>
        <div className="rail-section">
          <a href="#command" className="rail-link on">
            <span>CC</span><Bi en="Command" ar="القيادة" />
          </a>
          <a href="#launch" className="rail-link">
            <span>GO</span><Bi en="Launch" ar="الإطلاق" />
          </a>
          <a href="#serving-recovery" className="rail-link">
            <span>SR</span><Bi en="Recovery" ar="الاستعادة" />
          </a>
          <a href="#runbooks" className="rail-link">
            <span>RB</span><Bi en="Runbooks" ar="كتيبات" />
          </a>
          <a href="#inbox" className="rail-link">
            <span>IN</span><Bi en="Inbox" ar="الصندوق" />
          </a>
          <a href="#readiness" className="rail-link">
            <span>RD</span><Bi en="Readiness" ar="الجاهزية" />
          </a>
          <a href="#fleet" className="rail-link">
            <span>FL</span><Bi en="Fleet" ar="الأسطول" />
          </a>
          <a href="#approvals" className="rail-link">
            <span>AP</span><Bi en="Approvals" ar="الموافقات" />
          </a>
          <a href="#finance" className="rail-link">
            <span>FN</span><Bi en="Finance" ar="المالية" />
          </a>
          <a href="#support" className="rail-link">
            <span>SP</span><Bi en="Support" ar="الدعم" />
          </a>
          <a href="#mission" className="rail-link">
            <span>MS</span><Bi en="Mission" ar="المهمة" />
          </a>
          <a href="#access" className="rail-link">
            <span>AC</span><Bi en="Access" ar="الوصول" />
          </a>
          <a href="#notifications" className="rail-link">
            <span>NT</span><Bi en="Notify" ar="التنبيه" />
          </a>
          <a href="#audit" className="rail-link">
            <span>AU</span><Bi en="Audit" ar="التدقيق" />
          </a>
          <a href="#incidents" className="rail-link">
            <span>IC</span><Bi en="Incidents" ar="الحوادث" />
          </a>
          <a href="#agents" className="rail-link">
            <span>AG</span><Bi en="Agents" ar="الوكلاء" />
          </a>
          <a href="#workflows" className="rail-link">
            <span>WF</span><Bi en="Workflows" ar="التدفقات" />
          </a>
        </div>
        <div className="rail-section muted">
          <Link href="/admin" className="rail-link" prefetch={false}>
            <span>V1</span><Bi en="Current console" ar="اللوحة الحالية" />
          </Link>
          <Link href="/v2/auth?role=admin&method=apikey&redirect=/v2/admin" className="rail-link">
            <span>AK</span><Bi en="Admin key" ar="مفتاح الإدارة" />
          </Link>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-top">
          <div>
            <p className="admin-kicker"><Bi en="Founder operations · agent-aware" ar="عمليات المؤسسين · مدركة للوكلاء" /></p>
            <h1><Bi en="Admin command center" ar="مركز قيادة الإدارة" /></h1>
          </div>
          <div className="admin-top-actions">
            <button type="button" className="lang-switch" onClick={toggle} aria-label="Toggle language">
              <span className={lang === 'en' ? 'on' : undefined}>EN</span>
              <span className={lang === 'ar' ? 'on' : undefined}>ع</span>
            </button>
            <button type="button" className="admin-refresh" onClick={() => void load()} disabled={state === 'loading'}>
              <Bi en={state === 'loading' ? 'Refreshing' : 'Refresh'} ar={state === 'loading' ? 'جارٍ التحديث' : 'تحديث'} />
            </button>
          </div>
        </header>

        <section className="admin-status-strip" id="command" aria-label="Admin status">
          <div>
            <span className={`pulse ${urgentCount > 0 ? 'hot' : watchCount > 0 ? 'warm' : ''}`} />
            <strong>{urgentCount > 0 ? urgentCount : watchCount > 0 ? watchCount : 0}</strong>
            <Bi en={urgentCount > 0 ? 'urgent items' : watchCount > 0 ? 'watch items' : 'urgent items'} ar={urgentCount > 0 ? 'عناصر عاجلة' : watchCount > 0 ? 'عناصر مراقبة' : 'عناصر عاجلة'} />
          </div>
          <div>
            <span><Bi en="last refresh" ar="آخر تحديث" /></span>
            <strong>{refreshedLabel}</strong>
          </div>
          <div>
            <span><Bi en="agent default" ar="وضع الوكيل" /></span>
            <strong><Bi en="propose only" ar="اقتراح فقط" /></strong>
          </div>
          <div>
            <span><Bi en="write policy" ar="سياسة الكتابة" /></span>
            <strong><Bi en="guarded" ar="محروسة" /></strong>
          </div>
        </section>

        {state === 'missing-key' && (
          <section className="admin-state">
            <h2><Bi en="Admin key required" ar="مفتاح الإدارة مطلوب" /></h2>
            <p><Bi en="Use v2 admin sign-in to open the command center." ar="استخدم دخول الإدارة في v2 لفتح مركز القيادة." /></p>
            <Link href={AUTH_HREF}><Bi en="Open admin sign-in" ar="افتح دخول الإدارة" /></Link>
          </section>
        )}

        {state === 'error' && (
          <section className="admin-state error">
            <h2><Bi en="Command center could not load" ar="تعذر تحميل مركز القيادة" /></h2>
            <p>{error}</p>
            <button type="button" onClick={() => void load()}><Bi en="Try again" ar="حاول مرة أخرى" /></button>
          </section>
        )}

        {(state === 'checking' || state === 'loading') && (
          <section className="admin-skeleton" aria-label="Loading admin command center">
            <div /><div /><div /><div />
          </section>
        )}

        {state === 'ready' && (
          <>
            <section className="metric-grid" aria-label="Admin metrics">
              <div className="metric tall">
                <span className="metric-label"><Bi en="Revenue today" ar="إيراد اليوم" /></span>
                <strong>{formatHalala(stats.today_revenue_halala)}</strong>
                <small><Bi en={`${numFmt.format(toNumber(stats.today_jobs))} jobs today`} ar={`${numFmt.format(toNumber(stats.today_jobs))} مهمة اليوم`} /></small>
              </div>
              <div className="metric">
                <span className="metric-label"><Bi en="Serving providers" ar="المزوّدون النشطون" /></span>
                <strong>{numFmt.format(usableOnline)}<small> / {numFmt.format(totalProviders)}</small></strong>
              </div>
              <div className="metric">
                <span className="metric-label"><Bi en="Active renters" ar="المستأجرون النشطون" /></span>
                <strong>{numFmt.format(toNumber(stats.active_renters))}<small> / {numFmt.format(toNumber(stats.total_renters))}</small></strong>
              </div>
              <div className="metric wide">
                <span className="metric-label"><Bi en="Jobs" ar="المهام" /></span>
                <strong>{numFmt.format(toNumber(stats.total_jobs))}</strong>
                <div className="metric-split">
                  <span><Bi en={`${numFmt.format(toNumber(stats.completed_jobs))} completed`} ar={`${numFmt.format(toNumber(stats.completed_jobs))} مكتملة`} /></span>
                  <span><Bi en={`${numFmt.format(toNumber(stats.failed_jobs))} failed`} ar={`${numFmt.format(toNumber(stats.failed_jobs))} فاشلة`} /></span>
                  <span><Bi en={`${numFmt.format(toNumber(stats.active_jobs))} active`} ar={`${numFmt.format(toNumber(stats.active_jobs))} نشطة`} /></span>
                </div>
              </div>
            </section>

            <section className="launch-readiness" id="launch" aria-label="Launch go no-go">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Founder go / no-go" ar="قرار إطلاق المؤسسين" /></p>
                  <h2><Bi en="Launch readiness" ar="جاهزية الإطلاق" /></h2>
                </div>
                <span className={launchState === 'ready' ? 'ready' : 'critical'}>
                  <Bi en={launchState === 'ready' ? 'ready' : `${launchBlockers} blockers`} ar={launchState === 'ready' ? 'جاهز' : `${launchBlockers} عوائق`} />
                </span>
              </div>

              <div className="launch-summary-grid">
                <div className={publicCapacityReady ? 'ready' : 'critical'}>
                  <span><Bi en="public capacity" ar="السعة العامة" /></span>
                  <strong><Bi en={publicCapacityReady ? 'serving' : 'gated'} ar={publicCapacityReady ? 'تخدم' : 'محجوبة'} /></strong>
                  <small><Bi en={`${verifiedOnline} earned · ${fleetModelReady} model-ready`} ar={`${verifiedOnline} متحقق · ${fleetModelReady} جاهز نموذجياً`} /></small>
                </div>
                <div className={launchSystemBlockers > 0 ? 'critical' : 'ready'}>
                  <span><Bi en="system health" ar="صحة النظام" /></span>
                  <strong>{health?.status || 'unknown'}</strong>
                  <small><Bi en={`${healthStuckJobs} stuck jobs · ${healthCriticalEvents} critical events`} ar={`${healthStuckJobs} مهام عالقة · ${healthCriticalEvents} أحداث حرجة`} /></small>
                </div>
                <div className={launchMoneyBlockers > 0 ? 'critical' : 'ready'}>
                  <span><Bi en="money blockers" ar="عوائق مالية" /></span>
                  <strong>{numFmt.format(launchMoneyBlockers)}</strong>
                  <small><Bi en="refunds, payouts, reconciliation, withdrawals" ar="استرداد ودفعات ومطابقة وسحوبات" /></small>
                </div>
                <div className={securityPriorityCount > 0 ? 'critical' : 'ready'}>
                  <span><Bi en="security" ar="الأمن" /></span>
                  <strong>{numFmt.format(securityPriorityCount)}</strong>
                  <small><Bi en="critical + high events" ar="أحداث حرجة وعالية" /></small>
                </div>
                <div className={metricsFailedLastHour > 0 ? 'watch' : ''}>
                  <span><Bi en="queue" ar="الطابور" /></span>
                  <strong>{numFmt.format(metricsPendingJobs + metricsRunningJobs)}</strong>
                  <small><Bi en={`${metricsFailedLastHour} failed last hour · ${metricsAvgWaitSeconds}s avg wait`} ar={`${metricsFailedLastHour} فشل آخر ساعة · ${metricsAvgWaitSeconds}ث انتظار`} /></small>
                </div>
                <div>
                  <span><Bi en="demand signals" ar="إشارات الطلب" /></span>
                  <strong>{numFmt.format(demandSignalCount)}</strong>
                  <small>{demandKeys.slice(0, 2).join(', ') || 'no demand window'}</small>
                </div>
              </div>

              <div className="launch-gate-list">
                <article className={`launch-gate ${publicCapacityReady ? 'ready' : 'critical'}`}>
                  <div>
                    <span><Bi en="01 · Catalog publication" ar="٠١ · نشر الكتالوج" /></span>
                    <strong><Bi en={publicCapacityReady ? 'Real serving capacity is present' : 'Do not claim live marketplace capacity'} ar={publicCapacityReady ? 'توجد سعة خدمة حقيقية' : 'لا تعلن سعة سوق مباشرة'} /></strong>
                  </div>
                  <p><Bi en="Public inventory is allowed only when earned-online, endpoint reachability, and model coverage all pass." ar="يسمح بالمخزون العام فقط عندما تمر الخدمة المتحققة والوصول للنقاط وتغطية النماذج كلها." /></p>
                  <Link href="#fleet"><Bi en="Inspect fleet evidence" ar="افحص دليل الأسطول" /></Link>
                </article>

                <article className={`launch-gate ${launchSystemBlockers > 0 ? 'critical' : 'ready'}`}>
                  <div>
                    <span><Bi en="02 · System health" ar="٠٢ · صحة النظام" /></span>
                    <strong>{health?.status || 'unknown'}</strong>
                  </div>
                  <p><Bi en={`DB ${health?.checks?.database || 'unknown'} · active jobs ${toNumber(health?.checks?.jobs?.active)} · stuck jobs ${healthStuckJobs} · critical events ${healthCriticalEvents}`} ar={`قاعدة البيانات ${health?.checks?.database || 'غير معروفة'} · مهام نشطة ${toNumber(health?.checks?.jobs?.active)} · عالقة ${healthStuckJobs} · أحداث حرجة ${healthCriticalEvents}`} /></p>
                  <Link href="/admin/security" prefetch={false}><Bi en="Open health console" ar="افتح لوحة الصحة" /></Link>
                </article>

                <article className={`launch-gate ${launchMoneyBlockers > 0 ? 'critical' : 'ready'}`}>
                  <div>
                    <span><Bi en="03 · Money operations" ar="٠٣ · عمليات المال" /></span>
                    <strong>{numFmt.format(launchMoneyBlockers)} <Bi en="open" ar="مفتوحة" /></strong>
                  </div>
                  <p><Bi en="Refunds, payouts, reconciliation drift, and pending withdrawals must be clear or assigned before launch pushes." ar="يجب تصفية أو إسناد الاستردادات والدفعات وانحراف المطابقة والسحوبات المعلقة قبل دفعات الإطلاق." /></p>
                  <Link href="#finance"><Bi en="Review finance queue" ar="راجع طابور المالية" /></Link>
                </article>

                <article className={`launch-gate ${securityPriorityCount > 0 ? 'critical' : 'ready'}`}>
                  <div>
                    <span><Bi en="04 · Security posture" ar="٠٤ · الوضع الأمني" /></span>
                    <strong>{numFmt.format(securityPriorityCount)} <Bi en="priority" ar="أولوية" /></strong>
                  </div>
                  <p><Bi en="Critical and high security events block public launch language until triaged." ar="الأحداث الأمنية الحرجة والعالية تمنع لغة الإطلاق العامة حتى الفرز." /></p>
                  <Link href="/admin/security" prefetch={false}><Bi en="Open security" ar="افتح الأمن" /></Link>
                </article>

                <article className={`launch-gate ${incidentCommandHasCritical ? 'critical' : recentErrors > 0 ? 'watch' : 'ready'}`}>
                  <div>
                    <span><Bi en="05 · Incident command" ar="٠٥ · قيادة الحوادث" /></span>
                    <strong>{numFmt.format(incidentMergedCount)} <Bi en="events" ar="أحداث" /></strong>
                  </div>
                  <p><Bi en="Daemon, job, audit, and status incidents should be quiet or assigned before changing public promises." ar="يجب أن تكون حوادث الخادم والمهام والتدقيق والحالة هادئة أو مسندة قبل تغيير الوعود العامة." /></p>
                  <Link href="#incidents"><Bi en="Open incidents" ar="افتح الحوادث" /></Link>
                </article>
              </div>

              <p className="launch-policy">
                <Bi
                  en="v2 launch readiness is read-only. It decides what the founding team may safely say publicly; it does not trigger provider repair, payments, deploys, or control-plane runs."
                  ar="جاهزية إطلاق v2 للقراءة فقط. تحدد ما يمكن لفريق المؤسسين قوله علناً بأمان؛ ولا تشغل إصلاح مزوّد أو مدفوعات أو نشر أو دورات لوحة التحكم."
                />
              </p>
            </section>

            <section className="serving-recovery" id="serving-recovery" aria-label="Serving recovery workflow">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Runtime recovery" ar="استعادة وقت التشغيل" /></p>
                  <h2><Bi en="Serving recovery" ar="استعادة الخدمة" /></h2>
                </div>
                <span className={publicCapacityReady ? 'ready' : 'critical'}>
                  <Bi en={publicCapacityReady ? 'serving' : `${servingRecoveryCritical} critical`} ar={publicCapacityReady ? 'يخدم' : `${servingRecoveryCritical} حرجة`} />
                </span>
              </div>

              <div className="serving-recovery-summary">
                <div className={usableOnline > 0 ? 'ready' : 'critical'}>
                  <span><Bi en="verified serving" ar="خدمة متحققة" /></span>
                  <strong>{numFmt.format(usableOnline)}</strong>
                  <small><Bi en="metering-grade providers" ar="مزوّدون بدرجة القياس" /></small>
                </div>
                <div className={fleetEndpointReachable > 0 ? 'ready' : 'critical'}>
                  <span><Bi en="endpoint reachable" ar="النقطة متاحة" /></span>
                  <strong>{numFmt.format(fleetEndpointReachable)}</strong>
                  <small><Bi en={`${servingInferenceProbeBlocked} still fail earned probe`} ar={`${servingInferenceProbeBlocked} ما زالت تفشل فحص الخدمة`} /></small>
                </div>
                <div className={servingTimeoutCount > 0 ? 'critical' : ''}>
                  <span><Bi en="probe timeouts" ar="انتهاء مهلة الفحص" /></span>
                  <strong>{numFmt.format(servingTimeoutCount)}</strong>
                  <small><Bi en="runtime accepts route but not verified inference" ar="وقت التشغيل يقبل المسار لكن لا يثبت الاستدلال" /></small>
                </div>
                <div className={servingNoModelCount > 0 ? 'critical' : ''}>
                  <span><Bi en="model gaps" ar="فجوات النماذج" /></span>
                  <strong>{numFmt.format(servingNoModelCount)}</strong>
                  <small><Bi en="cached model or alias evidence missing" ar="دليل النموذج المخزن أو المرادف مفقود" /></small>
                </div>
              </div>

              <p className="serving-recovery-source">
                <Bi
                  en={`Canonical probe evidence: ${servingProbeEvidenceAge}`}
                  ar={`دليل الفحص المعتمد: ${servingProbeEvidenceAge}`}
                />
              </p>

              <div className="serving-recovery-grid">
                <article className="serving-recovery-main">
                  <div className="mission-panel-head">
                    <span><Bi en="Provider recovery queue" ar="طابور استعادة المزوّدين" /></span>
                    <Link href="#fleet"><Bi en="Open fleet evidence" ar="افتح دليل الأسطول" /></Link>
                  </div>

                  {servingRecoveryPreview.length === 0 ? (
                    <p className="serving-recovery-empty"><Bi en="No provider evidence returned yet. Fleet health must load before recovery can be assigned." ar="لم يعد دليل مزوّدين بعد. يجب تحميل صحة الأسطول قبل إسناد الاستعادة." /></p>
                  ) : (
                    <div className="serving-recovery-list">
                      {servingRecoveryPreview.map((item) => {
                        const label = agentLabel(item.agentMode)
                        const blockers = fleetProviderBlockers(item.provider)
                        return (
                          <article className={`serving-recovery-card ${item.severity}`} key={item.key}>
                            <div className="serving-recovery-card-head">
                              <div>
                                <span><Bi en={item.focusEn} ar={item.focusAr} /></span>
                                <strong>{fleetProviderLabel(item.provider)}</strong>
                              </div>
                              <em><Bi en={label.en} ar={label.ar} /></em>
                            </div>
                            <p><Bi en={item.actionEn} ar={item.actionAr} /></p>
                            <small>{item.detail}</small>
                            <div className="serving-recovery-blockers">
                              {blockers.length === 0 ? (
                                <span className="ready"><Bi en="No current blocker in fleet health." ar="لا يوجد عائق حالي في صحة الأسطول." /></span>
                              ) : (
                                blockers.slice(0, 4).map((blocker) => <span key={blocker}>{blocker}</span>)
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </article>

                <article className="serving-recovery-playbook">
                  <div className="mission-panel-head">
                    <span><Bi en="Recovery playbook" ar="كتيب الاستعادة" /></span>
                    <Link href="/admin/fleet" prefetch={false}><Bi en="Verified console" ar="اللوحة المتحققة" /></Link>
                  </div>
                  <ol>
                    <li>
                      <strong><Bi en="Prove the route" ar="أثبت المسار" /></strong>
                      <p><Bi en="From the VPS, test the provider /v1/models endpoint and record whether the route fails, times out, or returns an OpenAI-shaped response." ar="من الخادم، اختبر نقطة /v1/models للمزوّد وسجّل هل يفشل المسار أو تنتهي مهلته أو يعيد استجابة بشكل OpenAI." /></p>
                    </li>
                    <li>
                      <strong><Bi en="Prove inference" ar="أثبت الاستدلال" /></strong>
                      <p><Bi en="Run a one-token chat or embedding probe against the served model before changing catalog, pricing, or public marketplace language." ar="شغّل فحص محادثة أو تضمين برمز واحد على النموذج المخدوم قبل تغيير الكتالوج أو التسعير أو لغة السوق العامة." /></p>
                    </li>
                    <li>
                      <strong><Bi en="Prove model coverage" ar="أثبت تغطية النموذج" /></strong>
                      <p><Bi en="Match daemon-reported cached models and catalog aliases so renters do not see provider_count until a real model can answer." ar="طابق النماذج المخزنة التي يرسلها الخادم المحلي مع مرادفات الكتالوج حتى لا يرى المستأجرون provider_count قبل أن يجيب نموذج حقيقي." /></p>
                    </li>
                  </ol>
                </article>
              </div>

              <p className="serving-recovery-policy">
                <Bi
                  en="v2 serving recovery is read-only. agents may collect probe evidence, draft provider handoff notes, and suggest the next verified-console action; daemon restarts, tunnel changes, endpoint edits, routing changes, and public capacity flips stay outside v2 until audited recovery actions exist."
                  ar="استعادة الخدمة في v2 للقراءة فقط. يمكن للوكلاء جمع أدلة الفحص وصياغة ملاحظات تسليم للمزوّد واقتراح الإجراء التالي في اللوحة المتحققة؛ تبقى إعادة تشغيل الخادم المحلي وتغييرات النفق وتعديلات النقاط والتوجيه وقلب السعة العامة خارج v2 حتى توجد إجراءات استعادة مدققة."
                />
              </p>
            </section>

            <section className="runbook-queue" id="runbooks" aria-label="Founder runbook queue">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Owner map" ar="خريطة الملكية" /></p>
                  <h2><Bi en="Runbook queue" ar="طابور كتيبات التشغيل" /></h2>
                </div>
                <span><Bi en="decision support" ar="دعم القرار" /></span>
              </div>

              <div className="runbook-grid">
                {runbookSteps.map((step, index) => {
                  const label = agentLabel(step.agentMode)
                  return (
                    <article className={`runbook-card ${step.severity}`} key={step.key}>
                      <div className="runbook-card-head">
                        <span>{String(index + 1).padStart(2, '0')} · {step.owner}</span>
                        <em><Bi en={label.en} ar={label.ar} /></em>
                      </div>
                      <strong><Bi en={step.titleEn} ar={step.titleAr} /></strong>
                      <p><Bi en={step.actionEn} ar={step.actionAr} /></p>
                      <small>{step.evidence}</small>
                      <Link href={step.href} prefetch={isLegacyAdminHref(step.href) ? false : undefined}>
                        <Bi en="Open evidence" ar="افتح الدليل" />
                      </Link>
                    </article>
                  )
                })}
              </div>

              <p className="runbook-policy">
                <Bi
                  en="v2 runbooks are decision support for humans and agents. Agents may collect evidence and draft notes; repairs, money movement, deploys, provider actions, and control-plane writes stay in verified consoles."
                  ar="كتيبات v2 لدعم قرار البشر والوكلاء. يمكن للوكلاء جمع الدليل وصياغة الملاحظات؛ الإصلاحات وحركة المال والنشر وإجراءات المزوّد وكتابة لوحة التحكم تبقى في اللوحات المتحققة."
                />
              </p>
            </section>

            <section className="readiness-board" id="readiness" aria-label="Launch readiness">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Launch control" ar="تحكم الإطلاق" /></p>
                  <h2><Bi en="Readiness board" ar="لوحة الجاهزية" /></h2>
                </div>
                <span><Bi en="read-only" ar="قراءة فقط" /></span>
              </div>
              <div className="readiness-grid">
                {readiness.map((check) => (
                  <Link
                    key={check.key}
                    href={check.href}
                    className={`readiness ${check.status}`}
                    prefetch={isLegacyAdminHref(check.href) ? false : undefined}
                  >
                    <div>
                      <span><Bi en={check.labelEn} ar={check.labelAr} /></span>
                      <strong>{check.value}</strong>
                    </div>
                    <p><Bi en={check.detailEn} ar={check.detailAr} /></p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="fleet-readiness" id="fleet" aria-label="Inference fleet readiness">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Inference readiness" ar="جاهزية الاستدلال" /></p>
                  <h2><Bi en="Fleet blockers" ar="عوائق الأسطول" /></h2>
                </div>
                <span className={fleet?.serving_now && usableOnline > 0 ? 'ready' : 'critical'}>
                  <Bi en={fleet?.serving_now && usableOnline > 0 ? 'serving' : 'blocked'} ar={fleet?.serving_now && usableOnline > 0 ? 'يخدم' : 'محجوب'} />
                </span>
              </div>

              <div className="fleet-summary-grid">
                <div className={fleet?.serving_now ? 'ready' : 'critical'}>
                  <span><Bi en="serving now" ar="يخدم الآن" /></span>
                  <strong><Bi en={fleet?.serving_now ? 'yes' : 'no'} ar={fleet?.serving_now ? 'نعم' : 'لا'} /></strong>
                </div>
                <div className={usableOnline > 0 ? 'ready' : 'critical'}>
                  <span><Bi en="usable online" ar="قابل للخدمة" /></span>
                  <strong>{numFmt.format(usableOnline)}</strong>
                </div>
                <div className={verifiedOnline > 0 ? 'ready' : 'critical'}>
                  <span><Bi en="earned online" ar="نشط متحقق" /></span>
                  <strong>{numFmt.format(verifiedOnline)}</strong>
                </div>
                <div className={fleetEndpointReachable > 0 ? 'ready' : 'critical'}>
                  <span><Bi en="endpoint reachable" ar="النقطة قابلة للوصول" /></span>
                  <strong>{numFmt.format(fleetEndpointReachable)}</strong>
                </div>
                <div className={fleetModelReady > 0 ? 'ready' : 'critical'}>
                  <span><Bi en="model coverage" ar="تغطية النماذج" /></span>
                  <strong>{numFmt.format(fleetModelReady)}</strong>
                </div>
              </div>

              <div className="fleet-readiness-grid">
                <article className="fleet-provider-panel">
                  <div className="mission-panel-head">
                    <span><Bi en="Provider blockers" ar="عوائق المزوّدين" /></span>
                    <Link href="/admin/fleet" prefetch={false}><Bi en="Open fleet console" ar="افتح لوحة الأسطول" /></Link>
                  </div>

                  {fleetProviderPreview.length === 0 ? (
                    <p className="fleet-empty"><Bi en="No provider rows returned by fleet health yet." ar="لم تعد صحة الأسطول صفوف مزوّدين بعد." /></p>
                  ) : (
                    <div className="fleet-provider-list">
                      {fleetProviderPreview.map((provider) => {
                        const blockers = fleetProviderBlockers(provider)
                        const severity = fleetProviderSeverity(provider)
                        const cachedModels = fleetCachedModels(provider)
                        const providerId = provider.id || fleetProviderLabel(provider)
                        return (
                          <article className={`fleet-provider-card ${severity}`} key={providerId}>
                            <div className="fleet-provider-top">
                              <div>
                                <span>{provider.gpu_model || 'GPU unknown'}</span>
                                <strong>{fleetProviderLabel(provider)}</strong>
                              </div>
                              <em><Bi en={blockers.length === 0 ? 'ready' : `${blockers.length} blockers`} ar={blockers.length === 0 ? 'جاهز' : `${blockers.length} عوائق`} /></em>
                            </div>

                            <div className="fleet-provider-facts">
                              <div>
                                <span><Bi en="earned" ar="متحقق" /></span>
                                <strong><Bi en={provider.verified_online ? 'yes' : 'no'} ar={provider.verified_online ? 'نعم' : 'لا'} /></strong>
                              </div>
                              <div>
                                <span><Bi en="endpoint" ar="النقطة" /></span>
                                <strong><Bi en={provider.endpoint_reachable ? 'reachable' : provider.endpoint_reachable === false ? 'down' : 'unprobed'} ar={provider.endpoint_reachable ? 'متاحة' : provider.endpoint_reachable === false ? 'متوقفة' : 'لم تفحص'} /></strong>
                              </div>
                              <div>
                                <span><Bi en="heartbeat" ar="النبض" /></span>
                                <strong>{formatAgeSeconds(provider.heartbeat_age_seconds)}</strong>
                              </div>
                              <div>
                                <span><Bi en="WireGuard" ar="WireGuard" /></span>
                                <strong>{formatAgeSeconds(provider.wg_handshake_age_s)}</strong>
                              </div>
                              <div>
                                <span><Bi en="models" ar="النماذج" /></span>
                                <strong>{toNumber(provider.cached_models_count) || cachedModels.length}</strong>
                              </div>
                            </div>

                            <div className="fleet-blockers">
                              {blockers.length === 0 ? (
                                <span className="ready"><Bi en="Ready to serve if routing selects this provider." ar="جاهز للخدمة إذا اختاره التوجيه." /></span>
                              ) : (
                                blockers.map((blocker) => <span key={blocker}>{blocker}</span>)
                              )}
                            </div>

                            <small>
                              <Bi
                                en={`jobs ${toNumber(provider.jobs_running)} running · ${toNumber(provider.container_restart_count_24h)} restarts / 24h · ${shortId(provider.verify_endpoint, 28)}`}
                                ar={`مهام ${toNumber(provider.jobs_running)} نشطة · ${toNumber(provider.container_restart_count_24h)} إعادة تشغيل / 24 ساعة · ${shortId(provider.verify_endpoint, 28)}`}
                              />
                            </small>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </article>

                <article className="fleet-alert-panel">
                  <div className="mission-panel-head">
                    <span><Bi en="Alert evidence" ar="دليل التنبيهات" /></span>
                    <em>{numFmt.format(fleetBlockedProviders.length)} <Bi en="blocked" ar="محجوب" /></em>
                  </div>

                  <div className="fleet-alert-stats">
                    <div><span><Bi en="ready providers" ar="مزوّدون جاهزون" /></span><strong>{numFmt.format(fleetReadyProviders.length)}</strong></div>
                    <div><span><Bi en="blocked providers" ar="مزوّدون محجوبون" /></span><strong>{numFmt.format(fleetBlockedProviders.length)}</strong></div>
                    <div><span><Bi en="alerts" ar="تنبيهات" /></span><strong>{numFmt.format(fleetAlertCount)}</strong></div>
                  </div>

                  {fleetAlertsPreview.length === 0 ? (
                    <p className="fleet-empty"><Bi en="No fleet alerts returned. If serving is still blocked, inspect provider readiness above first." ar="لا توجد تنبيهات أسطول. إذا كانت الخدمة لا تزال محجوبة، افحص جاهزية المزوّدين أعلاه أولاً." /></p>
                  ) : (
                    <div className="fleet-alert-list">
                      {fleetAlertsPreview.map((alert, index) => (
                        <div className="fleet-alert" key={`${alert.provider_id || alert.email || 'alert'}-${index}`}>
                          <strong>{alert.email || `Provider #${alert.provider_id || 'unknown'}`}</strong>
                          <p>{(alert.reasons || []).map(fleetReasonLabel).join(', ') || 'Fleet alert requires review.'}</p>
                          <small>{formatAgeSeconds(alert.heartbeat_age_seconds)} heartbeat · {toNumber(alert.jobs_in_progress)} jobs · {toNumber(alert.restart_count_last_hour)} restarts</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <p className="fleet-policy">
                <Bi
                  en="v2 fleet readiness is read-only. Provider pause/resume, endpoint edits, WireGuard repair, and routing changes stay in the verified fleet/provider consoles until v2 fleet actions have explicit audit and rollback rules."
                  ar="جاهزية الأسطول في v2 للقراءة فقط. تبقى إيقاف/استئناف المزوّد وتعديل النقاط وإصلاح WireGuard وتغييرات التوجيه في لوحات الأسطول/المزوّدين المتحققة حتى تملك إجراءات الأسطول في v2 قواعد تدقيق ورجوع صريحة."
                />
              </p>
            </section>

            <section className="approval-desk" id="approvals" aria-label="Provider approval desk">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Provider operations" ar="عمليات المزوّدين" /></p>
                  <h2><Bi en="Approval desk" ar="مكتب الموافقات" /></h2>
                </div>
                <span><Bi en="guarded write" ar="كتابة محروسة" /></span>
              </div>

              {approvalProviders.length === 0 ? (
                <div className="approval-empty">
                  <strong><Bi en="No providers are waiting for approval" ar="لا يوجد مزوّدون بانتظار الموافقة" /></strong>
                  <p><Bi en="New registrations will appear here with SLA age, audit policy, and one-provider-at-a-time decisions." ar="ستظهر التسجيلات الجديدة هنا مع عمر SLA وسياسة التدقيق وقرارات مزوّد واحد في كل مرة." /></p>
                </div>
              ) : (
                <div className="approval-layout">
                  <div className="approval-list" aria-label="Pending provider approvals">
                    {approvalProviders.map((provider) => {
                      const providerId = toNumber(provider.provider_id)
                      const slaClass = approvalSlaClass(provider)
                      return (
                        <button
                          key={providerId}
                          type="button"
                          className={`approval-row ${slaClass} ${providerId === selectedApproval?.provider_id ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedApprovalId(providerId)
                            setApprovalMessage(null)
                          }}
                        >
                          <span>{provider.name || `Provider #${providerId}`}</span>
                          <strong>{formatDuration(provider.pending_duration_seconds)}</strong>
                          <small>{provider.email || 'no email'}</small>
                        </button>
                      )
                    })}
                  </div>

                  <div className="approval-detail">
                    <div className="approval-provider-head">
                      <div>
                        <span><Bi en="selected provider" ar="المزوّد المحدد" /></span>
                        <h3>{selectedApproval?.name || (selectedApproval ? `Provider #${selectedApproval.provider_id}` : 'Provider')}</h3>
                      </div>
                      {selectedApproval && (
                        <Link href={`/admin/providers/${selectedApproval.provider_id}`} prefetch={false}>
                          <Bi en="Open legacy detail" ar="افتح التفاصيل الحالية" />
                        </Link>
                      )}
                    </div>

                    <div className="approval-facts">
                      <div>
                        <span><Bi en="queued" ar="دخل الطابور" /></span>
                        <strong>{formatDate(selectedApproval?.created_at)}</strong>
                      </div>
                      <div>
                        <span><Bi en="pending age" ar="عمر الانتظار" /></span>
                        <strong>{formatDuration(selectedApproval?.pending_duration_seconds)}</strong>
                      </div>
                      <div>
                        <span><Bi en="SLA" ar="اتفاقية الخدمة" /></span>
                        <strong><Bi en={selectedApproval?.sla_breached ? 'breached' : 'open'} ar={selectedApproval?.sla_breached ? 'متجاوزة' : 'مفتوحة'} /></strong>
                      </div>
                    </div>

                    <div className="approval-evidence">
                      <span><Bi en="Decision envelope" ar="غلاف القرار" /></span>
                      <ul>
                        <li><Bi en="Human chooses the final decision." ar="الإنسان يختار القرار النهائي." /></li>
                        <li><Bi en="Backend accepts pending providers only." ar="الخلفية تقبل المزوّدين المعلّقين فقط." /></li>
                        <li><Bi en="Every decision records an immutable audit row." ar="كل قرار يسجل صف تدقيق غير قابل للتغيير." /></li>
                      </ul>
                    </div>

                    <label className="approval-reason">
                      <span><Bi en="Reject reason" ar="سبب الرفض" /></span>
                      <textarea
                        value={approvalReason}
                        onChange={(event) => setApprovalReason(event.target.value)}
                        placeholder={lang === 'ar' ? 'مطلوب عند الرفض، ويبقى في سجل التدقيق.' : 'Required for rejection; stored in the audit trail.'}
                        rows={4}
                      />
                    </label>

                    {approvalMessage && (
                      <p className={`approval-message ${approvalMessage.kind}`}>{approvalMessage.text}</p>
                    )}

                    <div className="approval-actions">
                      <button
                        type="button"
                        className="approve"
                        disabled={!selectedApproval || approvalAction !== null}
                        onClick={() => void submitApprovalDecision('approve')}
                      >
                        <Bi en={approvalAction === 'approve' ? 'Approving' : 'Approve provider'} ar={approvalAction === 'approve' ? 'جارٍ الموافقة' : 'وافق على المزوّد'} />
                      </button>
                      <button
                        type="button"
                        className="reject"
                        disabled={!selectedApproval || approvalAction !== null || approvalReason.trim().length < 8}
                        onClick={() => void submitApprovalDecision('reject')}
                      >
                        <Bi en={approvalAction === 'reject' ? 'Rejecting' : 'Reject with reason'} ar={approvalAction === 'reject' ? 'جارٍ الرفض' : 'ارفض مع السبب'} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="finance-review" id="finance" aria-label="Finance review queue">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Money operations" ar="عمليات الأموال" /></p>
                  <h2><Bi en="Finance review" ar="مراجعة المالية" /></h2>
                </div>
                <span className={financeQueueTotal > 0 ? 'critical' : 'ready'}>
                  <Bi en={financeQueueTotal > 0 ? `${financeQueueTotal} review` : 'clear'} ar={financeQueueTotal > 0 ? `${financeQueueTotal} مراجعة` : 'واضح'} />
                </span>
              </div>

              <div className="finance-summary-grid">
                <div className={refundReviewRows.length > 0 ? 'critical' : ''}>
                  <span><Bi en="refund review" ar="مراجعة الاسترداد" /></span>
                  <strong>{countByStatus(audit?.summary?.refund_requests, ['pending', 'processing'])}</strong>
                </div>
                <div className={payoutReviewRows.length > 0 ? 'critical' : ''}>
                  <span><Bi en="provider payouts" ar="دفعات المزوّدين" /></span>
                  <strong>{countByStatus(audit?.summary?.payouts, ['pending', 'processing'])}</strong>
                </div>
                <div className={billingExceptionRows.length > 0 ? 'watch' : ''}>
                  <span><Bi en="billing exceptions" ar="استثناءات الفوترة" /></span>
                  <strong>{countByStatus(audit?.summary?.billing_attempts, ['error', 'insufficient_balance'])}</strong>
                </div>
                <div className={autoTopupIssueRows.length > 0 ? 'watch' : ''}>
                  <span><Bi en="auto-top-up issues" ar="مشاكل الشحن التلقائي" /></span>
                  <strong>{countByStatus(audit?.summary?.auto_topup, ['failed', 'capped', 'paused'])}</strong>
                </div>
              </div>

              <div className={`finance-review-grid ${financeReviewHasRows ? 'active' : 'clear'}`}>
                <article className="finance-card">
                  <div className="mission-panel-head">
                    <span><Bi en="Refund requests" ar="طلبات الاسترداد" /></span>
                    <Link href="/admin/payments" prefetch={false}><Bi en="Open payments" ar="افتح المدفوعات" /></Link>
                  </div>
                  {refundReviewRows.length === 0 ? (
                    <p className="finance-empty"><Bi en="No pending or processing refund requests." ar="لا توجد طلبات استرداد معلقة أو قيد المعالجة." /></p>
                  ) : (
                    <div className="finance-row-list">
                      {refundReviewRows.map((row) => (
                        <div className="finance-row" key={row.request_id || row.payment_id || row.requested_at || 'refund'}>
                          <div className="finance-row-top">
                            <strong>{row.renter_name || row.renter_email || `Renter #${row.renter_id || 'unknown'}`}</strong>
                            <span className={`finance-status ${String(row.status || 'unknown').toLowerCase()}`}>{row.status || 'unknown'}</span>
                          </div>
                          <p>{row.reason || 'No refund reason recorded.'}</p>
                          <small>{formatSar(row.amount_sar)} · payment {shortId(row.payment_id)} · {formatDate(row.requested_at)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="finance-card">
                  <div className="mission-panel-head">
                    <span><Bi en="Provider payouts" ar="دفعات المزوّدين" /></span>
                    <Link href="/admin/withdrawals" prefetch={false}><Bi en="Open withdrawals" ar="افتح السحوبات" /></Link>
                  </div>
                  {payoutReviewRows.length === 0 ? (
                    <p className="finance-empty"><Bi en="No pending or processing provider payouts." ar="لا توجد دفعات مزوّدين معلقة أو قيد المعالجة." /></p>
                  ) : (
                    <div className="finance-row-list">
                      {payoutReviewRows.map((row) => (
                        <div className="finance-row" key={row.payout_id || row.requested_at || 'payout'}>
                          <div className="finance-row-top">
                            <strong>{row.provider_name || row.provider_email || `Provider #${row.provider_id || 'unknown'}`}</strong>
                            <span className={`finance-status ${String(row.status || 'unknown').toLowerCase()}`}>{row.status || 'unknown'}</span>
                          </div>
                          <p>{row.failure_reason || row.payment_ref || row.moyasar_status || 'Review earnings, payout account, and transfer evidence.'}</p>
                          <small>{formatSar(row.amount_sar)} · payout {shortId(row.payout_id)} · {formatDate(row.requested_at)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="finance-card">
                  <div className="mission-panel-head">
                    <span><Bi en="Billing exceptions" ar="استثناءات الفوترة" /></span>
                    <Link href="/admin/payments" prefetch={false}><Bi en="Open audit" ar="افتح التدقيق" /></Link>
                  </div>
                  {billingExceptionRows.length === 0 ? (
                    <p className="finance-empty"><Bi en="No billing errors or insufficient-balance attempts." ar="لا توجد أخطاء فوترة أو محاولات رصيد غير كافٍ." /></p>
                  ) : (
                    <div className="finance-row-list">
                      {billingExceptionRows.map((row) => (
                        <div className="finance-row" key={row.request_id || row.settled_at || 'billing'}>
                          <div className="finance-row-top">
                            <strong>{shortId(row.request_id, 14)}</strong>
                            <span className={`finance-status ${String(row.status || 'unknown').toLowerCase()}`}>{row.status || 'unknown'}</span>
                          </div>
                          <p>{row.error_code || 'Billing attempt needs review before balance correction or renter support.'}</p>
                          <small>{formatSar(row.cost_sar)} · {row.renter_email || `Renter #${row.renter_id || 'unknown'}`} · {formatDate(row.settled_at)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="finance-card">
                  <div className="mission-panel-head">
                    <span><Bi en="Auto-top-up issues" ar="مشاكل الشحن التلقائي" /></span>
                    <Link href="/admin/payments" prefetch={false}><Bi en="Open audit" ar="افتح التدقيق" /></Link>
                  </div>
                  {autoTopupIssueRows.length === 0 ? (
                    <p className="finance-empty"><Bi en="No failed, capped, or paused auto-top-up attempts." ar="لا توجد محاولات شحن تلقائي فاشلة أو محدودة أو متوقفة." /></p>
                  ) : (
                    <div className="finance-row-list">
                      {autoTopupIssueRows.map((row) => (
                        <div className="finance-row" key={row.attempt_id || row.created_at || 'auto-topup'}>
                          <div className="finance-row-top">
                            <strong>{row.renter_name || row.renter_email || `Renter #${row.renter_id || 'unknown'}`}</strong>
                            <span className={`finance-status ${String(row.status || 'unknown').toLowerCase()}`}>{row.status || 'unknown'}</span>
                          </div>
                          <p>{row.error_message || row.error_code || row.trigger_reason || 'Auto-top-up attempt needs review.'}</p>
                          <small>{formatSar(row.amount_sar)} · attempt {shortId(row.attempt_id)} · {formatDate(row.created_at)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <p className="finance-policy">
                <Bi
                  en="v2 finance is review-only for now. Refund approval, rejection, payout sync, and balance-changing actions stay in the current verified payments consoles until the v2 money-action envelope is separately audited."
                  ar="مالية v2 للقراءة والمراجعة الآن. تبقى موافقة الاسترداد ورفضه ومزامنة الدفعات وأي إجراء يغير الرصيد في لوحات المدفوعات الحالية المتحققة حتى تدقيق غلاف إجراءات المال في v2 بشكل منفصل."
                />
              </p>
            </section>

            <section className="support-ops" id="support" aria-label="Customer support operations">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Customer operations" ar="عمليات العملاء" /></p>
                  <h2><Bi en="Support desk" ar="مكتب الدعم" /></h2>
                </div>
                <span className={supportQueueTotal > 0 ? 'watch' : 'ready'}>
                  <Bi en={supportQueueTotal > 0 ? `${supportQueueTotal} signals` : 'quiet'} ar={supportQueueTotal > 0 ? `${supportQueueTotal} إشارة` : 'هادئ'} />
                </span>
              </div>

              <div className="support-summary-grid">
                <div className={supportRecent24h > 0 ? 'watch' : ''}>
                  <span><Bi en="contacts 24h" ar="تواصل 24س" /></span>
                  <strong>{numFmt.format(supportRecent24h)}</strong>
                </div>
                <div>
                  <span><Bi en="renter records" ar="سجلات المستأجرين" /></span>
                  <strong>{numFmt.format(toNumber(renterSupport?.total) || renterSupportList.length)}</strong>
                </div>
                <div className={failedJobRows.length > 0 ? 'critical' : ''}>
                  <span><Bi en="failed jobs" ar="مهام فاشلة" /></span>
                  <strong>{numFmt.format(toNumber(jobSupport?.stats?.failed) || failedJobRows.length)}</strong>
                </div>
                <div className={paymentIssueRows.length > 0 ? 'watch' : ''}>
                  <span><Bi en="payment issues" ar="مشاكل الدفع" /></span>
                  <strong>{numFmt.format(paymentIssueRows.length)}</strong>
                </div>
              </div>

              <div className={`support-grid ${supportDeskHasRows ? 'active' : 'clear'}`}>
                <article className="support-card">
                  <div className="mission-panel-head">
                    <span><Bi en="Contact submissions" ar="طلبات التواصل" /></span>
                    <em><Bi en={`${supportCategoryCount} categories`} ar={`${supportCategoryCount} فئات`} /></em>
                  </div>
                  {supportContactList.length === 0 ? (
                    <p className="support-empty"><Bi en="No saved support submissions yet." ar="لا توجد طلبات دعم محفوظة بعد." /></p>
                  ) : (
                    <div className="support-row-list">
                      {supportContactList.slice(0, 4).map((row) => (
                        <div className="support-row" key={row.id || row.email || row.created_at || 'contact'}>
                          <div className="support-row-top">
                            <strong>{row.name || row.email || 'Unknown contact'}</strong>
                            <span className="support-category">{row.category || 'general'}</span>
                          </div>
                          <p>{row.message || 'No message recorded.'}</p>
                          <small>{row.email || 'no email'} · {row.source || 'site'} · {formatDate(row.created_at)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="support-card">
                  <div className="mission-panel-head">
                    <span><Bi en="Renter risk" ar="مخاطر المستأجر" /></span>
                    <Link href="/admin/renters" prefetch={false}><Bi en="Open renters" ar="افتح المستأجرين" /></Link>
                  </div>
                  {lowBalanceRenterRows.length === 0 ? (
                    <p className="support-empty"><Bi en="No suspended, low-balance, or failed-job renter records in the latest sample." ar="لا توجد سجلات مستأجرين معلقة أو منخفضة الرصيد أو كثيرة الفشل في العينة الأخيرة." /></p>
                  ) : (
                    <div className="support-row-list">
                      {lowBalanceRenterRows.map((row) => (
                        <div className="support-row" key={row.id || row.email || 'renter'}>
                          <div className="support-row-top">
                            <strong>{row.name || row.email || `Renter #${row.id || 'unknown'}`}</strong>
                            <span className={`support-category ${String(row.status || '').toLowerCase()}`}>{row.status || 'unknown'}</span>
                          </div>
                          <p>{row.organization || row.email || 'No organization recorded.'}</p>
                          <small>{formatHalala(row.balance_halala)} balance · {toNumber(row.failed_jobs)} failed / {toNumber(row.total_jobs)} jobs · {formatHalala(row.total_spent_halala)} spent</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="support-card">
                  <div className="mission-panel-head">
                    <span><Bi en="Job pain" ar="مشاكل المهام" /></span>
                    <Link href="/admin/jobs" prefetch={false}><Bi en="Open jobs" ar="افتح المهام" /></Link>
                  </div>
                  {jobPainRows.length === 0 ? (
                    <p className="support-empty"><Bi en="No failed, queued, assigned, or running jobs in the latest sample." ar="لا توجد مهام فاشلة أو منتظرة أو معينة أو قيد التشغيل في العينة الأخيرة." /></p>
                  ) : (
                    <div className="support-row-list">
                      {jobPainRows.map((row) => (
                        <div className="support-row" key={row.job_id || row.id || 'job'}>
                          <div className="support-row-top">
                            <strong>{shortId(row.job_id || String(row.id || ''), 14)}</strong>
                            <span className={`support-category ${String(row.status || '').toLowerCase()}`}>{row.status || 'unknown'}</span>
                          </div>
                          <p>{row.model || row.job_type || 'Model not recorded.'}</p>
                          <small>{row.renter_name || `Renter #${row.renter_id || 'unknown'}`} · {row.provider_name || `Provider #${row.provider_id || 'unknown'}`} · {formatHalala(row.actual_cost_halala || row.cost_halala)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="support-card">
                  <div className="mission-panel-head">
                    <span><Bi en="Payment context" ar="سياق الدفع" /></span>
                    <Link href="/admin/payments" prefetch={false}><Bi en="Open payments" ar="افتح المدفوعات" /></Link>
                  </div>
                  {paymentIssueRows.length === 0 ? (
                    <p className="support-empty"><Bi en="No failed, pending, initiated, or refunded payments in the latest sample." ar="لا توجد مدفوعات فاشلة أو معلقة أو مبدوءة أو مستردة في العينة الأخيرة." /></p>
                  ) : (
                    <div className="support-row-list">
                      {paymentIssueRows.map((row) => (
                        <div className="support-row" key={row.payment_id || row.id || 'payment'}>
                          <div className="support-row-top">
                            <strong>{row.renter_name || row.renter_email || `Renter #${row.renter_id || 'unknown'}`}</strong>
                            <span className={`support-category ${String(row.status || '').toLowerCase()}`}>{row.status || 'unknown'}</span>
                          </div>
                          <p>{row.description || row.source_type || 'No payment description recorded.'}</p>
                          <small>{formatSar(row.amount_sar)} · payment {shortId(row.payment_id)} · {formatDate(row.created_at)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <p className="support-policy">
                <Bi
                  en="v2 support is read-only. agents may summarize contacts and correlate renter, job, and payment evidence; suspensions, credits, balance edits, job cancel/requeue, refunds, and key rotation stay in verified consoles until support actions have audit and approval envelopes."
                  ar="دعم v2 للقراءة فقط. يمكن للوكلاء تلخيص طلبات التواصل وربط أدلة المستأجر والمهام والدفع؛ تبقى الإيقافات والائتمانات وتعديلات الرصيد وإلغاء/إعادة تشغيل المهام والاستردادات وتدوير المفاتيح في اللوحات المتحققة حتى يكون لإجراءات الدعم غلاف موافقة وتدقيق."
                />
              </p>
            </section>

            <section className="mission-control" id="mission" aria-label="Mission control and guarded actions">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Team operating layer" ar="طبقة تشغيل الفريق" /></p>
                  <h2><Bi en="Mission control" ar="مركز المهمة" /></h2>
                </div>
                <span><Bi en="guarded actions" ar="إجراءات محروسة" /></span>
              </div>

              <div className="mission-summary-grid">
                <div>
                  <span><Bi en="open work" ar="عمل مفتوح" /></span>
                  <strong>{numFmt.format(openMissionWork || missionTasks.length)}</strong>
                </div>
                <div className={missionBlockedCount > 0 ? 'warn' : ''}>
                  <span><Bi en="blocked" ar="محظور" /></span>
                  <strong>{numFmt.format(missionBlockedCount)}</strong>
                </div>
                <div>
                  <span><Bi en="today / review" ar="اليوم / مراجعة" /></span>
                  <strong>{numFmt.format(missionTodayCount)}</strong>
                </div>
                <div>
                  <span><Bi en="shipped 24h" ar="شُحن خلال 24 ساعة" /></span>
                  <strong>{numFmt.format(missionShippedCount)}</strong>
                </div>
                <div>
                  <span><Bi en="active goals" ar="أهداف نشطة" /></span>
                  <strong>{numFmt.format(activeMissionGoals.length)}</strong>
                </div>
                <div>
                  <span><Bi en="human / agent roster" ar="قائمة البشر / الوكلاء" /></span>
                  <strong>{numFmt.format(humanAssignees.length)} / {numFmt.format(agentAssignees.length)}</strong>
                </div>
              </div>

              <div className="mission-layout">
                <article className="mission-roster">
                  <div className="mission-panel-head">
                    <span><Bi en="Ownership" ar="الملكية" /></span>
                    <Link href="/mission" prefetch={false}><Bi en="Open full board" ar="افتح اللوحة كاملة" /></Link>
                  </div>
                  {missionRosterPreview.length === 0 ? (
                    <p className="mission-empty"><Bi en="No mission assignees returned yet." ar="لم تعد قائمة مسؤولين للمهمة بعد." /></p>
                  ) : (
                    <div className="mission-roster-list">
                      {missionRosterPreview.map((assignee) => {
                        const assigned = missionTasks.filter((task) => task.assignee_id === assignee.id)
                        return (
                          <div key={assignee.id || assignee.display_name || 'unknown'}>
                            <span className={assignee.kind === 'agent' ? 'agent' : 'human'}>{assignee.kind === 'agent' ? 'AG' : 'HM'}</span>
                            <strong>{assignee.display_name || assignee.id || 'Unassigned'}</strong>
                            <small>{assigned.length} open</small>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </article>

                <article className="mission-queue">
                  <div className="mission-panel-head">
                    <span><Bi en="Task ownership" ar="ملكية المهام" /></span>
                    <em><Bi en="proposal source" ar="مصدر الاقتراح" /></em>
                  </div>
                  {missionTaskPreview.length === 0 ? (
                    <p className="mission-empty"><Bi en="No open mission tasks are currently assigned." ar="لا توجد مهام مهمة مفتوحة حالياً." /></p>
                  ) : (
                    <div className="mission-task-list">
                      {missionTaskPreview.map((task) => (
                        <div key={task.id || task.title || 'task'} className={task.status === 'blocked' ? 'blocked' : undefined}>
                          <div>
                            <strong>{task.title || 'Untitled task'}</strong>
                            <p>{task.blocked_reason || task.goal_title || task.source || 'No blocker recorded.'}</p>
                          </div>
                          <div className="mission-task-meta">
                            <span>{String(task.priority || 'p2').toUpperCase()}</span>
                            <span>{missionStatusLabel(task.status)}</span>
                            <span>{task.assignee_name || 'unassigned'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="mission-goals">
                  <div className="mission-panel-head">
                    <span><Bi en="Active goals" ar="الأهداف النشطة" /></span>
                    <em><Bi en="launch alignment" ar="اتساق الإطلاق" /></em>
                  </div>
                  {activeMissionGoals.length === 0 ? (
                    <p className="mission-empty"><Bi en="No active goals returned yet." ar="لم تعد أهداف نشطة بعد." /></p>
                  ) : (
                    <div className="mission-goal-list">
                      {activeMissionGoals.slice(0, 4).map((goal) => (
                        <div key={goal.id || goal.title || 'goal'}>
                          <strong>{goal.title || 'Untitled goal'}</strong>
                          <span>{missionGoalProgress(goal)}</span>
                          <small>{toNumber(goal.task_done)}/{toNumber(goal.task_count)} tasks · {goal.owner_name || 'unowned'}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <div className="mission-action-desk">
                <div className="mission-panel-head">
                  <span><Bi en="Action desk" ar="مكتب الإجراءات" /></span>
                  <em><Bi en={missionStrictWrites ? 'strict write gate' : 'legacy write gate'} ar={missionStrictWrites ? 'بوابة كتابة صارمة' : 'بوابة كتابة قديمة'} /></em>
                </div>

                {selectedMissionTask ? (
                  <>
                    <div className="mission-action-grid">
                      <label>
                        <span><Bi en="Task" ar="المهمة" /></span>
                        <select
                          value={selectedMissionTask.id || ''}
                          onChange={(event) => {
                            setSelectedMissionTaskId(event.target.value)
                            setMissionActionMessage(null)
                          }}
                        >
                          {missionTaskPreview.map((task) => (
                            <option key={task.id || task.title || 'task'} value={task.id || ''}>
                              {task.title || 'Untitled task'}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span><Bi en="Status" ar="الحالة" /></span>
                        <select
                          value={missionTargetStatus}
                          onChange={(event) => setMissionTargetStatus(event.target.value as MissionTaskStatus)}
                        >
                          {TASK_STATUSES.map((status) => (
                            <option key={status} value={status}>{missionStatusLabel(status)}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span><Bi en="Assignee" ar="المسؤول" /></span>
                        <select
                          value={missionTargetAssignee}
                          onChange={(event) => setMissionTargetAssignee(event.target.value)}
                        >
                          <option value="">{lang === 'ar' ? 'اختر مسؤولاً' : 'Choose assignee'}</option>
                          {missionAssignees.map((assignee) => (
                            <option key={assignee.id || assignee.display_name || 'assignee'} value={assignee.id || ''}>
                              {assignee.display_name || assignee.id || 'Unassigned'}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="mission-action-note">
                      <span><Bi en="Evidence note" ar="ملاحظة الدليل" /></span>
                      <textarea
                        value={missionActionNote}
                        onChange={(event) => setMissionActionNote(event.target.value)}
                        placeholder={lang === 'ar' ? 'مطلوب للإغلاق وإعادة الإسناد، ويُحفظ في سجل المهمة.' : 'Required for close and reassign; stored in task history.'}
                        rows={4}
                      />
                    </label>

                    {missionActionMessage && (
                      <p className={`mission-action-message ${missionActionMessage.kind}`}>{missionActionMessage.text}</p>
                    )}

                    <div className="mission-action-buttons">
                      <button
                        type="button"
                        disabled={missionAction !== null || !selectedMissionTask.id}
                        onClick={() => void submitMissionStatus()}
                      >
                        <Bi en={missionAction === 'status' ? 'Moving task' : 'Move status'} ar={missionAction === 'status' ? 'جارٍ نقل المهمة' : 'انقل الحالة'} />
                      </button>
                      <button
                        type="button"
                        disabled={missionAction !== null || !selectedMissionTask.id || !missionTargetAssignee || missionActionNote.trim().length < 8}
                        onClick={() => void submitMissionReassign()}
                      >
                        <Bi en={missionAction === 'reassign' ? 'Reassigning' : 'Reassign'} ar={missionAction === 'reassign' ? 'جارٍ إعادة الإسناد' : 'أعد الإسناد'} />
                      </button>
                      <button
                        type="button"
                        disabled={missionAction !== null || !selectedMissionTask.id || missionActionNote.trim().length < 8}
                        onClick={() => void submitMissionComment()}
                      >
                        <Bi en={missionAction === 'comment' ? 'Recording' : 'Add note'} ar={missionAction === 'comment' ? 'جارٍ التسجيل' : 'أضف ملاحظة'} />
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="mission-empty"><Bi en="No mission task is available for action yet." ar="لا توجد مهمة متاحة للإجراء بعد." /></p>
                )}
              </div>

              <p className="mission-policy">
                <Bi
                  en="Mission actions in v2 use the admin token and the same guarded backend routes as /mission. Delete and create controls stay out of this surface."
                  ar="تستخدم إجراءات المهمة في v2 مفتاح الإدارة ونفس مسارات الخلفية المحروسة في /mission. تبقى أدوات الحذف والإنشاء خارج هذه الواجهة."
                />
              </p>
            </section>

            <section className="access-governance" id="access" aria-label="Access governance">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Role and agent gates" ar="بوابات الأدوار والوكلاء" /></p>
                  <h2><Bi en="Access governance" ar="حوكمة الوصول" /></h2>
                </div>
                <span className={missionStrictWrites ? 'ready' : 'watch'}>
                  <Bi en={missionStrictWrites ? 'strict writes' : 'legacy writes'} ar={missionStrictWrites ? 'كتابة صارمة' : 'كتابة قديمة'} />
                </span>
              </div>

              <div className="access-grid">
                <article className="access-card">
                  <span><Bi en="Admin surface" ar="سطح الإدارة" /></span>
                  <strong><Bi en={accessPolicy?.admin_surface?.token_configured ? 'token configured' : 'token missing'} ar={accessPolicy?.admin_surface?.token_configured ? 'المفتاح موجود' : 'المفتاح مفقود'} /></strong>
                  <p>{accessPolicy?.admin_surface?.auth_contract || 'x-admin-token or bearer token via requireAdminRbac'}</p>
                  <small>{accessPolicy?.admin_surface?.ip_allowlist_configured ? 'IP allowlist configured' : 'No admin IP allowlist reported'}</small>
                </article>
                <article className={`access-card ${missionStrictWrites ? 'ready' : 'watch'}`}>
                  <span><Bi en="Mission writes" ar="كتابة المهمة" /></span>
                  <strong>{missionWritePolicy}</strong>
                  <p>{accessPolicy?.mission_surface?.current_risk || 'Mission write policy unavailable.'}</p>
                  <small>{accessPolicy?.mission_surface?.mission_agent_key_configured ? 'mission agent key configured' : 'mission agent key not configured'}</small>
                </article>
                <article className="access-card">
                  <span><Bi en="Guarded agent writes" ar="كتابة الوكلاء المحروسة" /></span>
                  <strong>{agentWriteState}</strong>
                  <p>{accessPolicy?.mission_surface?.next_gate || 'Define approval and audit gates before agent writes.'}</p>
                  <small><Bi en="limited v2 mission actions exposed" ar="إجراءات مهمة محدودة في v2" /></small>
                </article>
              </div>

              <div className="access-ladder">
                {(accessPolicy?.agent_permissions || []).map((permission) => (
                  <div key={permission.level || permission.state || 'permission'}>
                    <span>{permission.level || 'permission'}</span>
                    <strong>{permission.state || 'unknown'}</strong>
                    <p>{permission.description || 'No policy description returned.'}</p>
                  </div>
                ))}
                {(!accessPolicy?.agent_permissions || accessPolicy.agent_permissions.length === 0) && (
                  <div>
                    <span><Bi en="policy unavailable" ar="السياسة غير متوفرة" /></span>
                    <strong><Bi en="read-only fallback" ar="احتياطي قراءة فقط" /></strong>
                    <p><Bi en="The admin dashboard stays read-only for agents until the access policy endpoint responds." ar="تبقى لوحة الإدارة للقراءة فقط للوكلاء حتى تعود نقطة سياسة الوصول." /></p>
                  </div>
                )}
              </div>
            </section>

            <section className="notification-posture" id="notifications" aria-label="Notification routing">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Human and agent alerts" ar="تنبيهات البشر والوكلاء" /></p>
                  <h2><Bi en="Notification routing" ar="توجيه التنبيهات" /></h2>
                </div>
                <span className={activeNotificationChannels > 0 ? 'ready' : 'watch'}>
                  <Bi en={activeNotificationChannels > 0 ? 'channels live' : 'channels quiet'} ar={activeNotificationChannels > 0 ? 'القنوات نشطة' : 'القنوات هادئة'} />
                </span>
              </div>

              <div className="notification-grid">
                <article className={`notification-card ${activeNotificationChannels > 0 ? 'ready' : 'watch'}`}>
                  <span><Bi en="Routing state" ar="حالة التوجيه" /></span>
                  <strong>{activeNotificationChannels}/{configuredNotificationChannels || notificationChannels.length || 0}</strong>
                  <p><Bi en="Active channels only count when notifications are enabled and the channel has the required credentials." ar="تُحسب القنوات النشطة فقط عندما تكون التنبيهات مفعلة وتملك القناة بيانات الاعتماد المطلوبة." /></p>
                  <small>{notificationPosture?.enabled ? 'notification service enabled' : 'notification service disabled'}</small>
                </article>

                <article className="notification-card">
                  <span><Bi en="Agent notify policy" ar="سياسة تنبيه الوكيل" /></span>
                  <strong>{notificationNotifyState}</strong>
                  <p>{notificationPosture?.agent_policy?.next_gate || 'Define alert channels and event allowlists before agents create notifications.'}</p>
                  <small>{notificationPosture?.agent_policy?.write_policy || 'admin_only_test_send'}</small>
                </article>

                {notificationChannels.map((channel) => (
                  <article key={channel.id || channel.label || 'channel'} className={`notification-card ${channel.active ? 'ready' : channel.configured ? 'watch' : ''}`}>
                    <span>{channel.label || channel.id || 'channel'}</span>
                    <strong>{channel.active ? 'active' : channel.configured ? 'configured' : 'missing'}</strong>
                    <p>{channel.destination || 'No destination reported.'}</p>
                    <small>{channel.secret_exposed ? 'secret exposure reported' : 'redacted destination only'}</small>
                  </article>
                ))}

                {notificationChannels.length === 0 && (
                  <article className="notification-card watch">
                    <span><Bi en="Channels" ar="القنوات" /></span>
                    <strong><Bi en="unavailable" ar="غير متوفرة" /></strong>
                    <p><Bi en="The posture endpoint did not return channel data, so agents should treat notifications as disabled." ar="لم تعد نقطة الحالة بيانات القنوات، لذلك يجب على الوكلاء اعتبار التنبيهات معطلة." /></p>
                    <small><Bi en="read-only fallback" ar="احتياطي قراءة فقط" /></small>
                  </article>
                )}
              </div>

              <p className="notification-policy">
                <Bi
                  en="v2 admin shows notification posture only. Test sends and channel edits stay in the current admin console until event allowlists, approval notes, and audit envelopes are explicit."
                  ar="تعرض إدارة v2 حالة التنبيهات فقط. تبقى رسائل الاختبار وتعديل القنوات في لوحة الإدارة الحالية حتى تصبح قوائم الأحداث وملاحظات الموافقة وأغلفة التدقيق واضحة."
                />
              </p>
            </section>

            <section className="audit-trail" id="audit" aria-label="Recent admin audit trail">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Accountability layer" ar="طبقة المساءلة" /></p>
                  <h2><Bi en="Recent audit trail" ar="سجل التدقيق الحديث" /></h2>
                </div>
                <Link href="/admin/security" prefetch={false}>
                  <Bi en="Full log" ar="السجل الكامل" />
                </Link>
              </div>

              <div className="audit-list">
                {adminAuditEntries.slice(0, 8).map((entry, index) => (
                  <article key={entry.id || `${entry.action || 'audit'}-${index}`} className="audit-entry">
                    <div>
                      <span>{entry.action || 'admin_event'}</span>
                      <strong>{entry.target_type || 'system'}{entry.target_id != null ? ` #${entry.target_id}` : ''}</strong>
                    </div>
                    <p>{entry.details || 'No audit detail recorded.'}</p>
                    <small>{formatDate(entry.timestamp)} · {entry.admin_user_id || 'admin token'}</small>
                  </article>
                ))}

                {adminAuditEntries.length === 0 && (
                  <article className="audit-entry empty">
                    <div>
                      <span><Bi en="Audit trail" ar="سجل التدقيق" /></span>
                      <strong><Bi en="No recent entries" ar="لا توجد إدخالات حديثة" /></strong>
                    </div>
                    <p><Bi en="When admins approve providers, edit notification channels, or perform guarded actions, the latest entries appear here." ar="عندما يوافق المسؤولون على المزوّدين أو يعدّلون قنوات التنبيه أو ينفذون إجراءات محروسة، تظهر أحدث الإدخالات هنا." /></p>
                    <small><Bi en="read-only evidence" ar="دليل قراءة فقط" /></small>
                  </article>
                )}
              </div>
            </section>

            <section className="incident-command" id="incidents" aria-label="Incident command">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Ops timeline" ar="الخط الزمني للعمليات" /></p>
                  <h2><Bi en="Incident command" ar="قيادة الحوادث" /></h2>
                </div>
                <span className={incidentCommandHasCritical ? 'critical' : 'ready'}>
                  <Bi en={incidentCommandHasCritical ? 'active review' : 'steady'} ar={incidentCommandHasCritical ? 'مراجعة نشطة' : 'مستقر'} />
                </span>
              </div>

              <div className="incident-summary-grid">
                <div className={incidentCriticalCount > 0 ? 'critical' : ''}>
                  <span><Bi en="timeline" ar="الخط الزمني" /></span>
                  <strong>{numFmt.format(incidentMergedCount)}</strong>
                  <small><Bi en={`${daemonIncidentCount} daemon · ${auditIncidentCount} audit · ${statusIncidentCount} status`} ar={`${daemonIncidentCount} خادم · ${auditIncidentCount} تدقيق · ${statusIncidentCount} حالة`} /></small>
                </div>
                <div className={errorCriticalCount > 0 ? 'critical' : recentErrors > 0 ? 'watch' : ''}>
                  <span><Bi en="recent errors" ar="أخطاء حديثة" /></span>
                  <strong>{numFmt.format(recentErrors)}</strong>
                  <small><Bi en="daemon and job error feed" ar="تغذية أخطاء الخادم والمهام" /></small>
                </div>
                <div className={controlCriticalCount > 0 ? 'critical' : signalCount > 0 ? 'watch' : ''}>
                  <span><Bi en="control signals" ar="إشارات التحكم" /></span>
                  <strong>{numFmt.format(signalCount)}</strong>
                  <small><Bi en={`${controlCriticalCount} critical`} ar={`${controlCriticalCount} حرجة`} /></small>
                </div>
                <div>
                  <span><Bi en="mode" ar="الوضع" /></span>
                  <strong>{controlPlaneMode}</strong>
                  <small><Bi en="read-only signal posture" ar="حالة إشارات للقراءة فقط" /></small>
                </div>
              </div>

              <div className="incident-command-grid">
                <article className="incident-timeline-panel">
                  <div className="mission-panel-head">
                    <span><Bi en="Merged incident feed" ar="تغذية الحوادث المدمجة" /></span>
                    <Link href="/admin/incidents" prefetch={false}><Bi en="Open incidents" ar="افتح الحوادث" /></Link>
                  </div>

                  {incidentTimeline.length === 0 ? (
                    <p className="incident-empty"><Bi en="No incident timeline rows returned for the last 24 hours." ar="لم تعد صفوف حوادث خلال آخر 24 ساعة." /></p>
                  ) : (
                    <div className="incident-row-list">
                      {incidentTimeline.map((item, index) => {
                        const severity = incidentSeverity(item.severity)
                        const rowKey = item.ref_id || `${item.source || 'incident'}-${item.timestamp || index}`
                        return (
                          <article className={`incident-row ${severity}`} key={rowKey}>
                            <div className="incident-row-top">
                              <div>
                                <span>{item.source || 'incident'} · {item.severity || 'info'}</span>
                                <strong>{item.title || 'Incident event'}</strong>
                              </div>
                              <small>{formatDate(item.timestamp)}</small>
                            </div>
                            <p>{item.details || item.target || 'No incident details returned.'}</p>
                            <em>{item.actor || 'system'}{item.provider_id ? ` · provider #${item.provider_id}` : ''}</em>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </article>

                <article className="incident-error-panel">
                  <div className="mission-panel-head">
                    <span><Bi en="Recent errors" ar="الأخطاء الحديثة" /></span>
                    <Link href="/admin/incidents" prefetch={false}><Bi en="Open error feed" ar="افتح تغذية الأخطاء" /></Link>
                  </div>

                  {errorEvents.length === 0 ? (
                    <p className="incident-empty"><Bi en="No recent errors returned by the admin error feed." ar="لم تعد تغذية أخطاء الإدارة أخطاء حديثة." /></p>
                  ) : (
                    <div className="incident-row-list">
                      {errorEvents.map((event, index) => {
                        const severity = incidentSeverity(event.severity)
                        const rowKey = String(event.id || `${event.source || 'error'}-${event.created_at || index}`)
                        return (
                          <article className={`incident-row ${severity}`} key={rowKey}>
                            <div className="incident-row-top">
                              <div>
                                <span>{event.source || 'error'} · {event.severity || 'unknown'}</span>
                                <strong>{event.hostname || event.os_info || 'unknown host'}</strong>
                              </div>
                              <small>{formatDate(event.created_at)}</small>
                            </div>
                            <p>{event.message || event.details || 'No error message returned.'}</p>
                            <em>{event.daemon_version || 'daemon version unknown'}</em>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </article>

                <article className="control-plane-panel">
                  <div className="mission-panel-head">
                    <span><Bi en="Control-plane signals" ar="إشارات لوحة التحكم" /></span>
                    <Link href="/admin/fleet" prefetch={false}><Bi en="Open fleet" ar="افتح الأسطول" /></Link>
                  </div>

                  {controlSignals.length === 0 ? (
                    <p className="incident-empty"><Bi en="No control-plane demand or warm-pool signals returned." ar="لم تعد إشارات طلب أو تسخين من لوحة التحكم." /></p>
                  ) : (
                    <div className="control-signal-list">
                      {controlSignals.map((signal, index) => {
                        const severity = controlSignalSeverity(signal)
                        const rowKey = String(signal.id || `${signal.pricing_class || 'signal'}-${signal.created_at || index}`)
                        return (
                          <article className={`control-signal ${severity}`} key={rowKey}>
                            <div className="incident-row-top">
                              <div>
                                <span>{signal.pricing_class || 'pricing'} · {signal.capacity_class || signal.compute_type || 'capacity'}</span>
                                <strong>{signal.recommended_action || 'observe'}</strong>
                              </div>
                              <small>{formatDate(signal.created_at)}</small>
                            </div>
                            <div className="control-signal-facts">
                              <span>{toNumber(signal.queued_total)} queued</span>
                              <span>{toNumber(signal.active_total)} active</span>
                              <span>{toNumber(signal.providers_warm)} warm</span>
                              <span>{toNumber(signal.recommended_warm_pool)} target</span>
                            </div>
                            <p>{signal.reason || 'No control-plane recommendation reason returned.'}</p>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </article>
              </div>

              <p className="incident-policy">
                <Bi
                  en="v2 incident command is read-only. Control-plane snapshots, prewarm runs, run-cycle triggers, and daemon repair stay in verified consoles until each action has explicit owner, approval, audit, and rollback rules."
                  ar="قيادة حوادث v2 للقراءة فقط. تبقى لقطات لوحة التحكم وتشغيل التسخين ودورات التشغيل وإصلاح الخادم في اللوحات المتحققة حتى يملك كل إجراء مالكاً وموافقة وتدقيقاً وقواعد رجوع صريحة."
                />
              </p>
            </section>

            <section className="admin-two-col">
              <div className="ops-panel" id="inbox">
                <div className="section-head">
                  <div>
                    <p className="admin-kicker"><Bi en="Unified work queue" ar="طابور عمل موحّد" /></p>
                    <h2><Bi en="Ops inbox" ar="صندوق العمليات" /></h2>
                  </div>
                  <span>{tasks.length}</span>
                </div>
                <div className="task-list">
                  {tasks.map((task) => {
                    const label = agentLabel(task.agentMode)
                    return (
                      <article key={task.id} className={`task ${task.severity}`}>
                        <div className="task-main">
                          <div className="task-title-row">
                            <span className="severity-dot" />
                            <h3><Bi en={task.titleEn} ar={task.titleAr} /></h3>
                          </div>
                          <p><Bi en={task.detailEn} ar={task.detailAr} /></p>
                          <div className="task-meta">
                            <span>{task.owner}</span>
                            <span>{task.source}</span>
                            <span><Bi en={label.en} ar={label.ar} /></span>
                          </div>
                        </div>
                        <Link href={task.href} className="task-action" prefetch={isLegacyAdminHref(task.href) ? false : undefined}>
                          <Bi en="Open" ar="فتح" />
                        </Link>
                      </article>
                    )
                  })}
                </div>
              </div>

              <div className="agent-panel" id="agents">
                <div className="section-head">
                  <div>
                    <p className="admin-kicker"><Bi en="Humans and agents" ar="البشر والوكلاء" /></p>
                    <h2><Bi en="Permission ladder" ar="سُلّم الصلاحيات" /></h2>
                  </div>
                </div>
                <div className="agent-ladder">
                  <div>
                    <b>01</b>
                    <strong><Bi en="Read" ar="قراءة" /></strong>
                    <p><Bi en="Inspect entities, incidents, balances, and health." ar="فحص الكيانات والحوادث والأرصدة والصحة." /></p>
                  </div>
                  <div>
                    <b>02</b>
                    <strong><Bi en="Notify" ar="تنبيه" /></strong>
                    <p><Bi en="Create alerts and summarize what changed." ar="إنشاء تنبيهات وتلخيص ما تغيّر." /></p>
                  </div>
                  <div>
                    <b>03</b>
                    <strong><Bi en="Propose" ar="اقتراح" /></strong>
                    <p><Bi en="Draft actions with evidence, risk, and rollback notes." ar="صياغة إجراءات مع دليل ومخاطر وملاحظات رجوع." /></p>
                  </div>
                  <div>
                    <b>04</b>
                    <strong><Bi en="Guarded write" ar="كتابة محروسة" /></strong>
                    <p><Bi en="Low-risk writes only by policy; money and fleet changes need human approval." ar="كتابة منخفضة المخاطر فقط حسب السياسة؛ المال والأسطول بموافقة بشرية." /></p>
                  </div>
                </div>
                <div className="agent-note">
                  <span><Bi en="Task envelope" ar="غلاف المهمة" /></span>
                  <p><Bi en="Every future agent action should carry owner, evidence, proposed change, permission class, and audit outcome." ar="كل إجراء مستقبلي للوكيل يجب أن يحمل المالك والدليل والتغيير المقترح وفئة الصلاحية ونتيجة التدقيق." /></p>
                </div>
              </div>
            </section>

            <section className="lane-grid" aria-label="Operational lanes">
              <article className="lane-panel fleet-lane">
                <div className="section-head">
                  <div>
                    <p className="admin-kicker"><Bi en="Fleet truth" ar="حقيقة الأسطول" /></p>
                    <h2><Bi en="Serving capacity" ar="سعة الخدمة" /></h2>
                  </div>
                </div>
                <div className="lane-stats">
                  <div>
                    <span><Bi en="usable online" ar="قابل للخدمة" /></span>
                    <strong>{numFmt.format(usableOnline)}</strong>
                  </div>
                  <div>
                    <span><Bi en="verified online" ar="متحقق نشط" /></span>
                    <strong>{numFmt.format(verifiedOnline)}</strong>
                  </div>
                  <div>
                    <span><Bi en="fleet alerts" ar="تنبيهات الأسطول" /></span>
                    <strong>{numFmt.format(fleetAlertCount)}</strong>
                  </div>
                </div>
                <p className="lane-note">
                  <Bi
                    en="This panel follows endpoint reachability and earned-online probes. Heartbeat-only nodes do not count as serving capacity."
                    ar="تتبع هذه اللوحة الوصول للنقاط وفحوصات الخدمة المتحققة. النبض وحده لا يُحسب كسعة خدمة."
                  />
                </p>
                <Link href="/admin/fleet" prefetch={false} className="lane-action"><Bi en="Open fleet console" ar="افتح لوحة الأسطول" /></Link>
              </article>

              <article className="lane-panel finance-lane">
                <div className="section-head">
                  <div>
                    <p className="admin-kicker"><Bi en="Finance guardrails" ar="حواجز المالية" /></p>
                    <h2><Bi en="Money state" ar="حالة الأموال" /></h2>
                  </div>
                </div>
                <div className="lane-list">
                  <div><span><Bi en="refunds + payouts" ar="استردادات + دفعات" /></span><strong>{countByStatus(audit?.summary?.refund_requests, ['pending', 'processing']) + countByStatus(audit?.summary?.payouts, ['pending', 'processing'])}</strong></div>
                  <div><span><Bi en="reconciliation issues" ar="مشاكل المطابقة" /></span><strong>{reconciliationIssues}</strong></div>
                  <div><span><Bi en="billed in 7d" ar="فوترة 7 أيام" /></span><strong>{formatHalala(reconciliation?.summary?.total_billed_halala)}</strong></div>
                </div>
                <p className="lane-note">
                  <Bi
                    en="Agents can summarize evidence, but refunds, payouts, balance edits, and provider payments stay human-approved."
                    ar="يمكن للوكلاء تلخيص الأدلة، لكن الاستردادات والدفعات وتعديلات الرصيد ومدفوعات المزوّدين بموافقة بشرية."
                  />
                </p>
                <Link href="/admin/payments" prefetch={false} className="lane-action"><Bi en="Open payments" ar="افتح المدفوعات" /></Link>
              </article>

              <article className="lane-panel incident-lane">
                <div className="section-head">
                  <div>
                    <p className="admin-kicker"><Bi en="Signals" ar="الإشارات" /></p>
                    <h2><Bi en="Incidents and control plane" ar="الحوادث ولوحة التحكم" /></h2>
                  </div>
                </div>
                <div className="lane-list">
                  <div><span><Bi en="recent errors" ar="أخطاء حديثة" /></span><strong>{recentErrors}</strong></div>
                  <div><span><Bi en="control signals" ar="إشارات التحكم" /></span><strong>{signalCount}</strong></div>
                  <div><span><Bi en="provider approvals" ar="موافقات المزوّدين" /></span><strong>{approvalPending}</strong></div>
                </div>
                <p className="lane-note">
                  <Bi
                    en="This is the future agent inbox source: evidence first, proposed action second, guarded write last."
                    ar="هذا مصدر صندوق الوكلاء القادم: الدليل أولاً، الإجراء المقترح ثانياً، والكتابة المحروسة أخيراً."
                  />
                </p>
                <Link href="/admin/incidents" prefetch={false} className="lane-action"><Bi en="Open incidents" ar="افتح الحوادث" /></Link>
              </article>
            </section>

            <section className="workflow-strip" id="workflows">
              <div className="section-head">
                <div>
                  <p className="admin-kicker"><Bi en="Operating model" ar="نموذج التشغيل" /></p>
                  <h2><Bi en="Workflow health" ar="صحة التدفقات" /></h2>
                </div>
              </div>
              <div className="workflow-grid">
                {workflows.map((item) => (
                  <article key={item.key} className={`workflow ${item.status}`}>
                    <div>
                      <span><Bi en={item.labelEn} ar={item.labelAr} /></span>
                      <strong>{item.value}</strong>
                    </div>
                    <p><Bi en={item.noteEn} ar={item.noteAr} /></p>
                  </article>
                ))}
              </div>
            </section>

            <section className="future-map">
              <div>
                <p className="admin-kicker"><Bi en="Next build layer" ar="طبقة البناء التالية" /></p>
                <h2><Bi en="What this interface is preparing for" ar="ما الذي تجهّزه هذه الواجهة" /></h2>
              </div>
              <div className="future-list">
                <span><Bi en="team roles" ar="أدوار الفريق" /></span>
                <span><Bi en="task ownership" ar="ملكية المهام" /></span>
                <span><Bi en="agent identities" ar="هويات الوكلاء" /></span>
                <span><Bi en="approval gates" ar="بوابات الموافقة" /></span>
                <span><Bi en="entity timelines" ar="جداول الكيانات" /></span>
                <span><Bi en="runbooks" ar="كتيبات التشغيل" /></span>
                <span><Bi en="incident summaries" ar="ملخصات الحوادث" /></span>
                <span><Bi en="access reviews" ar="مراجعات الوصول" /></span>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
