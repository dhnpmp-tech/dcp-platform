'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API_BASE = '/api';

const JOB_TYPES = [
  { value: 'llm-inference', label: 'LLM Inference', rate: 15 },
  { value: 'training', label: 'Training', rate: 25 },
  { value: 'rendering', label: 'Rendering', rate: 20 },
] as const;

interface MatchingGpu {
  providerId: string;
  gpuModel: string;
  vramGb: number;
  ratePerHourSar: number;
  available: boolean;
}

interface FormData {
  dockerImage: string;
  jobCodePath: string;
  jobType: string;
  requiredVramGb: number;
  gpuCount: number;
  estimatedHours: number;
  maxBudgetSar: number;
  providerId: string;
  taskSpec: string;
}

interface FormErrors {
  dockerImage?: string;
  requiredVramGb?: string;
  maxBudgetSar?: string;
  jobType?: string;
  auth?: string;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />;
}

export default function JobSubmitForm() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlProvider = searchParams.get('provider') || '';
  const urlGpu = searchParams.get('gpu') || '';
  const urlVram = searchParams.get('vram');

  // Renter auth state
  const [renterKey, setRenterKey] = useState('');
  const [renterName, setRenterName] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [form, setForm] = useState<FormData>({
    dockerImage: '',
    jobCodePath: '',
    jobType: 'llm-inference',
    requiredVramGb: urlVram ? parseInt(urlVram, 10) : 24,
    gpuCount: 1,
    estimatedHours: 1,
    maxBudgetSar: 50,
    providerId: urlProvider,
    taskSpec: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [matchingGpus, setMatchingGpus] = useState<MatchingGpu[]>([]);
  const [loadingGpus, setLoadingGpus] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showTaskSpec, setShowTaskSpec] = useState(false);

  // Bootstrap renter key from login flow storage.
  // /login persists in localStorage, while older submit flow used sessionStorage.
  useEffect(() => {
    const saved = localStorage.getItem('dc1_renter_key') || sessionStorage.getItem('dc1_renter_key');
    if (saved) {
      setRenterKey(saved);
      verifyRenterKey(saved);
    } else {
      setAuthChecking(false);
    }
  }, []);

  async function verifyRenterKey(key: string) {
    setAuthChecking(true);
    try {
      const res = await fetch(`${API_BASE}/renters/me`, { headers: { 'x-renter-key': key } });
      if (res.ok) {
        const data = await res.json();
        setRenterName(data.renter?.name || 'Renter');
        setRenterKey(key);
        localStorage.setItem('dc1_renter_key', key);
        sessionStorage.setItem('dc1_renter_key', key);
      } else {
        setRenterName(null);
        setRenterKey('');
        localStorage.removeItem('dc1_renter_key');
        sessionStorage.removeItem('dc1_renter_key');
      }
    } catch {
      // Network error — keep key but mark unverified
    } finally {
      setAuthChecking(false);
    }
  }

  function handleKeyLogin(e: React.FormEvent) {
    e.preventDefault();
    if (renterKey.trim()) {
      verifyRenterKey(renterKey.trim());
    }
  }

  // Pre-selected GPU from URL
  const [preselectedGpu] = useState<MatchingGpu | null>(() => {
    if (urlProvider && urlGpu) {
      return {
        providerId: urlProvider,
        gpuModel: urlGpu,
        vramGb: urlVram ? parseInt(urlVram, 10) : 0,
        ratePerHourSar: 0,
        available: true,
      };
    }
    return null;
  });

  const fetchMatchingGpus = useCallback(async () => {
    if (form.requiredVramGb < 8) return;
    setLoadingGpus(true);
    try {
      const res = await fetch(`${API_BASE}/renters/available-providers`);
      if (!res.ok) throw new Error('Failed to fetch GPUs');
      const data = await res.json();
      const fetched: MatchingGpu[] = (data.providers || [])
        .filter((p: { vram_gb: number }) => p.vram_gb >= form.requiredVramGb)
        .map((p: { id: string; gpu_model: string; vram_gb: number }) => ({
          providerId: String(p.id),
          gpuModel: p.gpu_model,
          vramGb: p.vram_gb,
          ratePerHourSar: 0.38,
          available: true,
        }));

      if (preselectedGpu && !fetched.some(g => g.providerId === preselectedGpu.providerId)) {
        fetched.unshift(preselectedGpu);
      }

      setMatchingGpus(fetched);
    } catch {
      if (preselectedGpu) {
        setMatchingGpus([preselectedGpu]);
      } else {
        setMatchingGpus([]);
      }
    } finally {
      setLoadingGpus(false);
    }
  }, [form.requiredVramGb, preselectedGpu]);

  useEffect(() => {
    const t = setTimeout(fetchMatchingGpus, 400);
    return () => clearTimeout(t);
  }, [fetchMatchingGpus]);

  const selectedRate = JOB_TYPES.find(j => j.value === form.jobType)?.rate || 10;
  const costEstimateHalala = selectedRate * form.estimatedHours * 60;
  const costEstimateSar = costEstimateHalala / 100;
  const legacyQuery = searchParams.toString();
  const canonicalPlaygroundHref = legacyQuery ? `/renter/playground?${legacyQuery}` : '/renter/playground';
  const showLegacyNotice = pathname === '/jobs/submit';

  function validate(): boolean {
    const e: FormErrors = {};
    if (!form.dockerImage.trim()) e.dockerImage = 'Docker image URL is required';
    if (form.requiredVramGb < 8) e.requiredVramGb = 'Minimum 8 GB VRAM required';
    if (form.maxBudgetSar <= 0) e.maxBudgetSar = 'Budget must be greater than 0';
    if (!form.jobType) e.jobType = 'Please select a job type';
    if (!renterName) e.auth = 'You must be logged in to submit jobs';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = {
        provider_id: form.providerId || undefined,
        job_type: form.jobType,
        duration_minutes: Math.round(form.estimatedHours * 60),
        gpu_requirements: {
          min_vram_gb: form.requiredVramGb,
          gpu_count: form.gpuCount,
        },
        dockerImage: form.dockerImage,
        jobCodePath: form.jobCodePath,
        maxBudgetSar: form.maxBudgetSar,
      };

      // Include task_spec if provided
      if (form.taskSpec.trim()) {
        try {
          body.task_spec = JSON.parse(form.taskSpec);
        } catch {
          body.task_spec = form.taskSpec;
        }
      }

      const res = await fetch(`${API_BASE}/jobs/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-renter-key': renterKey,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Submission failed');
      }
      const data = await res.json();
      if (data.success && data.job?.id) {
        router.push(`/renter/jobs/${data.job.id}`);
      } else if (data.success && data.job?.job_id) {
        router.push(`/renter`);
      } else {
        throw new Error('Unexpected response');
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#FFD700]/60 transition';

  // Auth gate — must log in first
  if (authChecking) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-[#FFD700]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }

  if (!renterName) {
    return (
      <div className="space-y-6">
        {showLegacyNotice && (
          <div className="rounded-xl border border-[#FFD700]/30 bg-[#FFD700]/10 p-4 text-sm text-white/80">
            This legacy submission form has moved. Use{' '}
            <Link href={canonicalPlaygroundHref} className="text-[#FFD700] hover:underline">
              /renter/playground
            </Link>{' '}
            for the canonical renter job flow.
          </div>
        )}
        <div className="bg-[#FFD700]/10 border border-[#FFD700]/20 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold mb-2">Authentication Required</h2>
          <p className="text-white/50 text-sm mb-4">
            Enter your DC1 renter API key to submit jobs.
          </p>
          <form onSubmit={handleKeyLogin} className="flex gap-2 max-w-md mx-auto">
            <input
              type="text"
              placeholder="dc1-renter-..."
              className={inputClass}
              value={renterKey}
              onChange={e => setRenterKey(e.target.value)}
            />
            <button
              type="submit"
              disabled={!renterKey.trim()}
              className="px-6 py-3 rounded-lg font-semibold text-[#1a1a1a] bg-[#FFD700] hover:bg-[#FFD700]/90 disabled:opacity-50 transition shrink-0"
            >
              Login
            </button>
          </form>
          <p className="text-white/30 text-xs mt-4">
            Don't have a key?{' '}
            <Link href="/renter/register" className="text-[#00A8E1] hover:underline">
              Register here
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {showLegacyNotice && (
        <div className="rounded-xl border border-[#FFD700]/30 bg-[#FFD700]/10 p-4 text-sm text-white/80">
          This legacy submission form has moved. Use{' '}
          <Link href={canonicalPlaygroundHref} className="text-[#FFD700] hover:underline">
            /renter/playground
          </Link>{' '}
          for the canonical renter job flow.
        </div>
      )}
      {/* Auth Banner */}
      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400"></div>
          <span className="text-sm text-white/60">Logged in as <span className="text-white font-medium">{renterName}</span></span>
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem('dc1_renter_key');
            sessionStorage.removeItem('dc1_renter_key');
            setRenterName(null);
            setRenterKey('');
          }}
          className="text-xs text-white/30 hover:text-white/60 transition"
        >
          Logout
        </button>
      </div>

      {/* Pre-selected Provider Banner */}
      {urlProvider && urlGpu && (
        <div className="bg-[#00A8E1]/10 border border-[#00A8E1]/30 rounded-xl p-4">
          <p className="text-[#00A8E1] text-sm font-medium">
            Pre-selected: <span className="text-white font-bold">{decodeURIComponent(urlGpu)}</span>
            {urlVram && <span className="text-white/60"> ({urlVram} GB VRAM)</span>}
          </p>
        </div>
      )}

      {/* Job Type */}
      <div>
        <label className="block text-sm text-white/60 mb-1.5">Job Type *</label>
        <select
          className={inputClass}
          value={form.jobType}
          onChange={e => setForm(f => ({ ...f, jobType: e.target.value }))}
        >
          {JOB_TYPES.map(jt => (
            <option key={jt.value} value={jt.value}>
              {jt.label} — {(jt.rate * 60 / 100).toFixed(2)} SAR/hr
            </option>
          ))}
        </select>
        {errors.jobType && <p className="text-red-400 text-xs mt-1">{errors.jobType}</p>}
      </div>

      {/* Docker Image */}
      <div>
        <label className="block text-sm text-white/60 mb-1.5">Docker Image URL *</label>
        <input
          type="text"
          placeholder="nvidia/cuda:12.0-runtime"
          className={inputClass}
          value={form.dockerImage}
          onChange={e => setForm(f => ({ ...f, dockerImage: e.target.value }))}
        />
        {errors.dockerImage && <p className="text-red-400 text-xs mt-1">{errors.dockerImage}</p>}
      </div>

      {/* Job Code Path */}
      <div>
        <label className="block text-sm text-white/60 mb-1.5">Job Code Path</label>
        <input
          type="text"
          placeholder="/workspace/train.py"
          className={inputClass}
          value={form.jobCodePath}
          onChange={e => setForm(f => ({ ...f, jobCodePath: e.target.value }))}
        />
      </div>

      {/* Task Spec (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowTaskSpec(!showTaskSpec)}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/60 transition"
        >
          <svg className={`w-3 h-3 transition-transform ${showTaskSpec ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          Advanced: Task Specification (JSON)
        </button>
        {showTaskSpec && (
          <div className="mt-2">
            <textarea
              rows={5}
              placeholder={'{\n  "benchmark": "matmul",\n  "matrix_size": 4096,\n  "iterations": 5\n}'}
              className={`${inputClass} font-mono text-sm`}
              value={form.taskSpec}
              onChange={e => setForm(f => ({ ...f, taskSpec: e.target.value }))}
            />
            <p className="text-white/30 text-xs mt-1">
              Optional JSON payload sent to the daemon. HMAC-signed for integrity.
            </p>
          </div>
        )}
      </div>

      {/* VRAM + GPU Count */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Required VRAM (GB) *</label>
          <input
            type="number"
            min={8}
            className={inputClass}
            value={form.requiredVramGb}
            onChange={e => setForm(f => ({ ...f, requiredVramGb: Number(e.target.value) }))}
          />
          {errors.requiredVramGb && <p className="text-red-400 text-xs mt-1">{errors.requiredVramGb}</p>}
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1.5">GPU Count</label>
          <input
            type="number"
            min={1}
            max={8}
            className={inputClass}
            value={form.gpuCount}
            onChange={e => setForm(f => ({ ...f, gpuCount: Number(e.target.value) }))}
          />
        </div>
      </div>

      {/* Estimated Hours + Budget */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Estimated Hours</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            className={inputClass}
            value={form.estimatedHours}
            onChange={e => setForm(f => ({ ...f, estimatedHours: Number(e.target.value) }))}
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Max Budget (SAR) *</label>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={form.maxBudgetSar}
            onChange={e => setForm(f => ({ ...f, maxBudgetSar: Number(e.target.value) }))}
          />
          {errors.maxBudgetSar && <p className="text-red-400 text-xs mt-1">{errors.maxBudgetSar}</p>}
        </div>
      </div>

      {/* GPU Availability Preview */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-medium text-[#00A8E1] mb-3">GPU Availability</h3>
        {loadingGpus ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : matchingGpus.length > 0 ? (
          <div className="space-y-2">
            {matchingGpus.slice(0, 5).map((gpu, i) => (
              <div
                key={i}
                className={`flex justify-between text-sm rounded-lg px-2 py-1 cursor-pointer transition ${
                  form.providerId === gpu.providerId
                    ? 'bg-[#FFD700]/10 border border-[#FFD700]/30'
                    : 'hover:bg-white/5'
                }`}
                onClick={() => setForm(f => ({ ...f, providerId: gpu.providerId }))}
              >
                <span className="text-white/80">
                  {gpu.gpuModel} ({gpu.vramGb}GB)
                  {gpu.providerId === urlProvider && <span className="text-[#00A8E1] text-xs ml-2">pre-selected</span>}
                </span>
                <span className="text-[#FFD700]">
                  {gpu.ratePerHourSar > 0 ? `${gpu.ratePerHourSar.toFixed(2)} SAR/hr` : '—'}
                </span>
              </div>
            ))}
            {matchingGpus.length > 5 && (
              <p className="text-white/40 text-xs">+{matchingGpus.length - 5} more available</p>
            )}
          </div>
        ) : (
          <p className="text-white/40 text-sm">No matching GPUs found. Try adjusting VRAM requirements.</p>
        )}
      </div>

      {/* Cost Estimate */}
      <div className="bg-[#FFD700]/10 border border-[#FFD700]/20 rounded-xl p-4">
        <div className="flex justify-between items-center">
          <span className="text-white/60 text-sm">Estimated Cost ({JOB_TYPES.find(j => j.value === form.jobType)?.label})</span>
          <span className="text-[#FFD700] text-xl font-bold">{costEstimateSar.toFixed(2)} SAR</span>
        </div>
        <p className="text-white/30 text-xs mt-1">
          Rate: {selectedRate} halala/min &bull; {form.estimatedHours}h = {Math.round(form.estimatedHours * 60)} min
        </p>
      </div>

      {/* Submit Error */}
      {submitError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center justify-between">
          <p className="text-red-400 text-sm">{submitError}</p>
          <button type="button" onClick={() => setSubmitError(null)} className="text-red-400 hover:text-red-300 text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Auth Error */}
      {errors.auth && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-red-400 text-sm">{errors.auth}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3.5 rounded-xl font-semibold text-[#1a1a1a] bg-[#FFD700] hover:bg-[#FFD700]/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            Submitting...
          </span>
        ) : 'Submit Job'}
      </button>
    </form>
  );
}
