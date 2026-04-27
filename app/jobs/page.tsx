'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useLanguage } from '../lib/i18n';

interface Job {
  id: number;
  job_id: string;
  job_type: string;
  status: string;
  renter_id: number;
  provider_id: number;
  submitted_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_minutes: number;
  cost_halala: number;
  actual_cost_halala: number | null;
  error: string | null;
}

const statusClasses: Record<string, string> = {
  running: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
  queued: 'bg-sky-500/10 text-sky-300 border border-sky-500/30',
  pending: 'bg-sky-500/10 text-sky-300 border border-sky-500/30',
  completed: 'bg-dc1-surface-l3 text-dc1-text-secondary border border-dc1-border',
  failed: 'bg-red-500/10 text-red-300 border border-red-500/30',
  cancelled: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
};

const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m0 0l4 4m-4-4V5" />
  </svg>
);

const MarketplaceIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
);

const JobsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const BillingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m4 0h1M9 19h6a2 2 0 002-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

function getAdminToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null;
}

function trackLegacyJobsHandoff(event: string, payload: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  const detail = { event, source: 'legacy_jobs', ...payload };
  window.dispatchEvent(new CustomEvent('dc1_analytics', { detail }));
  const win = window as typeof window & {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  };
  if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push(detail);
  }
  if (typeof win.gtag === 'function') {
    win.gtag('event', event, payload);
  }
}

export default function JobsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [dataSource, setDataSource] = useState<'live' | 'fallback'>('fallback');
  const noticeTrackedRef = useRef(false);

  const navItems = [
    { label: t('nav.dashboard'), href: '/renter', icon: <HomeIcon /> },
    { label: t('nav.marketplace'), href: '/renter/marketplace', icon: <MarketplaceIcon /> },
    { label: t('nav.jobs'), href: '/renter/jobs', icon: <JobsIcon /> },
    { label: t('nav.billing'), href: '/renter/billing', icon: <BillingIcon /> },
  ];

  const statusLabel = (status: string): string => {
    const key = `jobs_legacy.status.${status}`;
    const translated = t(key);
    return translated === key ? t('jobs_legacy.status.unknown') : translated;
  };

  const timeAgo = (dateStr: string): string => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 0) return t('jobs_legacy.time.just_now');
    if (seconds < 60) return t('jobs_legacy.time.seconds_ago').replace('{count}', String(seconds));
    if (seconds < 3600) return t('jobs_legacy.time.minutes_ago').replace('{count}', String(Math.floor(seconds / 60)));
    if (seconds < 86400) return t('jobs_legacy.time.hours_ago').replace('{count}', String(Math.floor(seconds / 3600)));
    return t('jobs_legacy.time.days_ago').replace('{count}', String(Math.floor(seconds / 86400)));
  };

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs/active');
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();

      const allJobs = data.jobs || [];
      allJobs.sort(
        (a: Job, b: Job) =>
          new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      );

      setJobs(allJobs);
      setError(null);
      setDataSource('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('jobs_legacy.error_load'));
      setDataSource('fallback');
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [t]);

  const handleCanonicalClick = (target: string, actor: 'visitor' | 'admin' | 'renter') => {
    trackLegacyJobsHandoff('legacy_jobs_canonical_cta_clicked', { target, actor, route: '/jobs' });
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const renterKey = localStorage.getItem('dc1_renter_key') || sessionStorage.getItem('dc1_renter_key');
        const adminToken = getAdminToken();
        if (adminToken) {
          trackLegacyJobsHandoff('legacy_jobs_handoff_started', { target: '/admin/jobs', actor: 'admin' });
          trackLegacyJobsHandoff('legacy_jobs_handoff_completed', { target: '/admin/jobs', actor: 'admin' });
          router.replace('/admin/jobs');
          return;
        }
        if (renterKey) {
          trackLegacyJobsHandoff('legacy_jobs_handoff_started', { target: '/renter/jobs', actor: 'renter' });
          trackLegacyJobsHandoff('legacy_jobs_handoff_completed', { target: '/renter/jobs', actor: 'renter' });
          router.replace('/renter/jobs');
          return;
        }
      } catch (storageError) {
        trackLegacyJobsHandoff('legacy_jobs_handoff_failed', {
          reason: storageError instanceof Error ? storageError.message : 'storage_access_error',
        });
      }
    }

    if (!noticeTrackedRef.current) {
      trackLegacyJobsHandoff('legacy_jobs_notice_seen', { route: '/jobs', actor: 'visitor' });
      noticeTrackedRef.current = true;
    }

    fetchJobs();
    const interval = setInterval(fetchJobs, 15000);
    return () => clearInterval(interval);
  }, [fetchJobs, router]);

  useEffect(() => {
    if (jobs.length > 0 && !selectedId) {
      setSelectedId(jobs[0].id);
    }
  }, [jobs, selectedId]);

  const selectedJob = jobs.find((j) => j.id === selectedId);
  const runningCount = jobs.filter((j) => j.status === 'running').length;
  const queuedCount = jobs.filter((j) => j.status === 'queued' || j.status === 'pending').length;

  return (
    <DashboardLayout navItems={navItems} role="renter" userName={t('sidebar.renter_label')}>
      <div className="space-y-6">
        <div className="rounded-xl border border-dc1-amber/35 bg-dc1-amber/10 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dc1-amber mb-2">{t('jobs_legacy.notice.badge')}</p>
          <h2 className="text-lg font-semibold text-dc1-text-primary mb-1">{t('jobs_legacy.notice.title')}</h2>
          <p className="text-sm text-dc1-text-secondary mb-3">{t('jobs_legacy.notice.description')}</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/renter/jobs"
              onClick={() => handleCanonicalClick('/renter/jobs', 'visitor')}
              className="btn btn-primary min-h-[40px] px-4"
            >
              {t('jobs_legacy.notice.renter_cta')}
            </Link>
            <Link
              href="/admin/jobs"
              onClick={() => handleCanonicalClick('/admin/jobs', 'visitor')}
              className="btn btn-secondary min-h-[40px] px-4"
            >
              {t('jobs_legacy.notice.admin_cta')}
            </Link>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-dc1-text-primary">{t('jobs_legacy.title')}</h1>
            <p className="text-sm text-dc1-text-secondary mt-1">
              {t('jobs_legacy.summary')
                .replace('{running}', String(runningCount))
                .replace('{queued}', String(queuedCount))
                .replace('{total}', String(jobs.length))}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {dataSource === 'live' && (
              <span className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                {t('jobs_legacy.live')}
              </span>
            )}
            <Link href="/renter/playground?source=legacy_jobs_header_submit" className="btn btn-primary min-h-[40px] px-4">
              {t('jobs_legacy.submit_job')}
            </Link>
            <span className="text-xs text-dc1-text-muted">
              {t('jobs_legacy.refresh')}{' '}
              {lastRefresh.toLocaleTimeString()}
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            <span>{error}</span>
            <button onClick={fetchJobs} className="ml-3 underline hover:no-underline">
              {t('common.retry')}
            </button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[19rem_1fr] min-h-[32rem]">
          <section className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-3 space-y-2 overflow-auto">
            <h2 className="text-xs font-semibold text-dc1-text-muted uppercase tracking-wide mb-1">
              {t('jobs_legacy.active_jobs')} {!loading && `(${jobs.length})`}
            </h2>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse bg-dc1-surface-l2 rounded-md h-20" />
                ))}
              </div>
            ) : jobs.length > 0 ? (
              jobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedId(job.id)}
                  className={`w-full text-left p-3 rounded-md transition-colors border ${
                    selectedId === job.id
                      ? 'bg-dc1-amber/10 border-dc1-amber/35'
                      : 'bg-dc1-surface-l1 border-transparent hover:border-dc1-border-light hover:bg-dc1-surface-l2'
                  }`}
                >
                  <div className="text-sm font-semibold text-dc1-text-primary truncate mb-2">
                    {job.job_type} #{job.id}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`px-2 py-0.5 rounded-md ${statusClasses[job.status] || statusClasses.completed}`}>
                      {statusLabel(job.status)}
                    </span>
                  </div>
                  <div className="text-xs text-dc1-text-muted mt-2">
                    {t('jobs_legacy.provider_short').replace('{id}', String(job.provider_id))} · {timeAgo(job.submitted_at)}
                  </div>
                </button>
              ))
            ) : (
              <p className="text-sm text-dc1-text-secondary text-center py-10">
                {t('jobs_legacy.no_active_jobs')}{' '}
                <Link href="/renter/playground?source=legacy_jobs_empty_submit" className="text-dc1-amber hover:underline">
                  {t('jobs_legacy.submit_one')}
                </Link>
              </p>
            )}
          </section>

          <section className="rounded-xl border border-dc1-border bg-dc1-surface-l1 p-4 space-y-4">
            {selectedJob ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-dc1-text-primary">
                    {selectedJob.job_type} #{selectedJob.id}
                  </h2>
                  <span className={`px-2 py-0.5 rounded-md text-xs ${statusClasses[selectedJob.status] || statusClasses.completed}`}>
                    {statusLabel(selectedJob.status)}
                  </span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-lg bg-dc1-surface-l2 p-3">
                    <div className="text-xs text-dc1-text-muted">{t('jobs_legacy.job_id')}</div>
                    <div className="text-sm font-mono text-dc1-text-primary">{selectedJob.job_id || selectedJob.id}</div>
                  </div>
                  <div className="rounded-lg bg-dc1-surface-l2 p-3">
                    <div className="text-xs text-dc1-text-muted">{t('jobs_legacy.provider')}</div>
                    <div className="text-sm text-dc1-text-primary">#{selectedJob.provider_id}</div>
                  </div>
                  <div className="rounded-lg bg-dc1-surface-l2 p-3">
                    <div className="text-xs text-dc1-text-muted">{t('jobs_legacy.cost')}</div>
                    <div className="text-sm font-semibold text-dc1-amber">
                      {((selectedJob.actual_cost_halala || selectedJob.cost_halala) / 100).toFixed(2)} {t('common.sar')}
                    </div>
                  </div>
                  <div className="rounded-lg bg-dc1-surface-l2 p-3">
                    <div className="text-xs text-dc1-text-muted">{t('jobs_legacy.duration')}</div>
                    <div className="text-sm text-dc1-text-primary">
                      {selectedJob.duration_minutes} {t('common.min')}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-dc1-surface-l2 p-4 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-dc1-text-muted">{t('jobs_legacy.timeline')}</div>
                  <div className="space-y-1 text-xs text-dc1-text-secondary">
                    <div className="flex gap-3">
                      <span className="w-24 text-dc1-text-muted">{t('jobs_legacy.submitted')}</span>
                      <span>{new Date(selectedJob.submitted_at).toLocaleString()}</span>
                    </div>
                    {selectedJob.started_at && (
                      <div className="flex gap-3">
                        <span className="w-24 text-dc1-text-muted">{t('jobs_legacy.started')}</span>
                        <span>{new Date(selectedJob.started_at).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedJob.completed_at && (
                      <div className="flex gap-3">
                        <span className="w-24 text-dc1-text-muted">{t('jobs_legacy.completed')}</span>
                        <span>{new Date(selectedJob.completed_at).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {selectedJob.error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <div className="text-xs font-semibold text-red-300 mb-1">{t('jobs_legacy.error')}</div>
                    <div className="text-sm text-dc1-text-primary font-mono">{selectedJob.error}</div>
                  </div>
                )}
              </>
            ) : (
              <div className="h-full min-h-[18rem] flex items-center justify-center text-center">
                <div>
                  <p className="text-sm text-dc1-text-secondary mb-3">
                    {jobs.length === 0 ? t('jobs_legacy.no_active_jobs') : t('jobs_legacy.select_job')}
                  </p>
                  <Link href="/renter/playground?source=legacy_jobs_panel_submit" className="btn btn-primary min-h-[40px] px-4">
                    {t('jobs_legacy.submit_job')}
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
