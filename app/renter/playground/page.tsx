'use client';

import { useState, useEffect, useRef, useCallback, Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '../../lib/i18n';
import {
  consumeRestoredRenterAuthIntent,
  type RenterAuthIntent,
  setPendingRenterAuthIntent,
} from '../../lib/renter-auth-intent';

// ErrorBoundary to capture the actual crash error
class PlaygroundErrorBoundary extends Component<
  {
    children: ReactNode;
    title: string;
    subtitle: string;
    actionHint: string;
    retryLabel: string;
    reloadLabel: string;
    supportLabel: string;
    networkCategoryLabel: string;
    timeoutCategoryLabel: string;
    authCategoryLabel: string;
    unknownCategoryLabel: string;
    issueSuffixLabel: string;
  },
  { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null; category: 'network' | 'timeout' | 'auth' | 'unknown' }
> {
  constructor(props: {
    children: ReactNode;
    title: string;
    subtitle: string;
    actionHint: string;
    retryLabel: string;
    reloadLabel: string;
    supportLabel: string;
    networkCategoryLabel: string;
    timeoutCategoryLabel: string;
    authCategoryLabel: string;
    unknownCategoryLabel: string;
    issueSuffixLabel: string;
  }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, category: 'unknown' };
  }

  static classifyError(error: Error): 'network' | 'timeout' | 'auth' | 'unknown' {
    const message = error.message.toLowerCase();
    if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
    if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) return 'network';
    if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('401') || message.includes('403')) return 'auth';
    return 'unknown';
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error, category: PlaygroundErrorBoundary.classifyError(error) };
  }

  private trackBoundaryEvent(event: string, payload: Record<string, unknown> = {}) {
    if (typeof window === 'undefined') return;
    const detail = {
      event,
      payload: {
        ...payload,
        page: 'renter_playground',
        ts: new Date().toISOString(),
      },
    };
    window.dispatchEvent(new CustomEvent('dc1_analytics', { detail }));
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('PlaygroundErrorBoundary caught:', error, errorInfo);
    this.trackBoundaryEvent('playground_render_error', {
      category: PlaygroundErrorBoundary.classifyError(error),
      errorName: error.name,
      errorMessage: error.message,
      hasComponentStack: Boolean(errorInfo.componentStack),
    });
  }

  private resetBoundary = () => {
    this.trackBoundaryEvent('playground_render_error_recovered', { category: this.state.category });
    this.setState({ hasError: false, error: null, errorInfo: null, category: 'unknown' });
  };

  private reloadPage = () => {
    this.trackBoundaryEvent('playground_render_error_reload', { category: this.state.category });
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      const categoryLabelByType: Record<'network' | 'timeout' | 'auth' | 'unknown', string> = {
        network: this.props.networkCategoryLabel,
        timeout: this.props.timeoutCategoryLabel,
        auth: this.props.authCategoryLabel,
        unknown: this.props.unknownCategoryLabel,
      };

      return (
        <div className="min-h-screen bg-dc1-void text-dc1-text-primary p-8">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-red-400 mb-4">{this.props.title}</h1>
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-200">{this.props.subtitle}</p>
              <p className="text-xs text-red-300/80 mt-2">
                {categoryLabelByType[this.state.category]} {this.props.issueSuffixLabel}
              </p>
            </div>
            <p className="text-dc1-text-muted text-sm mb-4">{this.props.actionHint}</p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={this.resetBoundary}
                className="px-4 py-2 rounded-lg bg-[#00D9FF] text-[#0d1117] font-semibold text-sm"
              >
                {this.props.retryLabel}
              </button>
              <button
                onClick={this.reloadPage}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white font-semibold text-sm hover:bg-white/20 transition"
              >
                {this.props.reloadLabel}
              </button>
              <Link
                href="/support?category=playground-crash"
                onClick={() => this.trackBoundaryEvent('playground_render_error_support_clicked', { category: this.state.category })}
                className="px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-200 font-semibold text-sm hover:bg-amber-500/25 transition"
              >
                {this.props.supportLabel}
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const API_BASE = '/api';

type JobType = 'llm_inference' | 'image_generation' | 'vllm_serve';

// Fallback hardcoded models (used while API is loading or if API fails)
const FALLBACK_LLM_MODELS = [
  { id: 'qwen3-30b-a3b', label: 'Qwen3 30B-A3B (MoE)', vram: '~20 GB', speed: 'Fast', providers_online: 0 },
  { id: 'qwen3-8b', label: 'Qwen3 8B', vram: '~6 GB', speed: 'Fast', providers_online: 0 },
  { id: 'mistral:7b', label: 'Mistral 7B', vram: '~5 GB', speed: 'Fast', providers_online: 0 },
  { id: 'qwen2.5:14b', label: 'Qwen 2.5 14B', vram: '~10 GB', speed: 'Medium', providers_online: 0 },
  { id: 'llama3.1:8b', label: 'Llama 3.1 8B', vram: '~6 GB', speed: 'Fast', providers_online: 0 },
  { id: 'deepseek-r1:7b', label: 'DeepSeek R1 7B', vram: '~5 GB', speed: 'Medium', providers_online: 0 },
  { id: 'glm4:9b', label: 'GLM4 9B', vram: '~6 GB', speed: 'Fast', providers_online: 0 },
];

const SD_MODELS = [
  { id: 'CompVis/stable-diffusion-v1-4', label: 'Stable Diffusion v1.4', vram: '~3.5 GB', speed: 'Fast' },
] as const;

const FALLBACK_VLLM_MODELS = [
  { id: 'qwen3-30b-a3b', label: 'Qwen3 30B-A3B (MoE)', vram: '~20 GB', providers_online: 0 },
  { id: 'qwen3-8b', label: 'Qwen3 8B', vram: '~6 GB', providers_online: 0 },
  { id: 'mistral:7b', label: 'Mistral 7B', vram: '~5 GB', providers_online: 0 },
  { id: 'qwen2.5:14b', label: 'Qwen 2.5 14B', vram: '~10 GB', providers_online: 0 },
  { id: 'llama3.1:8b', label: 'Llama 3.1 8B', vram: '~6 GB', providers_online: 0 },
];

interface CatalogModel {
  id: string;
  label: string;
  vram: string;
  speed?: string;
  providers_online: number;
}

const COST_RATES: Record<JobType, number> = {
  llm_inference: 15,
  image_generation: 20,
  vllm_serve: 20,
};

const MODEL_VARIANTS: Record<string, string> = {
  'meta-llama/meta-llama-3-8b-instruct': 'google/gemma-2b-it',
  'mistralai/mistral-7b-instruct-v0.2': 'google/gemma-2b-it',
  'qwen/qwen2-7b-instruct': 'google/gemma-2b-it',
  'deepseek-ai/deepseek-r1-distill-qwen-7b': 'google/gemma-2b-it',
  'deepseek-ai/deepseek-r1-distill-llama-8b': 'google/gemma-2b-it',
  'microsoft/phi-3-mini-4k-instruct': 'tinyllama/tinyllama-1.1b-chat-v1.0',
  'google/gemma-2b-it': 'tinyllama/tinyllama-1.1b-chat-v1.0',
};

function selectVariantModel(model: string | null) {
  if (!model) return null;
  const key = model.trim().toLowerCase();
  if (!key) return null;
  if (MODEL_VARIANTS[key]) return MODEL_VARIANTS[key];
  if (key.includes('stable-diffusion') || key.includes('tinyllama')) return null;
  return 'google/gemma-2b-it';
}

interface Provider {
  id: number;
  name: string;
  gpu_model: string;
  vram_gb: number;
  status: string;
  cached_models?: string[];
}

interface JobResult {
  type: string;
  prompt: string;
  response?: string;
  model: string;
  tokens_generated?: number;
  tokens_per_second?: number;
  gen_time_s: number;
  total_time_s: number;
  device: string;
  billing?: { actual_cost_halala: number; actual_cost_sar: string };
  // Image-specific fields
  image_base64?: string;
  format?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
}

interface ProofData {
  job_id: string;
  provider_name: string;
  provider_gpu: string;
  provider_hostname: string;
  status: string;
  started_at: string;
  completed_at: string;
  actual_duration_minutes: number;
  cost_halala: number;
  provider_earned_halala: number;
  dc1_fee_halala: number;
  raw_log: string;
}

interface HistoryJob {
  id: number;
  job_id: string;
  job_type: string;
  status: string;
  submitted_at: string;
  completed_at: string | null;
  actual_cost_halala: number;
}

interface JobTemplate {
  id: number;
  name: string;
  job_type: string;
  model: string;
  system_prompt: string | null;
  max_tokens: number | null;
  resource_spec_json: string | null;
  created_at: string;
}

type Phase = 'idle' | 'submitting' | 'polling' | 'done' | 'error';
type ViewMode = 'new' | 'history';
type ImageType = 'pytorch-cuda' | 'vllm-serve' | 'training' | 'rendering';
type PresetJobType = 'llm_inference' | 'image_generation';
const IMAGE_TYPE_TO_COMPUTE: Record<ImageType, string> = {
  'pytorch-cuda': 'inference',
  'vllm-serve': 'inference',
  'training': 'training',
  'rendering': 'rendering',
};

const VRAM_OPTIONS = [
  { value: 4096, label: '4 GB' },
  { value: 8192, label: '8 GB' },
  { value: 16384, label: '16 GB' },
  { value: 24576, label: '24 GB' },
  { value: 40960, label: '40 GB' },
];

const FIRST_JOB_PRESETS: Array<{
  id: string;
  title: string;
  description: string;
  jobType: PresetJobType;
  model: string;
  prompt: string;
}> = [
  {
    id: 'chat-summary',
    title: 'Quick text summary',
    description: 'Fast prompt to test text inference',
    jobType: 'llm_inference',
    model: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
    prompt: 'Summarize this in 3 bullets: GPU inference helps run AI jobs on demand.',
  },
  {
    id: 'arabic-support',
    title: 'Arabic support reply',
    description: 'Create a short Arabic customer response',
    jobType: 'llm_inference',
    model: 'Qwen/Qwen2-7B-Instruct',
    prompt: 'اكتب رد دعم فني قصير وودود يشرح تأخر المهمة لمدة دقيقة واحدة.',
  },
  {
    id: 'logo-concept',
    title: 'Image concept draft',
    description: 'Generate a quick logo concept image',
    jobType: 'image_generation',
    model: 'CompVis/stable-diffusion-v1-4',
    prompt: 'Modern geometric falcon logo, amber and black, clean vector style.',
  },
];

export default function GpuPlaygroundPage() {
  const { t } = useLanguage();

  return (
    <PlaygroundErrorBoundary
      title={t('playground.error_boundary.title')}
      subtitle={t('playground.error_boundary.subtitle')}
      actionHint={t('playground.error_boundary.action_hint')}
      retryLabel={t('playground.error_boundary.try_again')}
      reloadLabel={t('playground.error_boundary.reload')}
      supportLabel={t('playground.error_boundary.contact_support')}
      networkCategoryLabel={t('playground.error_boundary.category_network')}
      timeoutCategoryLabel={t('playground.error_boundary.category_timeout')}
      authCategoryLabel={t('playground.error_boundary.category_auth')}
      unknownCategoryLabel={t('playground.error_boundary.category_unknown')}
      issueSuffixLabel={t('playground.error_boundary.category_issue_suffix')}
    >
      <Suspense fallback={<div className="min-h-screen bg-dc1-void flex items-center justify-center"><div className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full" /></div>}>
        <GpuPlayground />
      </Suspense>
    </PlaygroundErrorBoundary>
  );
}

function GpuPlayground() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const preselectedProvider = searchParams.get('provider');
  const preselectedModel = searchParams.get('model');
  const preselectedMode = searchParams.get('mode');
  const preselectedTemplate = searchParams.get('template');
  const preselectedJobType = searchParams.get('job_type');
  const preselectedSource = searchParams.get('source');

  // Auth
  const [renterKey, setRenterKey] = useState('');
  const [renterName, setRenterName] = useState<string | null>(null);
  const [renterBalance, setRenterBalance] = useState<number | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('new');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [fitConfirmed, setFitConfirmed] = useState(false);

  // Job history
  const [jobHistory, setJobHistory] = useState<HistoryJob[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewingJobId, setViewingJobId] = useState<number | null>(null);
  const [viewingResult, setViewingResult] = useState<JobResult | null>(null);
  const [viewingProof, setViewingProof] = useState<ProofData | null>(null);
  const [loadingJobResult, setLoadingJobResult] = useState(false);
  const [historyActionError, setHistoryActionError] = useState('');
  const [retryingHistoryJob, setRetryingHistoryJob] = useState(false);

  // Job type
  const [jobType, setJobType] = useState<JobType>('llm_inference');

  // Model catalog (fetched from API)
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  // Derive LLM_MODELS and VLLM_MODELS from catalog or fallback
  const LLM_MODELS: CatalogModel[] = catalogLoaded && catalogModels.length > 0
    ? catalogModels
    : FALLBACK_LLM_MODELS;
  const VLLM_MODELS: CatalogModel[] = catalogLoaded && catalogModels.length > 0
    ? catalogModels
    : FALLBACK_VLLM_MODELS;

  // LLM Form
  const [llmModel, setLlmModel] = useState<string>(FALLBACK_LLM_MODELS[0].id);
  const [prompt, setPrompt] = useState('');
  const [maxTokens, setMaxTokens] = useState(256);
  const [temperature, setTemperature] = useState(0.7);

  // Image Gen Form
  const [sdModel, setSdModel] = useState<string>(SD_MODELS[0].id);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [steps, setSteps] = useState(30);
  const [imgWidth, setImgWidth] = useState(512);
  const [imgHeight, setImgHeight] = useState(512);
  const [seed, setSeed] = useState(-1);

  // Provider
  const [providerId, setProviderId] = useState<number | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // vLLM Serve Form
  const [vllmModel, setVllmModel] = useState<string>(FALLBACK_VLLM_MODELS[0].id);
  const [vllmDuration, setVllmDuration] = useState(30);
  const [vllmDtype, setVllmDtype] = useState<'float16' | 'bfloat16' | 'float32'>('float16');
  const [vllmMaxModelLen, setVllmMaxModelLen] = useState(4096);

  // Templates
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [saveTemplateModal, setSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [templateError, setTemplateError] = useState('');

  // Container spec
  const [imageType, setImageType] = useState<ImageType>('pytorch-cuda');
  const [vramRequiredMb, setVramRequiredMb] = useState<number>(4096);
  const [gpuCount, setGpuCount] = useState<1 | 2 | 4>(1);
  const [containerImages, setContainerImages] = useState<string[]>([]);
  const [queueWait, setQueueWait] = useState<number | null>(null);
  const [authRedirecting, setAuthRedirecting] = useState(false);
  const [restoredAuthIntent, setRestoredAuthIntent] = useState<RenterAuthIntent | null>(null);
  const [firstSubmitTracked, setFirstSubmitTracked] = useState(false);

  // Job execution
  const [phase, setPhase] = useState<Phase>('idle');
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStringId, setJobStringId] = useState<string>('');
  const [pollCount, setPollCount] = useState(0);
  const [result, setResult] = useState<JobResult | null>(null);
  const [proof, setProof] = useState<ProofData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showRawLog, setShowRawLog] = useState(false);
  const [progressPhase, setProgressPhase] = useState<string>('');
  const [endpointUrl, setEndpointUrl] = useState<string>('');
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const blockedReasonTrackedRef = useRef<Set<string>>(new Set());
  const submitWasBlockedRef = useRef(false);
  const viewedHistorySummaryRef = useRef<Set<number>>(new Set());

  const isFirstTimeRenter = jobHistory.length === 0;
  const showFirstJobWizard = viewMode === 'new' && isFirstTimeRenter && phase === 'idle';

  const trackPlaygroundEvent = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return;
    const detail = { event, ...payload };
    window.dispatchEvent(new CustomEvent('dc1_analytics', { detail }));
    const win = window as Window & {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
    };
    if (Array.isArray(win.dataLayer)) {
      win.dataLayer.push(detail);
    }
    if (typeof win.gtag === 'function') {
      win.gtag('event', event, payload);
    }
  }, []);

  const pendingIntentPayload = useCallback(() => {
    const provider = preselectedProvider ? Number(preselectedProvider) : undefined;
    const normalizedMode: RenterAuthIntent['mode'] =
      preselectedMode === 'llm_inference' || preselectedMode === 'image_generation' || preselectedMode === 'vllm_serve'
        ? preselectedMode
        : undefined;
    const normalizedJobType: RenterAuthIntent['jobType'] =
      preselectedJobType === 'llm_inference' || preselectedJobType === 'image_generation' || preselectedJobType === 'vllm_serve'
        ? preselectedJobType
        : normalizedMode;
    const nextIntent: RenterAuthIntent = {
      providerId: provider != null && Number.isFinite(provider) ? provider : undefined,
      model: preselectedModel || undefined,
      mode: normalizedMode,
      template: preselectedTemplate || undefined,
      jobType: normalizedJobType,
      source: preselectedSource || undefined,
    };
    return nextIntent;
  }, [preselectedJobType, preselectedModel, preselectedMode, preselectedProvider, preselectedSource, preselectedTemplate]);

  useEffect(() => {
    if (!preselectedModel) return;
    const selectedModel = preselectedModel;
    const supportedLlm = LLM_MODELS.some(model => model.id === selectedModel);
    const supportedVllm = VLLM_MODELS.some(model => model.id === selectedModel);
    const wantsVllm = preselectedMode === 'vllm_serve';
    if (wantsVllm && supportedVllm) {
      setJobType('vllm_serve');
      setVllmModel(selectedModel);
      setLlmModel(selectedModel);
      return;
    }
    const supported = supportedLlm || supportedVllm;
    if (!supported) return;
    setJobType('llm_inference');
    setLlmModel(selectedModel);
    setVllmModel(selectedModel);
  }, [preselectedModel, preselectedMode]);

  useEffect(() => {
    if (preselectedJobType === 'llm_inference' || preselectedJobType === 'image_generation' || preselectedJobType === 'vllm_serve') {
      setJobType(preselectedJobType);
    }
  }, [preselectedJobType]);

  // ── Auth ──────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = typeof window !== 'undefined'
      ? (sessionStorage.getItem('dc1_renter_key') || localStorage.getItem('dc1_renter_key'))
      : null;
    if (saved) {
      setRenterKey(saved);
      verifyKey(saved);
    } else {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    if (authChecking || renterName || typeof window === 'undefined') return;
    const hasIntent = Boolean(preselectedProvider || preselectedModel || preselectedMode || preselectedTemplate || preselectedJobType || preselectedSource);
    if (!hasIntent) return;

    const intent = pendingIntentPayload();
    setPendingRenterAuthIntent(intent);
    trackPlaygroundEvent('auth_wall_entered', {
      provider_id: intent.providerId ?? null,
      model: intent.model ?? null,
      mode: intent.mode ?? null,
      template: intent.template ?? null,
      job_type: intent.jobType ?? null,
      source: intent.source ?? null,
    });
    setAuthRedirecting(true);
    window.location.href = '/login?role=renter&method=email&redirect=/renter/playground';
  }, [authChecking, pendingIntentPayload, preselectedJobType, preselectedMode, preselectedModel, preselectedProvider, preselectedSource, preselectedTemplate, renterName, trackPlaygroundEvent]);

  useEffect(() => {
    if (!renterName || typeof window === 'undefined') return;
    const restored = consumeRestoredRenterAuthIntent();
    if (!restored) return;
    setRestoredAuthIntent(restored);
    setFirstSubmitTracked(false);
    trackPlaygroundEvent('auth_intent_restored', {
      provider_id: restored.providerId ?? null,
      model: restored.model ?? null,
      mode: restored.mode ?? null,
      template: restored.template ?? null,
      job_type: restored.jobType ?? null,
      source: restored.source ?? null,
    });
  }, [renterName, trackPlaygroundEvent]);

  async function verifyKey(key: string) {
    setAuthChecking(true);
    try {
      const res = await fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(key)}`);
      if (res.ok) {
        const data = await res.json();
        setRenterName(data.renter?.name || t('playground.default_renter_name'));
        setRenterBalance(data.renter?.balance_halala != null ? data.renter.balance_halala / 100 : null);
        setRenterKey(key);
        sessionStorage.setItem('dc1_renter_key', key);
        // Load job history
        if (data.recent_jobs) {
          setJobHistory(data.recent_jobs);
        }
        // Load templates
        fetch(`${API_BASE}/renters/me/templates?key=${encodeURIComponent(key)}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.templates) setTemplates(d.templates); })
          .catch(() => {});
      } else {
        setRenterName(null);
        sessionStorage.removeItem('dc1_renter_key');
      }
    } catch { /* keep key */ }
    finally { setAuthChecking(false); }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (renterKey.trim()) verifyKey(renterKey.trim());
  }

  function logout() {
    sessionStorage.removeItem('dc1_renter_key');
    setRenterName(null);
    setRenterKey('');
    setJobHistory([]);
  }

  // ── Load full job result (for history view) ──────────────────────
  async function loadJobResult(job: HistoryJob) {
    setViewingJobId(job.id);
    setLoadingJobResult(true);
    setViewingResult(null);
    setViewingProof(null);
    setHistoryActionError('');

    try {
      // Fetch output (renter key required — server returns 403 without it)
      const outRes = await fetch(`${API_BASE}/jobs/${job.id}/output`, {
        headers: { 'Accept': 'application/json', 'x-renter-key': renterKey },
      });

      if (outRes.ok) {
        const data = await outRes.json();
        setViewingResult(data);
      }

      // Fetch proof
      const proofRes = await fetch(`${API_BASE}/jobs/${job.id}`, {
        headers: { 'x-renter-key': renterKey },
      });

      if (proofRes.ok) {
        const data = await proofRes.json();
        const j = data.job || {};
        setViewingProof({
          job_id: j.job_id || `#${j.id}`,
          provider_name: 'Restricted',
          provider_gpu: 'Restricted',
          provider_hostname: '',
          status: j.status,
          started_at: j.started_at || '',
          completed_at: j.completed_at || '',
          actual_duration_minutes: j.actual_duration_minutes || 0,
          cost_halala: j.actual_cost_halala || 0,
          provider_earned_halala: j.provider_earned_halala || 0,
          dc1_fee_halala: j.dc1_fee_halala || 0,
          raw_log: j.result || '',
        });
      }
    } catch (err) {
      console.error('Failed to load job result:', err);
    } finally {
      setLoadingJobResult(false);
    }
  }

  useEffect(() => {
    if (!viewingJobId || !viewingResult || !viewingProof) return;
    if (viewedHistorySummaryRef.current.has(viewingJobId)) return;
    trackPlaygroundEvent('job_summary_viewed', {
      source: 'playground_history',
      job_id: viewingJobId,
      status: viewingProof.status,
      model: viewingResult.model || null,
      provider_gpu: viewingProof.provider_gpu || null,
    });
    viewedHistorySummaryRef.current.add(viewingJobId);
  }, [viewingJobId, viewingResult, viewingProof, trackPlaygroundEvent]);

  async function retryFromHistorySummary() {
    if (!viewingJobId || !renterKey) return;
    setRetryingHistoryJob(true);
    setHistoryActionError('');
    try {
      const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(String(viewingJobId))}/retry?key=${encodeURIComponent(renterKey)}`, {
        method: 'POST',
        headers: { 'x-renter-key': renterKey },
      });
      if (res.status === 402) {
        setHistoryActionError(t('playground.history_error.insufficient_balance'));
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setHistoryActionError(err.error || t('playground.history_error.retry_failed'));
        return;
      }
      const data = await res.json();
      const newId = data.job?.id || data.id || null;
      trackPlaygroundEvent('retry_from_summary', {
        source: 'playground_history',
        job_id: viewingJobId,
        model: viewingResult?.model || null,
        job_type: viewingResult?.type || null,
      });
      if (newId) {
        window.location.href = `/renter/jobs/${newId}`;
        return;
      }
      setHistoryActionError(t('playground.history_error.retry_missing_job_id'));
    } catch {
      setHistoryActionError(t('playground.history_error.retry_network'));
    } finally {
      setRetryingHistoryJob(false);
    }
  }

  function runVariantFromHistorySummary() {
    if (!viewingResult) return;
    const variantModel = viewingResult.type === 'text' ? selectVariantModel(viewingResult.model || null) : null;
    if (!variantModel) {
      setHistoryActionError(t('playground.history_error.no_variant'));
      return;
    }
    setHistoryActionError('');
    setViewMode('new');
    setViewingJobId(null);
    setViewingResult(null);
    setViewingProof(null);
    setJobType('llm_inference');
    setLlmModel(variantModel);
    setVllmModel(variantModel);
    if (viewingResult.prompt) {
      setPrompt(viewingResult.prompt);
    }
    trackPlaygroundEvent('variant_run_clicked', {
      source: 'playground_history',
      job_id: viewingJobId,
      from_model: viewingResult.model || null,
      to_model: variantModel,
      output_type: viewingResult.type,
    });
  }

  // Build a structured snapshot of the viewed job for JSON / MD export.
  // Pulls fields from both viewingResult (model output) and viewingProof
  // (billing + status), and falls back gracefully when fields are missing.
  function buildExportSnapshot() {
    if (!viewingResult || !viewingJobId) return null;
    const proof = viewingProof || {} as any;
    return {
      job_id: proof.job_id || `#${viewingJobId}`,
      status: proof.status || null,
      type: viewingResult.type || null,
      model: viewingResult.model || null,
      device: viewingResult.device || null,
      prompt: viewingResult.prompt || null,
      response: viewingResult.type === 'text' ? (viewingResult.response || null) : null,
      tokens_generated: viewingResult.tokens_generated ?? null,
      tokens_per_second: viewingResult.tokens_per_second ?? null,
      gen_time_s: viewingResult.gen_time_s ?? null,
      total_time_s: viewingResult.total_time_s ?? null,
      image: viewingResult.type === 'image' ? {
        format: (viewingResult as any).format || 'png',
        width: (viewingResult as any).width || null,
        height: (viewingResult as any).height || null,
        seed: (viewingResult as any).seed || null,
      } : null,
      billing: {
        cost_halala: proof.cost_halala ?? 0,
        cost_sar: ((proof.cost_halala ?? 0) / 100).toFixed(2),
        provider_earned_halala: proof.provider_earned_halala ?? 0,
        dcp_fee_halala: proof.dc1_fee_halala ?? 0,
      },
      timing: {
        started_at: proof.started_at || null,
        completed_at: proof.completed_at || null,
        actual_duration_minutes: proof.actual_duration_minutes ?? null,
      },
    };
  }

  function buildExportMarkdown() {
    const snap = buildExportSnapshot();
    if (!snap) return '';
    const lines: string[] = [];
    lines.push(`# DCP Job ${snap.job_id}`);
    lines.push('');
    lines.push(`- **Status:** ${snap.status || 'unknown'}`);
    if (snap.model) lines.push(`- **Model:** ${snap.model}`);
    if (snap.device) lines.push(`- **Device:** ${snap.device}`);
    if (snap.timing.completed_at) lines.push(`- **Completed:** ${snap.timing.completed_at}`);
    if (snap.tokens_generated != null) {
      const speed = snap.tokens_per_second ? ` (${snap.tokens_per_second} tok/s)` : '';
      lines.push(`- **Tokens:** ${snap.tokens_generated}${speed}`);
    }
    lines.push(`- **Cost:** ${snap.billing.cost_halala} halala (${snap.billing.cost_sar} SAR)`);
    lines.push('');
    if (snap.prompt) {
      lines.push('## Prompt');
      lines.push('');
      lines.push(snap.prompt);
      lines.push('');
    }
    if (snap.type === 'text') {
      lines.push('## Response');
      lines.push('');
      lines.push(snap.response || '_(no response recorded)_');
      lines.push('');
    } else if (snap.type === 'image' && snap.image) {
      lines.push('## Image');
      lines.push('');
      lines.push(`- **Format:** ${snap.image.format}`);
      if (snap.image.width && snap.image.height) {
        lines.push(`- **Dimensions:** ${snap.image.width}×${snap.image.height}`);
      }
      if (snap.image.seed != null) lines.push(`- **Seed:** ${snap.image.seed}`);
      lines.push('');
      lines.push('_Use the PNG/JPEG/WebP buttons to download the image binary._');
      lines.push('');
    }
    return lines.join('\n');
  }

  function downloadBlob(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(href);
  }

  function exportViewingOutputAsJson() {
    if (!viewingResult || !viewingJobId) {
      setHistoryActionError(t('playground.history_error.export_requires_completed_output'));
      return;
    }
    const snap = buildExportSnapshot();
    if (!snap) return;
    setHistoryActionError('');
    const label = viewingProof?.job_id || String(viewingJobId);
    downloadBlob(JSON.stringify(snap, null, 2), `dcp-job-${label}.json`, 'application/json');
    trackPlaygroundEvent('output_exported', {
      source: 'playground_history',
      job_id: viewingJobId,
      format: 'json',
      output_type: viewingResult.type,
    });
  }

  function exportViewingOutputAsMarkdown() {
    if (!viewingResult || !viewingJobId) {
      setHistoryActionError(t('playground.history_error.export_requires_completed_output'));
      return;
    }
    const md = buildExportMarkdown();
    if (!md) return;
    setHistoryActionError('');
    const label = viewingProof?.job_id || String(viewingJobId);
    downloadBlob(md, `dcp-job-${label}.md`, 'text/markdown;charset=utf-8');
    trackPlaygroundEvent('output_exported', {
      source: 'playground_history',
      job_id: viewingJobId,
      format: 'md',
      output_type: viewingResult.type,
    });
  }

  // ── Image download helper ─────────────────────────────────────────
  function downloadImage(base64: string, format: 'png' | 'jpeg' | 'webp', jobLabel: string) {
    if (format === 'png') {
      // Direct base64 download
      const link = document.createElement('a');
      link.href = `data:image/png;base64,${base64}`;
      link.download = `dc1-${jobLabel}.png`;
      link.click();
      return;
    }

    // Convert using canvas for JPEG/WebP
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // White background for JPEG (no alpha)
      if (format === 'jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
      const dataUrl = canvas.toDataURL(mimeType, 0.92);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `dc1-${jobLabel}.${format === 'jpeg' ? 'jpg' : format}`;
      link.click();
    };
    img.src = `data:image/png;base64,${base64}`;
  }

  // Backend download (persistent, works even if base64 not in memory)
  function downloadFromBackend(jobIdNum: number, format: string, jobLabel: string) {
    const link = document.createElement('a');
    link.href = `${API_BASE}/jobs/${jobIdNum}/output/${format}`;
    link.download = `dc1-${jobLabel}.${format === 'jpeg' ? 'jpg' : format}`;
    link.target = '_blank';
    link.click();
  }

  // ── Fetch providers ──────────────────────────────────────────────
  const fetchProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch(`${API_BASE}/renters/available-providers`);
      if (res.ok) {
        const data = await res.json();
        const online = (data.providers || []).filter((p: Provider) => p.status === 'online');
        setProviders(online);
        if (online.length > 0 && !providerId) {
          // If provider was passed via URL query param (from marketplace), pre-select it
          const preId = preselectedProvider ? Number(preselectedProvider) : null;
          if (preId && online.some((p: Provider) => p.id === preId)) {
            setProviderId(preId);
          } else {
            setProviderId(online[0].id);
          }
        }
      }
    } catch { /* ignore */ }
    finally { setLoadingProviders(false); }
  }, [preselectedProvider, providerId]);

  useEffect(() => {
    if (renterName) fetchProviders();
  }, [renterName, fetchProviders]);

  // Fetch model catalog from /v1/models (OpenAI-compatible, includes real provider_count)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('https://api.dcp.sa/v1/models');
        if (!res.ok) return;
        const data = await res.json();
        const models = data.data || data.models || data;
        if (!Array.isArray(models) || models.length === 0) return;
        const mapped: CatalogModel[] = models
          .map((m: any) => ({
            id: m.id || m.model_id,
            label: m.name || m.display_name || m.id,
            vram: m.max_vram_gb ? `~${m.max_vram_gb} GB` : (m.min_gpu_vram_gb ? `~${m.min_gpu_vram_gb} GB` : '?'),
            speed: m.provider_count > 0 ? 'Available' : 'Offline',
            providers_online: m.provider_count ?? 0,
          }))
          // Sort: available models first, then by name
          .sort((a: CatalogModel, b: CatalogModel) => {
            if (a.providers_online > 0 && b.providers_online === 0) return -1;
            if (a.providers_online === 0 && b.providers_online > 0) return 1;
            return a.label.localeCompare(b.label);
          });
        if (!cancelled && mapped.length > 0) {
          setCatalogModels(mapped);
          setCatalogLoaded(true);
          // Auto-select first available model
          const firstAvailable = mapped.find(m => m.providers_online > 0);
          if (firstAvailable) {
            setLlmModel(firstAvailable.id);
            setVllmModel(firstAvailable.id);
          }
        }
      } catch {
        // Silently fall back to hardcoded models
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setAdvancedOpen(!isFirstTimeRenter);
  }, [isFirstTimeRenter]);

  useEffect(() => {
    if (!showFirstJobWizard) return;
    setFitConfirmed(false);
  }, [showFirstJobWizard, jobType, llmModel, sdModel, prompt, providerId]);

  useEffect(() => {
    fetch(`${API_BASE}/containers/registry`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.images && Array.isArray(d.images)) {
          // API returns objects with {id, image_ref, image_type, ...} — extract valid image types
          const validTypes = new Set(['pytorch-cuda', 'vllm-serve', 'training', 'rendering']);
          const imageTypes: string[] = d.images
            .map((img: unknown) => typeof img === 'string' ? img : (img as Record<string, unknown>)?.image_type || '')
            .filter((v: string) => validTypes.has(v))
            .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
          // Only use API results if they contain valid image types; otherwise fallback to hardcoded list
          if (imageTypes.length > 0) setContainerImages(imageTypes);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!renterKey) {
      setQueueWait(null);
      return;
    }

    const computeType = IMAGE_TYPE_TO_COMPUTE[imageType];
    fetch(`${API_BASE}/jobs/queue/status`, {
      headers: { 'x-renter-key': renterKey },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const source = Array.isArray(d?.queue) ? d.queue : d?.buckets;
        if (!Array.isArray(source)) { setQueueWait(null); return; }
        const bucket = (source as Array<{ compute_type: string; vram_bucket?: string | number; vram_required_mb?: string | number; count?: number; depth?: number }>)
          .find((b) => b.compute_type === computeType
            && Number(b.vram_bucket ?? b.vram_required_mb ?? 0) <= vramRequiredMb);
        setQueueWait(bucket ? Number(bucket.count ?? bucket.depth ?? 0) : 0);
      })
      .catch(() => setQueueWait(null));
  }, [imageType, renterKey, vramRequiredMb]);

  // ── Submit job ───────────────────────────────────────────────────
  async function submitJob() {
    if (jobType !== 'vllm_serve' && !prompt.trim()) return;
    if (!providerId) return;
    if (showFirstJobWizard && !fitConfirmed) return;
    trackPlaygroundEvent('job_submit_clicked', {
      job_type: jobType,
      provider_id: providerId,
      model: jobType === 'llm_inference' ? llmModel : jobType === 'image_generation' ? sdModel : vllmModel,
      first_time: showFirstJobWizard,
      preset_id: selectedPresetId,
      template: preselectedTemplate || restoredAuthIntent?.template || null,
      source: preselectedSource || restoredAuthIntent?.source || null,
    });
    if (submitWasBlockedRef.current) {
      trackPlaygroundEvent('submit_after_block_resolution', {
        job_type: jobType,
        provider_id: providerId,
        model: jobType === 'llm_inference' ? llmModel : jobType === 'image_generation' ? sdModel : vllmModel,
      });
      submitWasBlockedRef.current = false;
    }
    if (restoredAuthIntent && !firstSubmitTracked) {
      trackPlaygroundEvent('first_submit_after_login', {
        provider_id: providerId,
        model: jobType === 'llm_inference' ? llmModel : jobType === 'image_generation' ? sdModel : vllmModel,
        mode: jobType,
        template: restoredAuthIntent.template ?? preselectedTemplate ?? null,
        job_type: restoredAuthIntent.jobType ?? jobType,
        source: restoredAuthIntent.source ?? preselectedSource ?? null,
      });
      setFirstSubmitTracked(true);
      setRestoredAuthIntent(null);
    }
    setPhase('submitting');
    setResult(null);
    setProof(null);
    setErrorMsg('');
    setEndpointUrl('');
    setCopiedEndpoint(false);
    setPollCount(0);
    setProgressPhase('');
    setViewMode('new');

    let params: Record<string, unknown>;
    let durationMinutes: number;
    if (jobType === 'vllm_serve') {
      params = { model: vllmModel, max_model_len: vllmMaxModelLen, dtype: vllmDtype };
      durationMinutes = vllmDuration;
    } else if (jobType === 'llm_inference') {
      params = { model: llmModel, prompt: prompt.trim(), max_tokens: maxTokens, temperature };
      durationMinutes = 10;
    } else {
      params = {
        model: sdModel,
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim() || undefined,
        steps,
        width: imgWidth,
        height: imgHeight,
        seed: seed >= 0 ? seed : undefined,
      };
      durationMinutes = 15;
    }

    try {
      // For LLM inference: use /v1/chat/completions directly (fast, streaming, no Docker)
      if (jobType === 'llm_inference') {
        const startedAt = new Date();
        const t0 = performance.now();
        const inferenceRes = await fetch('https://api.dcp.sa/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${renterKey}`,
          },
          body: JSON.stringify({
            model: llmModel,
            messages: [{ role: 'user', content: prompt.trim() }],
            max_tokens: maxTokens,
            temperature,
            stream: false,
          }),
        });

        if (!inferenceRes.ok) {
          const err = await inferenceRes.json().catch(() => ({}));
          const errMsg = err.error?.message || `HTTP ${inferenceRes.status}`;
          throw new Error(errMsg);
        }

        const inferenceData = await inferenceRes.json();
        const wallMs = performance.now() - t0;
        const completedAt = new Date();
        const content = inferenceData.choices?.[0]?.message?.content
          || inferenceData.choices?.[0]?.message?.reasoning_content
          || '';
        const usage = inferenceData.usage || {};
        const timings = inferenceData.timings || {};

        // Set job ID from response for Job Detail page
        const chatcmplId = inferenceData.id || '';
        setJobStringId(chatcmplId);

        const providerGpu = inferenceRes.headers.get('x-dcp-provider-endpoint-host') || 'GPU';
        const providerIdHeader = inferenceRes.headers.get('x-dcp-provider-id') || '';

        // Use upstream timings if present (llama.cpp), else wall-clock (Ollama doesn't include them)
        const genTimeS = timings.predicted_ms
          ? timings.predicted_ms / 1000
          : Math.round((wallMs / 1000) * 10) / 10;
        const completionTokens = usage.completion_tokens || 0;
        const tokensPerSec = timings.predicted_per_second
          ? timings.predicted_per_second
          : (genTimeS > 0 && completionTokens > 0
              ? Math.round((completionTokens / genTimeS) * 10) / 10
              : 0);

        setResult({
          type: 'text',
          prompt: prompt.trim(),
          response: content,
          model: inferenceData.model || llmModel,
          tokens_generated: completionTokens,
          tokens_per_second: tokensPerSec,
          gen_time_s: genTimeS,
          total_time_s: genTimeS,
          device: providerGpu,
          billing: {
            actual_cost_halala: usage.pricing?.usd_total ? Math.round(parseFloat(usage.pricing.usd_total) * 375) : 1,
            actual_cost_sar: usage.pricing?.usd_total ? (parseFloat(usage.pricing.usd_total) * 3.75).toFixed(4) : '0.01',
          },
        });
        // Populate Execution Proof panel for v1 inference path (no polling, no /jobs/:id/proof)
        const inferProvider = providerId ? providers.find((p) => p.id === providerId) || null : null;
        const costH = usage.pricing?.usd_total ? Math.round(parseFloat(usage.pricing.usd_total) * 375) : 1;
        setProof({
          job_id: chatcmplId || '',
          provider_name: inferProvider?.name || providerGpu || 'Unknown',
          provider_gpu: inferProvider?.gpu_model || providerGpu || 'GPU',
          provider_hostname: inferProvider?.name || providerGpu || '',
          status: 'completed',
          started_at: startedAt.toISOString(),
          completed_at: completedAt.toISOString(),
          actual_duration_minutes: wallMs / 60000,
          cost_halala: costH,
          provider_earned_halala: Math.round(costH * 0.75),
          dc1_fee_halala: Math.round(costH * 0.25),
          raw_log: '',
        });
        setPhase('done');
        trackPlaygroundEvent('job_submit_success', {
          job_type: 'llm_inference',
          job_id: chatcmplId,
          provider_id: providerIdHeader || providerId,
          model: llmModel,
          tokens: usage.total_tokens,
        });
        return;
      }

      // For vLLM serve and image gen: use legacy job system
      const containerSpec = {
        image_type: imageType,
        vram_required_mb: vramRequiredMb,
        gpu_count: gpuCount,
        compute_type: IMAGE_TYPE_TO_COMPUTE[imageType],
      };

      const res = await fetch(`${API_BASE}/jobs/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-renter-key': renterKey },
        body: JSON.stringify({
          provider_id: providerId,
          job_type: jobType,
          duration_minutes: durationMinutes,
          params,
          container_spec: containerSpec,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `${t('playground.http_error_prefix')} ${res.status}`);
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error || t('playground.submission_failed'));

      setJobId(data.job.id);
      setJobStringId(data.job.job_id || '');
      trackPlaygroundEvent('job_submit_success', {
        job_type: jobType,
        job_id: data.job.id,
        provider_id: providerId,
      });
      setPhase('polling');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('playground.failed_to_submit'));
      setPhase('error');
    }
  }

  // ── Poll for result ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'polling' || !jobId) return;

    async function poll() {
      setPollCount(c => c + 1);
      try {
        // Check current job state using renter credentials
        const jobCheck = await fetch(`${API_BASE}/jobs/${jobId}`, {
          headers: { 'x-renter-key': renterKey },
        });
        if (jobCheck.ok) {
          const jobData = await jobCheck.json();
          const job = jobData.job || {};
          if (job.progress_phase) setProgressPhase(job.progress_phase);
          if (job.status === 'failed') {
            setErrorMsg(job.error || t('playground.job_failed_provider'));
            setPhase('error');
            return;
          }
          // vLLM serve: detect when endpoint is ready
          if (jobType === 'vllm_serve' && job.endpoint_url && job.status === 'running') {
            setEndpointUrl(job.endpoint_url);
            fetchProof(jobId!);
            setPhase('done');
            refreshJobHistory();
            return;
          }
          // vLLM serve completed (duration expired)
          if (jobType === 'vllm_serve' && job.status === 'completed') {
            setPhase('done');
            refreshJobHistory();
            return;
          }
        }

        // For non-vLLM jobs, check output endpoint
        if (jobType !== 'vllm_serve') {
          const res = await fetch(`${API_BASE}/jobs/${jobId}/output`, {
            headers: { 'Accept': 'application/json' },
          });

          if (res.status === 202) return; // still running
          if (res.status === 204) return; // completed but no output yet

          if (res.ok) {
            const data = await res.json();
            if (data.type === 'text' && data.response) {
              setResult(data);
              if (jobId) fetchProof(jobId!);
              setPhase('done');
              refreshJobHistory();
            } else if (data.type === 'image' && data.image_base64) {
              setResult(data);
              if (jobId) fetchProof(jobId!);
              setPhase('done');
              refreshJobHistory();
            }
          } else if (res.status === 404) {
            const jobRes = await fetch(`${API_BASE}/jobs/${jobId}`, {
              headers: { 'x-renter-key': renterKey },
            });
            if (jobRes.ok) {
              const data = await jobRes.json();
              const job = data.job || {};
              if (job.status === 'failed') {
                setErrorMsg(job.error || t('playground.job_failed_provider'));
                setPhase('error');
              }
            }
          }
        }
      } catch { /* retry next interval */ }
    }

    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, jobId, jobType]);

  // Stop polling after 15 minutes (image gen can take longer)
  useEffect(() => {
    if (phase === 'polling' && pollCount > 300) {
      setErrorMsg(t('playground.job_timeout'));
      setPhase('error');
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [phase, pollCount]);

  async function fetchProof(id: number) {
    try {
      const res = await fetch(`${API_BASE}/jobs/${id}`, {
        headers: { 'x-renter-key': renterKey },
      });
      if (!res.ok) return;
      const data = await res.json();
      const job = data.job || {};

      setProof({
        job_id: job.job_id || `#${job.id}`,
        provider_name: 'Restricted',
        provider_gpu: 'Restricted',
        provider_hostname: '',
        status: job.status,
        started_at: job.started_at || '',
        completed_at: job.completed_at || '',
        actual_duration_minutes: job.actual_duration_minutes || 0,
        cost_halala: job.actual_cost_halala || 0,
        provider_earned_halala: job.provider_earned_halala || 0,
        dc1_fee_halala: job.dc1_fee_halala || 0,
        raw_log: job.result || '',
      });

      // Refresh balance
      verifyKey(renterKey);
    } catch { /* ignore */ }
  }

  // Refresh job history from API
  async function refreshJobHistory() {
    try {
      const res = await fetch(`${API_BASE}/renters/me?key=${encodeURIComponent(renterKey)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.recent_jobs) setJobHistory(data.recent_jobs);
        if (data.renter?.balance_halala != null) setRenterBalance(data.renter.balance_halala / 100);
      }
    } catch { /* ignore */ }
  }

  async function fetchTemplates() {
    if (!renterKey) return;
    try {
      const res = await fetch(`${API_BASE}/renters/me/templates?key=${encodeURIComponent(renterKey)}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch { /* ignore */ }
  }

  async function saveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    setTemplateError('');
    try {
      let model = jobType === 'llm_inference' ? llmModel : jobType === 'image_generation' ? sdModel : vllmModel;
      const res = await fetch(`${API_BASE}/renters/me/templates?key=${encodeURIComponent(renterKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName.trim(),
          job_type: jobType,
          model,
          max_tokens: jobType === 'llm_inference' ? maxTokens : null,
          resource_spec_json: JSON.stringify(
            jobType === 'llm_inference'
              ? { prompt: prompt.trim(), temperature }
              : jobType === 'image_generation'
              ? { steps, width: imgWidth, height: imgHeight }
              : { max_model_len: vllmMaxModelLen, dtype: vllmDtype, duration_minutes: vllmDuration }
          ),
        }),
      });
      if (res.ok) {
        setSaveTemplateModal(false);
        setTemplateName('');
        setTemplateSaved(true);
        fetchTemplates();
        setTimeout(() => setTemplateSaved(false), 3000);
      } else {
        const body = await res.json().catch(() => ({}));
        setTemplateError(body.error || `Save failed (HTTP ${res.status})`);
      }
    } catch (err: any) {
      setTemplateError(err?.message || 'Network error — could not save template');
    }
    finally { setSavingTemplate(false); }
  }

  function loadTemplate(tpl: JobTemplate) {
    setShowTemplateDropdown(false);
    const spec = tpl.resource_spec_json ? (() => { try { return JSON.parse(tpl.resource_spec_json!); } catch { return {}; } })() : {};
    if (tpl.job_type === 'llm_inference') {
      setJobType('llm_inference');
      setLlmModel(tpl.model);
      if (tpl.max_tokens) setMaxTokens(tpl.max_tokens);
      if (spec.prompt) setPrompt(spec.prompt);
      if (spec.temperature != null) setTemperature(spec.temperature);
    } else if (tpl.job_type === 'image_generation') {
      setJobType('image_generation');
      setSdModel(tpl.model);
      if (spec.steps) setSteps(spec.steps);
      if (spec.width) setImgWidth(spec.width);
      if (spec.height) setImgHeight(spec.height);
    } else if (tpl.job_type === 'vllm_serve') {
      setJobType('vllm_serve');
      setVllmModel(tpl.model);
      if (spec.max_model_len) setVllmMaxModelLen(spec.max_model_len);
      if (spec.dtype) setVllmDtype(spec.dtype);
      if (spec.duration_minutes) setVllmDuration(spec.duration_minutes);
    }
    setViewMode('new');
  }

  function applyFirstJobPreset(presetId: string) {
    const preset = FIRST_JOB_PRESETS.find(p => p.id === presetId);
    if (!preset || isRunning) return;
    if (preset.jobType === 'llm_inference') {
      setJobType('llm_inference');
      setLlmModel(preset.model);
      setMaxTokens(256);
      setTemperature(0.7);
    } else {
      setJobType('image_generation');
      setSdModel(preset.model);
      setSteps(30);
    }
    setPrompt(preset.prompt);
    setSelectedPresetId(preset.id);
    setFitConfirmed(false);
    trackPlaygroundEvent('playground_preset_selected', {
      preset_id: preset.id,
      job_type: preset.jobType,
      model: preset.model,
    });
  }

  async function deleteTemplate(id: number) {
    try {
      await fetch(`${API_BASE}/renters/me/templates/${id}?key=${encodeURIComponent(renterKey)}`, { method: 'DELETE' });
      fetchTemplates();
    } catch { /* ignore */ }
  }

  function resetForm() {
    setPhase('idle');
    setResult(null);
    setProof(null);
    setPrompt('');
    setNegativePrompt('');
    setProgressPhase('');
    setEndpointUrl('');
    setCopiedEndpoint(false);
  }

  function copyEndpoint() {
    navigator.clipboard.writeText(endpointUrl).then(() => {
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    });
  }

  // ── Styling ──────────────────────────────────────────────────────
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#00D9FF]/60 transition';
  const rate = COST_RATES[jobType];
  const isRunning = phase === 'polling' || phase === 'submitting';
  const selectedProvider = providerId ? providers.find((p) => p.id === providerId) || null : null;
  const selectedModelVramGb = Number(
    (jobType === 'llm_inference' ? llmModel : jobType === 'image_generation' ? sdModel : vllmModel)
      .match(/~(\d+(?:\.\d+)?)\s*GB/)?.[1] ?? 0
  );
  const recommendedProvider = providers.length > 0
    ? [...providers].sort((a, b) => (b.vram_gb || 0) - (a.vram_gb || 0))[0]
    : null;
  const queueEstimateMinutes = queueWait == null ? null : queueWait === 0 ? 0 : Math.max(1, queueWait * 2);
  const baseRuntimeMinutes = jobType === 'vllm_serve' ? vllmDuration : jobType === 'image_generation' ? 15 : 10;
  const minRuntimeMinutes = jobType === 'vllm_serve' ? vllmDuration : Math.max(5, Math.floor(baseRuntimeMinutes * 0.6));
  const maxRuntimeMinutes = jobType === 'vllm_serve' ? vllmDuration : Math.ceil(baseRuntimeMinutes * 1.4);
  const estimatedMinHalala = rate * minRuntimeMinutes;
  const estimatedMaxHalala = rate * maxRuntimeMinutes;
  const availableBalanceHalala = renterBalance != null ? Math.round(renterBalance * 100) : null;
  const isBalanceSufficient = availableBalanceHalala == null ? true : availableBalanceHalala >= estimatedMaxHalala;
  const canRecoverLowBalance = !isRunning && !isBalanceSufficient;
  const hasAuthKey = renterKey.trim().length > 0;
  const isProviderOnline = selectedProvider ? selectedProvider.status === 'online' : false;
  const isModelCompatible =
    selectedProvider && selectedModelVramGb > 0
      ? (selectedProvider.vram_gb || 0) >= selectedModelVramGb
      : true;
  const hasHoldEstimate = queueEstimateMinutes !== null;
  const expectedOutputType =
    jobType === 'image_generation' ? 'Image file (PNG/JPG/WebP)' : jobType === 'vllm_serve' ? 'Live API endpoint URL' : 'Text response';
  const readinessChecks: Array<{
    key: string;
    label: string;
    passing: boolean;
    detail: string;
    required: boolean;
  }> = [
    {
      key: 'auth_valid',
      label: 'Auth valid',
      passing: hasAuthKey,
      detail: hasAuthKey ? 'Renter API key is loaded.' : 'Login key is missing.',
      required: true,
    },
    {
      key: 'provider_online',
      label: 'Provider online',
      passing: Boolean(providerId) && isProviderOnline,
      detail: providerId
        ? isProviderOnline
          ? 'Selected provider is online.'
          : 'Selected provider is offline.'
        : 'Select a provider first.',
      required: true,
    },
    {
      key: 'model_compat',
      label: 'Model compatibility',
      passing: isModelCompatible,
      detail:
        selectedProvider && selectedModelVramGb > 0
          ? isModelCompatible
            ? `${selectedProvider.vram_gb || 0} GB VRAM covers model requirement.`
            : `Model needs ~${selectedModelVramGb} GB; selected provider has ${selectedProvider.vram_gb || 0} GB.`
          : 'Compatibility will validate once provider/model are selected.',
      required: true,
    },
    {
      key: 'hold_visible',
      label: 'Estimated hold visible',
      passing: hasHoldEstimate,
      detail: hasHoldEstimate ? 'Queue estimate is available.' : 'Queue estimate is still loading.',
      required: false,
    },
    {
      key: 'output_type',
      label: 'Expected output type',
      passing: true,
      detail: expectedOutputType,
      required: false,
    },
  ];

  const submitBlockers: Array<{
    code: string;
    reason: string;
    ctaLabel: string;
    onRecover: () => void;
  }> = [];
  if (!providerId) {
    submitBlockers.push({
      code: 'provider_missing',
      reason: t('playground.blocker.provider_missing.reason'),
      ctaLabel: t('playground.blocker.provider_missing.cta'),
      onRecover: fetchProviders,
    });
  }
  if (!hasAuthKey) {
    submitBlockers.push({
      code: 'auth_missing',
      reason: 'Authentication key missing. Re-authenticate before submitting.',
      ctaLabel: 'Go to login',
      onRecover: () => {
        window.location.href = '/login?role=renter&source=playground-submit';
      },
    });
  }
  if (providerId && selectedProvider && !isProviderOnline) {
    submitBlockers.push({
      code: 'provider_offline',
      reason: 'Selected provider is offline. Pick an online provider before submit.',
      ctaLabel: 'Refresh providers',
      onRecover: fetchProviders,
    });
  }
  if (providerId && selectedProvider && !isModelCompatible) {
    submitBlockers.push({
      code: 'model_incompatible',
      reason: `Selected GPU VRAM is below model requirement (~${selectedModelVramGb} GB).`,
      ctaLabel: 'Choose compatible provider',
      onRecover: fetchProviders,
    });
  }
  if (jobType !== 'vllm_serve' && !prompt.trim()) {
    submitBlockers.push({
      code: 'prompt_missing',
      reason: t('playground.blocker.prompt_missing.reason'),
      ctaLabel: t('playground.blocker.prompt_missing.cta'),
      onRecover: () => promptRef.current?.focus(),
    });
  }
  if (showFirstJobWizard && !fitConfirmed) {
    submitBlockers.push({
      code: 'fit_not_confirmed',
      reason: t('playground.blocker.fit_not_confirmed.reason'),
      ctaLabel: t('playground.blocker.fit_not_confirmed.cta'),
      onRecover: () => setFitConfirmed(true),
    });
  }
  if (canRecoverLowBalance) {
    submitBlockers.push({
      code: 'insufficient_balance',
      reason: `${t('playground.blocker.insufficient_balance.reason_prefix')} ${(estimatedMaxHalala / 100).toFixed(2)} SAR ${t('playground.blocker.insufficient_balance.reason_suffix')}`,
      ctaLabel: t('playground.blocker.insufficient_balance.cta'),
      onRecover: () => {
        trackPlaygroundEvent('topup_cta_clicked_from_playground', {
          balance_halala: availableBalanceHalala,
          estimated_max_halala: estimatedMaxHalala,
          job_type: jobType,
        });
        window.location.href = '/renter/billing';
      },
    });
  }
  // Only block on a genuinely stuck previous job (polling), not on the user's own in-flight submit
  if (phase === 'polling') {
    submitBlockers.push({
      code: 'job_in_progress',
      reason: t('playground.blocker.job_in_progress.reason'),
      ctaLabel: t('playground.blocker.job_in_progress.cta'),
      onRecover: () => setViewMode('history'),
    });
  }

  const primaryBlocker = submitBlockers[0] ?? null;
  const isSubmitDisabled = submitBlockers.length > 0;

  useEffect(() => {
    if (submitBlockers.length === 0) {
      blockedReasonTrackedRef.current.clear();
      return;
    }
    submitWasBlockedRef.current = true;
    submitBlockers.forEach((blocker) => {
      if (blockedReasonTrackedRef.current.has(blocker.code)) return;
      trackPlaygroundEvent('playground_submit_blocked_reason', {
        reason: blocker.code,
        job_type: jobType,
        provider_id: providerId,
      });
      trackPlaygroundEvent('submit_blocked_reason', {
        reason: blocker.code,
        job_type: jobType,
        provider_id: providerId,
      });
      blockedReasonTrackedRef.current.add(blocker.code);
    });
  }, [jobType, providerId, submitBlockers, trackPlaygroundEvent]);

  // ── Progress label ────────────────────────────────────────────────
  function getProgressLabel(): string {
    if (phase === 'submitting') return t('playground.progress.submitting');
    if (phase !== 'polling') return '';
    const elapsed = `${pollCount * 3}s`;
    if (progressPhase) {
      const labels: Record<string, string> = {
        downloading_model: t('playground.progress.downloading_model'),
        loading_model: t('playground.progress.loading_model'),
        generating: jobType === 'image_generation' ? t('playground.progress.generating_image') : t('playground.progress.running_inference'),
        formatting: t('playground.progress.formatting'),
        starting_server: t('playground.progress.starting_server'),
        server_ready: t('playground.progress.server_ready'),
      };
      return `${labels[progressPhase] || progressPhase} (${elapsed})`;
    }
    if (jobType === 'vllm_serve') return `${t('playground.progress.starting_server_gpu')} (${elapsed})`;
    return jobType === 'image_generation'
      ? `${t('playground.progress.generating_gpu')} (${elapsed})`
      : `${t('playground.progress.running_gpu')} (${elapsed})`;
  }

  // ── Render download buttons ─────────────────────────────────────
  function ImageDownloadButtons({ imageBase64, jobIdNum, jobLabel }: { imageBase64?: string; jobIdNum: number; jobLabel: string }) {
    const trackExport = (format: 'png' | 'jpeg' | 'webp') => {
      trackPlaygroundEvent('output_exported', {
        source: 'playground_history',
        job_id: jobIdNum,
        format: format === 'jpeg' ? 'jpg' : format,
        output_type: 'image',
      });
    };

    return (
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {imageBase64 ? (
          <>
            <button onClick={() => { downloadImage(imageBase64, 'png', jobLabel); trackExport('png'); }} className="px-4 py-2 rounded-lg text-sm font-medium bg-[#A855F7]/20 text-[#A855F7] hover:bg-[#A855F7]/30 transition border border-[#A855F7]/30">
              {t('playground.download_png')}
            </button>
            <button onClick={() => { downloadImage(imageBase64, 'jpeg', jobLabel); trackExport('jpeg'); }} className="px-4 py-2 rounded-lg text-sm font-medium bg-[#00D9FF]/20 text-[#00D9FF] hover:bg-[#00D9FF]/30 transition border border-[#00D9FF]/30">
              {t('playground.download_jpg')}
            </button>
            <button onClick={() => { downloadImage(imageBase64, 'webp', jobLabel); trackExport('webp'); }} className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition border border-green-500/30">
              {t('playground.download_webp')}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { downloadFromBackend(jobIdNum, 'png', jobLabel); trackExport('png'); }} className="px-4 py-2 rounded-lg text-sm font-medium bg-[#A855F7]/20 text-[#A855F7] hover:bg-[#A855F7]/30 transition border border-[#A855F7]/30">
              {t('playground.download_png')}
            </button>
            <button onClick={() => { downloadFromBackend(jobIdNum, 'jpeg', jobLabel); trackExport('jpeg'); }} className="px-4 py-2 rounded-lg text-sm font-medium bg-[#00D9FF]/20 text-[#00D9FF] hover:bg-[#00D9FF]/30 transition border border-[#00D9FF]/30">
              {t('playground.download_jpg')}
            </button>
            <button onClick={() => { downloadFromBackend(jobIdNum, 'webp', jobLabel); trackExport('webp'); }} className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition border border-green-500/30">
              {t('playground.download_webp')}
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Auth Gate ────────────────────────────────────────────────────
  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-[#00D9FF] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!renterName) {
    if (authRedirecting) {
      return (
        <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-[#00D9FF] border-t-transparent rounded-full" />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-[#0d1117] text-white">
        <div className="max-w-md mx-auto px-4 pt-24">
          <Link href="/renter" className="text-white/40 text-sm hover:text-[#00D9FF] transition mb-8 block">&larr; {t('playground.back_to_dashboard')}</Link>
          <h1 className="text-2xl font-bold mb-2">{t('playground.title')}</h1>
          <p className="text-white/50 text-sm mb-8">{t('playground.auth_subtitle')}</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="text" placeholder={t('playground.auth_key_placeholder')} className={inputCls} value={renterKey} onChange={e => setRenterKey(e.target.value)} />
            <button type="submit" disabled={!renterKey.trim()} className="w-full py-3 rounded-lg font-semibold bg-[#00D9FF] text-[#0d1117] hover:bg-[#00D9FF]/90 disabled:opacity-40 transition">{t('playground.auth_login')}</button>
          </form>
        </div>
      </div>
    );
  }

  // ── Main UI ──────────────────────────────────────────────────────
  return (
    <>
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/renter" className="text-white/40 text-sm hover:text-[#00D9FF] transition">&larr; {t('playground.dashboard_link')}</Link>
            <h1 className="text-2xl font-bold mt-1">{t('playground.title')}</h1>
            <p className="text-white/40 text-sm">{t('playground.subtitle')}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm text-white/60">{renterName}</span>
            </div>
            {renterBalance != null && (
              <span className="text-xs text-[#FFD700] font-medium">{renterBalance.toFixed(2)} SAR</span>
            )}
            <br />
            <button onClick={logout} className="text-xs text-white/30 hover:text-white/50 transition">{t('playground.logout')}</button>
          </div>
        </div>

        {restoredAuthIntent && (
          <div className="mb-6 rounded-xl border border-[#00D9FF]/40 bg-[#00D9FF]/10 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#7CE8FF]">Ready to submit</p>
                <p className="text-xs text-white/80 mt-1">
                  Your pre-login provider/model selection was restored. Review and submit when ready.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRestoredAuthIntent(null)}
                className="text-xs text-[#7CE8FF] hover:text-white transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── View Mode Toggle ──────────────────────────────────── */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setViewMode('new')}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition ${
              viewMode === 'new'
                ? 'bg-[#00D9FF] text-[#0d1117]'
                : 'bg-white/5 text-white/50 border border-white/10 hover:border-white/20'
            }`}
          >
            {t('playground.new_job')}
          </button>
          <button
            onClick={() => { setViewMode('history'); setViewingJobId(null); setViewingResult(null); }}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2 ${
              viewMode === 'history'
                ? 'bg-[#FFD700] text-[#0d1117]'
                : 'bg-white/5 text-white/50 border border-white/10 hover:border-white/20'
            }`}
          >
            {t('playground.job_history')}
            {jobHistory.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${viewMode === 'history' ? 'bg-[#0d1117]/20' : 'bg-white/10'}`}>
                {jobHistory.length}
              </span>
            )}
          </button>
          {/* Templates dropdown */}
          <div className="relative ml-auto">
            <button
              onClick={() => setShowTemplateDropdown(v => !v)}
              className="px-4 py-2.5 rounded-xl font-semibold text-sm bg-white/5 text-white/50 border border-white/10 hover:border-[#FFD700]/40 hover:text-[#FFD700] transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10M4 18h6" /></svg>
              {t('playground.templates')}
              {templates.length > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/10">{templates.length}</span>
              )}
            </button>
            {showTemplateDropdown && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10">
                  <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">{t('playground.saved_templates')}</span>
                </div>
                {templates.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-white/30 text-center">{t('playground.no_templates')}</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {templates.map(tpl => (
                      <div key={tpl.id} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0">
                        <button
                          onClick={() => loadTemplate(tpl)}
                          className="flex-1 text-left"
                        >
                          <div className="text-sm font-medium text-white/80">{tpl.name}</div>
                          <div className="text-xs text-white/30 mt-0.5">{tpl.job_type.replace(/_/g, ' ')} · {tpl.model.split('/').pop()}</div>
                        </button>
                        <button
                          onClick={() => deleteTemplate(tpl.id)}
                          className="ml-2 p-1 text-white/20 hover:text-red-400 transition shrink-0"
                          title={t('playground.delete_template')}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Close template dropdown on outside click */}
        {showTemplateDropdown && (
          <div className="fixed inset-0 z-20" onClick={() => setShowTemplateDropdown(false)} />
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* ── JOB HISTORY VIEW ─────────────────────────────────── */}
        {/* ════════════════════════════════════════════════════════ */}
        {viewMode === 'history' && (
          <div className="space-y-4">

            {/* Viewing a specific job result */}
            {viewingJobId && (
              <div className="space-y-4">
                <button
                  onClick={() => { setViewingJobId(null); setViewingResult(null); setViewingProof(null); }}
                  className="text-sm text-white/40 hover:text-[#00D9FF] transition"
                >
                  &larr; {t('playground.back_to_history')}
                </button>

                {loadingJobResult && (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-2 border-[#00D9FF] border-t-transparent rounded-full" />
                    <span className="ml-3 text-white/50">{t('playground.loading_job_result')}</span>
                  </div>
                )}

                {!loadingJobResult && viewingResult && (
                  <>
                    <div className="bg-white/5 border border-[#FFD700]/30 rounded-xl p-5">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h3 className="text-sm font-semibold text-[#FFD700]">Job summary</h3>
                        <span className="text-xs text-white/50">Raw logs stay in job detail view</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-3">
                        <div className="bg-white/5 rounded-lg px-3 py-2">
                          <div className="text-white/40 text-xs">Status</div>
                          <div className="text-white/90 font-medium">{viewingProof?.status || '—'}</div>
                        </div>
                        <div className="bg-white/5 rounded-lg px-3 py-2">
                          <div className="text-white/40 text-xs">Duration</div>
                          <div className="text-white/90 font-medium">
                            {viewingProof?.actual_duration_minutes != null ? `${viewingProof.actual_duration_minutes} min` : '—'}
                          </div>
                        </div>
                        <div className="bg-white/5 rounded-lg px-3 py-2">
                          <div className="text-white/40 text-xs">Billed cost</div>
                          <div className="text-[#FFD700] font-semibold">
                            {viewingProof?.cost_halala != null ? `${(viewingProof.cost_halala / 100).toFixed(2)} SAR` : '—'}
                          </div>
                        </div>
                        <div className="bg-white/5 rounded-lg px-3 py-2">
                          <div className="text-white/40 text-xs">Model</div>
                          <div className="text-white/90 font-mono text-xs break-all">{viewingResult.model || '—'}</div>
                        </div>
                        <div className="bg-white/5 rounded-lg px-3 py-2 sm:col-span-2">
                          <div className="text-white/40 text-xs">Provider GPU</div>
                          <div className="text-white/90">{viewingProof?.provider_gpu || 'Restricted'}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-4">
                        <button
                          type="button"
                          onClick={retryFromHistorySummary}
                          disabled={retryingHistoryJob}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#00D9FF]/20 text-[#00D9FF] hover:bg-[#00D9FF]/30 transition border border-[#00D9FF]/30 disabled:opacity-50"
                        >
                          {retryingHistoryJob ? 'Retrying...' : 'Retry same params'}
                        </button>
                        <button
                          type="button"
                          onClick={runVariantFromHistorySummary}
                          disabled={viewingResult.type !== 'text' || !selectVariantModel(viewingResult.model || null)}
                          title={viewingResult.type !== 'text' ? 'Variant action is available for text jobs' : ''}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#FFD700]/15 text-[#FFD700] hover:bg-[#FFD700]/25 transition border border-[#FFD700]/30 disabled:opacity-50"
                        >
                          Run cheaper/faster variant
                        </button>
                        <button
                          type="button"
                          onClick={exportViewingOutputAsJson}
                          disabled={!viewingResult}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/15 transition border border-white/20 disabled:opacity-50"
                        >
                          Download JSON
                        </button>
                        <button
                          type="button"
                          onClick={exportViewingOutputAsMarkdown}
                          disabled={!viewingResult}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/80 hover:bg-white/15 transition border border-white/20 disabled:opacity-50"
                        >
                          Download MD
                        </button>
                      </div>
                      {historyActionError && (
                        <p className="text-xs text-red-300 mt-2">{historyActionError}</p>
                      )}
                    </div>

                    {/* IMAGE Result */}
                    {viewingResult.type === 'image' && viewingResult.image_base64 && (
                      <div className="bg-[#A855F7]/5 border border-[#A855F7]/20 rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-3 h-3 rounded-full bg-[#A855F7]" />
                          <span className="text-[#A855F7] font-semibold text-sm">{t('playground.generated_image')}</span>
                          <span className="text-white/30 text-xs ml-auto">{viewingResult.model?.split('/').pop()} &bull; {viewingResult.width}x{viewingResult.height} &bull; {viewingResult.steps} steps</span>
                        </div>
                        <div className="flex justify-center">
                          <img
                            src={`data:image/png;base64,${viewingResult.image_base64}`}
                            alt={viewingResult.prompt}
                            className="rounded-lg max-w-full border border-white/10"
                            style={{ maxHeight: '512px' }}
                          />
                        </div>
                        <p className="text-white/50 text-xs mt-3 text-center italic">&ldquo;{viewingResult.prompt}&rdquo;</p>
                        {viewingResult.seed != null && viewingResult.seed >= 0 && (
                          <p className="text-white/30 text-xs text-center mt-1">{t('playground.seed')}: {viewingResult.seed}</p>
                        )}
                        <ImageDownloadButtons imageBase64={viewingResult.image_base64} jobIdNum={viewingJobId} jobLabel={viewingProof?.job_id || String(viewingJobId)} />
                      </div>
                    )}

                    {/* TEXT Result */}
                    {viewingResult.type === 'text' && viewingResult.response && (
                      <div className="bg-[#00D9FF]/5 border border-[#00D9FF]/20 rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-3 h-3 rounded-full bg-[#00D9FF]" />
                          <span className="text-[#00D9FF] font-semibold text-sm">{t('playground.ai_response')}</span>
                          <span className="text-white/30 text-xs ml-auto">{viewingResult.model?.split('/').pop()}</span>
                        </div>
                        <p className="text-white/90 leading-relaxed text-lg">{viewingResult.response}</p>
                      </div>
                    )}

                    {/* Execution Proof */}
                    {viewingProof && (
                      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <span className="font-semibold text-sm">{t('playground.execution_proof')}</span>
                        </div>
                        <div className="p-6">
                          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                            <ProofRow label={t('playground.proof.job_id')} value={viewingProof.job_id} />
                            <ProofRow label={t('playground.proof.status')} value={viewingProof.status} highlight />
                            <ProofRow label={t('playground.proof.device')} value={viewingResult.device?.toUpperCase() || '—'} highlight={viewingResult.device === 'cuda'} />
                            <ProofRow label={t('playground.proof.model')} value={viewingResult.model || '—'} />
                            {viewingResult.type === 'text' && (
                              <>
                                <ProofRow label={t('playground.proof.tokens_generated')} value={String(viewingResult.tokens_generated || 0)} />
                                <ProofRow label={t('playground.proof.speed')} value={`${viewingResult.tokens_per_second || 0} tok/s`} highlight />
                              </>
                            )}
                            {viewingResult.type === 'image' && (
                              <>
                                <ProofRow label={t('playground.proof.dimensions')} value={`${viewingResult.width}x${viewingResult.height}`} />
                                <ProofRow label={t('playground.proof.steps')} value={String(viewingResult.steps || 0)} />
                              </>
                            )}
                            <ProofRow label={t('playground.proof.generation_time')} value={`${viewingResult.gen_time_s || 0}s`} />
                            <ProofRow label={t('playground.proof.total_execution')} value={`${viewingResult.total_time_s || 0}s`} />
                            <ProofRow label={t('playground.proof.cost')} value={`${viewingProof.cost_halala} halala (${(viewingProof.cost_halala / 100).toFixed(2)} SAR)`} />
                            <ProofRow label={t('playground.proof.provider_earned')} value={`${viewingProof.provider_earned_halala} halala (75%)`} />
                            <ProofRow label={t('playground.proof.dcp_fee')} value={`${viewingProof.dc1_fee_halala} halala (25%)`} />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!loadingJobResult && !viewingResult && (
                  <div className="text-center py-12 text-white/40">
                    <p>{t('playground.no_output_title')}</p>
                    <p className="text-xs mt-1">{t('playground.no_output_desc')}</p>
                  </div>
                )}
              </div>
            )}

            {/* Job list */}
            {!viewingJobId && (
              <>
                {jobHistory.length === 0 ? (
                  <div className="text-center py-16 text-white/40">
                    <div className="text-4xl mb-3">📋</div>
                    <p className="font-medium">{t('playground.no_jobs_title')}</p>
                    <p className="text-sm mt-1">{t('playground.no_jobs_desc')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {jobHistory.map(job => {
                      const isImage = job.job_type === 'image_generation';
                      const isVllm = job.job_type === 'vllm_serve';
                      const isCompleted = job.status === 'completed';
                      const isRunningJob = job.status === 'running';
                      const canView = isCompleted && !isVllm;
                      const duration = job.completed_at && job.submitted_at
                        ? Math.round((new Date(job.completed_at).getTime() - new Date(job.submitted_at).getTime()) / 1000)
                        : 0;
                      const jobIcon = isVllm ? '⚡' : isImage ? '🎨' : '💬';
                      const jobLabel = isVllm ? t('playground.job_type.vllm_serve') : isImage ? t('playground.job_type.image_generation') : t('playground.job_type.llm_inference');

                      return (
                        <button
                          key={job.id}
                          onClick={() => canView ? loadJobResult(job) : undefined}
                          disabled={!canView}
                          className={`w-full text-left px-5 py-4 rounded-xl border transition ${
                            canView
                              ? 'border-white/10 bg-white/5 hover:border-[#00D9FF]/40 hover:bg-white/[0.07] cursor-pointer'
                              : 'border-white/5 bg-white/[0.02] cursor-default opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-lg">{jobIcon}</span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-white/80">
                                    {job.job_id || `#${job.id}`}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    isCompleted ? 'bg-green-500/20 text-green-400' :
                                    job.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                    isRunningJob ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-white/10 text-white/40'
                                  }`}>
                                    {isVllm && isRunningJob ? t('playground.serving') : job.status}
                                  </span>
                                </div>
                                <div className="text-xs text-white/40 mt-0.5">
                                  {jobLabel}
                                  {' — '}
                                  {new Date(job.submitted_at).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-[#FFD700]">
                                {job.actual_cost_halala > 0 ? `${(job.actual_cost_halala / 100).toFixed(2)} SAR` : '—'}
                              </div>
                              {duration > 0 && (
                                <div className="text-xs text-white/30">{duration >= 60 ? `${Math.floor(duration/60)}m` : `${duration}s`}</div>
                              )}
                            </div>
                          </div>
                          {canView && (
                            <div className="text-xs text-[#00D9FF]/60 mt-2">{t('playground.click_view_result')}{isImage ? ` ${t('playground.click_download_image')}` : ''}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* ── NEW JOB VIEW ─────────────────────────────────────── */}
        {/* ════════════════════════════════════════════════════════ */}
        {viewMode === 'new' && (
          <>
            {showFirstJobWizard && (
              <div className="mb-6 rounded-xl border border-[#FFD700]/30 bg-[#FFD700]/5 p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-sm font-semibold text-[#FFD700]">First Job Wizard</h2>
                  <div className="text-xs text-white/50">Preset → Fit → Submit</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                  {FIRST_JOB_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isRunning}
                      onClick={() => applyFirstJobPreset(preset.id)}
                      className={`text-left px-3 py-3 rounded-lg border transition ${
                        selectedPresetId === preset.id
                          ? 'border-[#FFD700] bg-[#FFD700]/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      } disabled:opacity-60`}
                    >
                      <div className="text-sm font-medium text-white">{preset.title}</div>
                      <div className="text-xs text-white/45 mt-0.5">{preset.description}</div>
                    </button>
                  ))}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-xs text-white/60">
                    Step 2: confirm fit before submit.
                    {selectedPresetId ? ' Preset selected.' : ' Select a preset to continue.'}
                  </p>
                  <button
                    type="button"
                    disabled={!selectedPresetId || isRunning}
                    onClick={() => setFitConfirmed(true)}
                    className={`mt-2 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                      fitConfirmed
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                        : 'bg-[#00D9FF]/20 text-[#00D9FF] border border-[#00D9FF]/30 hover:bg-[#00D9FF]/30'
                    } disabled:opacity-50`}
                  >
                    {fitConfirmed ? 'Fit confirmed' : 'Confirm fit'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Job Type Toggle ─────────────────────────────────── */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => { if (!isRunning) setJobType('llm_inference'); }}
                disabled={isRunning}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition ${
                  jobType === 'llm_inference'
                    ? 'bg-[#00D9FF] text-[#0d1117]'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:border-white/20'
                } disabled:opacity-60`}
              >
                <span className="mr-2">💬</span> {t('playground.job_type.llm_inference')}
              </button>
              <button
                onClick={() => { if (!isRunning) setJobType('image_generation'); }}
                disabled={isRunning}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition ${
                  jobType === 'image_generation'
                    ? 'bg-[#A855F7] text-white'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:border-white/20'
                } disabled:opacity-60`}
              >
                <span className="mr-2">🎨</span> {t('playground.job_type.image_generation_short')}
              </button>
              <button
                onClick={() => { if (!isRunning) setJobType('vllm_serve'); }}
                disabled={isRunning}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition ${
                  jobType === 'vllm_serve'
                    ? 'bg-green-500 text-[#0d1117]'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:border-white/20'
                } disabled:opacity-60`}
              >
                <span className="mr-2">⚡</span> {t('playground.job_type.vllm_serve')}
              </button>
            </div>

            {/* ── Form ──────────────────────────────────────────── */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6 space-y-5">

              {/* Model */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">
                  {t('playground.model')}
                  {catalogLoaded && <span className="ml-2 text-xs text-white/30">({catalogModels.length} models from catalog)</span>}
                </label>
                {jobType === 'llm_inference' ? (
                  <select className={inputCls} value={llmModel} onChange={e => setLlmModel(e.target.value)} disabled={isRunning}>
                    {LLM_MODELS.map(m => (
                      <option
                        key={m.id}
                        value={m.id}
                        disabled={catalogLoaded && m.providers_online === 0}
                      >
                        {m.providers_online > 0 ? '\u25CF' : '\u25CB'} {m.label} — {m.vram} VRAM{m.speed ? `, ${m.speed}` : ''}{catalogLoaded ? ` (${m.providers_online} provider${m.providers_online !== 1 ? 's' : ''})` : ''}
                      </option>
                    ))}
                  </select>
                ) : jobType === 'image_generation' ? (
                  <select className={inputCls} value={sdModel} onChange={e => setSdModel(e.target.value)} disabled={isRunning}>
                    {SD_MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.label} — {m.vram} VRAM, {m.speed}</option>
                    ))}
                  </select>
                ) : (
                  <select className={inputCls} value={vllmModel} onChange={e => setVllmModel(e.target.value)} disabled={isRunning}>
                    {VLLM_MODELS.map(m => (
                      <option
                        key={m.id}
                        value={m.id}
                        disabled={catalogLoaded && m.providers_online === 0}
                      >
                        {m.providers_online > 0 ? '\u25CF' : '\u25CB'} {m.label} — {m.vram} VRAM{catalogLoaded ? ` (${m.providers_online} provider${m.providers_online !== 1 ? 's' : ''})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = !advancedOpen;
                  setAdvancedOpen(next);
                  if (next) {
                    trackPlaygroundEvent('playground_advanced_expanded', { job_type: jobType });
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-white/70 hover:border-white/20 transition"
              >
                <span>Advanced controls</span>
                <span className="text-white/40">{advancedOpen ? 'Hide' : 'Show'}</span>
              </button>

              {advancedOpen && (
                <div className="border border-white/10 rounded-xl p-4 space-y-4 bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[#F5A524]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span className="text-sm font-semibold text-white/80">{t('playground.container')}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Image Type */}
                    <div>
                      <label className="block text-xs text-white/50 mb-1.5">{t('playground.image_type')}</label>
                      <select
                        className={inputCls}
                        value={imageType}
                        onChange={e => setImageType(e.target.value as ImageType)}
                        disabled={isRunning}
                      >
                        {(containerImages.length > 0
                          ? containerImages
                          : ['pytorch-cuda', 'vllm-serve', 'training', 'rendering']
                        ).map(img => (
                          <option key={img} value={img}>{img}</option>
                        ))}
                      </select>
                      <p className="text-xs text-white/30 mt-1">
                        {t('playground.compute_type')}: <span className="text-[#F5A524]">{IMAGE_TYPE_TO_COMPUTE[imageType]}</span>
                      </p>
                    </div>

                    {/* GPU Count */}
                    <div>
                      <label className="block text-xs text-white/50 mb-1.5">{t('playground.gpu_count')}</label>
                      <div className="flex gap-2">
                        {([1, 2, 4] as const).map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setGpuCount(n)}
                            disabled={isRunning}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition ${
                              gpuCount === n
                                ? 'border-[#F5A524] bg-[#F5A524]/10 text-[#F5A524]'
                                : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
                            } disabled:opacity-50`}
                          >
                            {n}×
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* VRAM Slider */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs text-white/50">{t('playground.vram_required')}</label>
                      <span className="text-xs text-[#F5A524] font-semibold">
                        {VRAM_OPTIONS.find(o => o.value === vramRequiredMb)?.label ?? `${vramRequiredMb / 1024} GB`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={VRAM_OPTIONS.length - 1}
                      step={1}
                      className="w-full accent-[#F5A524]"
                      value={VRAM_OPTIONS.findIndex(o => o.value === vramRequiredMb)}
                      onChange={e => setVramRequiredMb(VRAM_OPTIONS[Number(e.target.value)].value)}
                      disabled={isRunning}
                    />
                    <div className="flex justify-between text-xs text-white/25 mt-1">
                      {VRAM_OPTIONS.map(o => <span key={o.value}>{o.label}</span>)}
                    </div>
                  </div>

                  {/* Queue wait estimate */}
                  {queueWait !== null && queueWait > 0 && (
                    <div className="flex items-center gap-2 text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {t('playground.jobs_ahead').replace('{count}', String(queueWait))}
                    </div>
                  )}
                  {queueWait === 0 && (
                    <div className="flex items-center gap-2 text-xs text-green-400/80 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t('playground.no_queue')}
                    </div>
                  )}
                </div>
              )}

              {/* Provider */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">{t('playground.gpu_provider')}</label>
                {loadingProviders ? (
                  <div className="animate-pulse bg-white/10 rounded-lg h-12" />
                ) : providers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {providers.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProviderId(p.id)}
                        disabled={isRunning}
                        className={`text-left px-4 py-3 rounded-lg border transition ${
                          providerId === p.id
                            ? 'border-[#00D9FF] bg-[#00D9FF]/10'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="font-medium text-sm">{p.gpu_model}</div>
                        <div className="text-white/40 text-xs">{p.name} &bull; {p.vram_gb || '?'}GB VRAM</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-white/40 text-sm py-3 px-4 bg-white/5 rounded-lg border border-white/10">
                    {t('playground.no_online_providers')}
                  </div>
                )}
              </div>

              {/* Prompt — hidden for vllm_serve */}
              {jobType !== 'vllm_serve' && (
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-sm text-white/60">{t('playground.prompt')}</label>
                    <span className="text-xs text-white/30">{prompt.length} / 10,000</span>
                  </div>
                  <textarea
                    ref={promptRef}
                    rows={jobType === 'image_generation' ? 2 : 3}
                    placeholder={jobType === 'image_generation'
                      ? t('playground.image_prompt_placeholder')
                      : t('playground.text_prompt_placeholder')}
                    className={`${inputCls} resize-y`}
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    disabled={isRunning}
                  />
                </div>
              )}

              {/* Image Gen specific fields */}
              {advancedOpen && jobType === 'image_generation' && (
                <>
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">{t('playground.negative_prompt')} <span className="text-white/30">({t('playground.optional')})</span></label>
                    <input type="text" placeholder={t('playground.negative_prompt_placeholder')} className={inputCls} value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)} disabled={isRunning} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-white/60 mb-1.5">{t('playground.steps')}: {steps}</label>
                      <input type="range" min={5} max={50} step={5} className="w-full accent-[#A855F7] mt-2" value={steps} onChange={e => setSteps(Number(e.target.value))} disabled={isRunning} />
                    </div>
                    <div>
                      <label className="block text-sm text-white/60 mb-1.5">{t('playground.seed')} <span className="text-white/30">({t('playground.seed_hint')})</span></label>
                      <input type="number" min={-1} max={2147483647} className={inputCls} value={seed} onChange={e => setSeed(Number(e.target.value))} disabled={isRunning} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-white/60 mb-1.5">{t('playground.width')}</label>
                      <select className={inputCls} value={imgWidth} onChange={e => setImgWidth(Number(e.target.value))} disabled={isRunning}>
                        {[256, 384, 512, 640, 768, 1024].map(v => (
                          <option key={v} value={v}>{v}px</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-white/60 mb-1.5">{t('playground.height')}</label>
                      <select className={inputCls} value={imgHeight} onChange={e => setImgHeight(Number(e.target.value))} disabled={isRunning}>
                        {[256, 384, 512, 640, 768, 1024].map(v => (
                          <option key={v} value={v}>{v}px</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* LLM-specific fields */}
              {advancedOpen && jobType === 'llm_inference' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">{t('playground.max_tokens')}</label>
                    <input type="number" min={32} max={16384} className={inputCls} value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} disabled={isRunning} />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">{t('playground.temperature')}: {temperature.toFixed(1)}</label>
                    <input type="range" min={0.1} max={2.0} step={0.1} className="w-full accent-[#00D9FF] mt-2" value={temperature} onChange={e => setTemperature(Number(e.target.value))} disabled={isRunning} />
                  </div>
                </div>
              )}

              {/* vLLM Serve-specific fields */}
              {advancedOpen && jobType === 'vllm_serve' && (
                <>
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-300/80">
                    {t('playground.vllm_intro')}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-white/60 mb-1.5">{t('playground.duration')}</label>
                      <select className={inputCls} value={vllmDuration} onChange={e => setVllmDuration(Number(e.target.value))} disabled={isRunning}>
                        <option value={15}>{t('playground.minutes_15')}</option>
                        <option value={30}>{t('playground.minutes_30')}</option>
                        <option value={60}>{t('playground.minutes_60')}</option>
                        <option value={120}>{t('playground.minutes_120')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-white/60 mb-1.5">{t('playground.precision')}</label>
                      <select className={inputCls} value={vllmDtype} onChange={e => setVllmDtype(e.target.value as typeof vllmDtype)} disabled={isRunning}>
                        <option value="float16">{t('playground.float16_recommended')}</option>
                        <option value="bfloat16">bfloat16</option>
                        <option value="float32">{t('playground.float32_slow')}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">{t('playground.max_context_length')}: {vllmMaxModelLen.toLocaleString()} {t('playground.tokens')}</label>
                    <input type="range" min={512} max={8192} step={512} className="w-full accent-green-500 mt-1" value={vllmMaxModelLen} onChange={e => setVllmMaxModelLen(Number(e.target.value))} disabled={isRunning} />
                    <div className="flex justify-between text-xs text-white/30 mt-1">
                      <span>512</span><span>8192</span>
                    </div>
                  </div>
                </>
              )}

              {/* Cost estimate */}
              <div className="flex justify-between text-xs text-white/40 px-1">
                {jobType === 'vllm_serve'
                  ? <span>{t('playground.est_cost_duration')}: ~{rate * vllmDuration} halala ({(rate * vllmDuration / 100).toFixed(2)} SAR) {t('playground.for')} {vllmDuration} {t('playground.min')}</span>
                  : <span>{t('playground.est_cost')}: ~{rate} halala ({(rate / 100).toFixed(2)} SAR) {t('playground.per_minute')}</span>
                }
                <span>{t('playground.rate')}: {rate} halala/{t('playground.min')}</span>
              </div>

              <div className="rounded-xl border border-[#00D9FF]/25 bg-[#00D9FF]/5 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#7CE8FF]">Submission readiness</p>
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
                  <p className="text-white/45">Estimated cost range</p>
                  <p className="text-white/90 font-medium">
                    {(estimatedMinHalala / 100).toFixed(2)}–{(estimatedMaxHalala / 100).toFixed(2)} SAR
                  </p>
                </div>
                <div className="space-y-2">
                  {readinessChecks.map((check) => (
                    <div key={check.key} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-white/80 font-medium">{check.label}</p>
                        <span className={check.passing ? 'text-green-300' : 'text-red-300'}>
                          {check.passing ? 'PASS' : check.required ? 'FAIL' : 'INFO'}
                        </span>
                      </div>
                      <p className="mt-1 text-white/55">{check.detail}</p>
                    </div>
                  ))}
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
                    <p className="text-white/45">Provider recommendation</p>
                    <p className="text-white/90 font-medium">
                      {recommendedProvider
                        ? `${recommendedProvider.gpu_model} (${recommendedProvider.vram_gb || '?'} GB)`
                        : 'No online providers'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
                    <p className="text-white/45">Balance check</p>
                    <p className={`font-medium ${isBalanceSufficient ? 'text-green-300' : 'text-red-300'}`}>
                      {renterBalance == null
                        ? 'Balance unavailable'
                        : isBalanceSufficient
                        ? `${renterBalance.toFixed(2)} SAR available`
                        : `${renterBalance.toFixed(2)} SAR available (top up needed)`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={submitJob}
                disabled={isSubmitDisabled}
                className={`w-full py-3.5 rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition text-lg ${
                  jobType === 'image_generation'
                    ? 'bg-[#A855F7] text-white hover:bg-[#A855F7]/90'
                    : jobType === 'vllm_serve'
                    ? 'bg-green-500 text-[#0d1117] hover:bg-green-500/90'
                    : 'bg-[#00D9FF] text-[#0d1117] hover:bg-[#00D9FF]/90'
                }`}
              >
                {isRunning ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    {getProgressLabel()}
                  </span>
                ) : jobType === 'image_generation' ? t('playground.generate_image') : jobType === 'vllm_serve' ? t('playground.start_vllm_server') : t('playground.run_inference')}
              </button>
              {primaryBlocker && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <p className="text-sm text-red-200">{primaryBlocker.reason}</p>
                  <button
                    type="button"
                    onClick={primaryBlocker.onRecover}
                    className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-md border border-red-300/40 text-red-100 hover:bg-red-400/20 transition"
                  >
                    {primaryBlocker.ctaLabel}
                  </button>
                </div>
              )}
            </div>

            {/* ── Error ─────────────────────────────────────────── */}
            {phase === 'error' && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 mb-6">
                <h3 className="text-red-400 font-semibold mb-1">{t('playground.job_failed')}</h3>
                <p className="text-red-300/80 text-sm">{errorMsg}</p>
                <button onClick={() => setPhase('idle')} className="mt-3 text-sm text-red-400 hover:text-red-300 underline">{t('playground.try_again')}</button>
              </div>
            )}

            {/* ── vLLM Endpoint Result ─────────────────────────────── */}
            {phase === 'done' && jobType === 'vllm_serve' && (
              <div className="space-y-4">
                {endpointUrl ? (
                  <div className="bg-green-500/5 border border-green-500/30 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-green-400 font-semibold">{t('playground.vllm_ready')}</span>
                    </div>
                    <p className="text-white/50 text-sm mb-3">{t('playground.vllm_ready_desc')}</p>
                    <div className="flex items-center gap-2 bg-black/40 rounded-lg px-4 py-3 mb-4">
                      <code className="flex-1 text-green-300 font-mono text-sm break-all">{endpointUrl}</code>
                      <button
                        onClick={copyEndpoint}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 transition"
                      >
                        {copiedEndpoint ? t('playground.copied') : t('playground.copy')}
                      </button>
                    </div>
                    <div className="bg-black/40 rounded-lg p-4">
                      <p className="text-white/40 text-xs mb-2 font-medium">{t('playground.example_usage_python')}</p>
                      <pre className="text-green-300/70 font-mono text-xs overflow-x-auto whitespace-pre">{`from openai import OpenAI
client = OpenAI(base_url="${endpointUrl}", api_key="dc1")
response = client.chat.completions.create(
    model="${vllmModel}",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`}</pre>
                    </div>
                    {proof && (
                      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm border-t border-white/10 pt-4">
                        <ProofRow label={t('playground.proof.job_id')} value={proof.job_id} />
                        <ProofRow label={t('playground.proof.model')} value={vllmModel.split('/').pop() || vllmModel} />
                        <ProofRow label={t('playground.proof.cost')} value={`${proof.cost_halala} halala (${(proof.cost_halala / 100).toFixed(2)} SAR)`} />
                        <ProofRow label={t('playground.duration')} value={`${vllmDuration} ${t('playground.min')} ${t('playground.reserved')}`} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
                    <p className="text-white/50">{t('playground.vllm_session_ended')}</p>
                  </div>
                )}
                <button
                  onClick={resetForm}
                  className="w-full py-3 rounded-xl font-semibold border border-green-500/30 text-green-400 hover:bg-green-500/10 transition"
                >
                  {t('playground.start_another_server')}
                </button>
              </div>
            )}

            {/* ── Result ──────────────────────────────────────────── */}
            {result && jobType !== 'vllm_serve' && (
              <div className="space-y-4">

                {/* IMAGE Result */}
                {result.type === 'image' && result.image_base64 && (
                  <div className="bg-[#A855F7]/5 border border-[#A855F7]/20 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 rounded-full bg-[#A855F7]" />
                      <span className="text-[#A855F7] font-semibold text-sm">{t('playground.generated_image')}</span>
                      <span className="text-white/30 text-xs ml-auto">{result.model?.split('/').pop()} &bull; {result.width}x{result.height} &bull; {result.steps} {t('playground.steps').toLowerCase()}</span>
                    </div>
                    <div className="flex justify-center">
                      <img
                        src={`data:image/png;base64,${result.image_base64}`}
                        alt={result.prompt}
                        className="rounded-lg max-w-full border border-white/10"
                        style={{ maxHeight: '512px' }}
                      />
                    </div>
                    <p className="text-white/50 text-xs mt-3 text-center italic">&ldquo;{result.prompt}&rdquo;</p>
                    {result.seed != null && result.seed >= 0 && (
                      <p className="text-white/30 text-xs text-center mt-1">{t('playground.seed')}: {result.seed}</p>
                    )}
                    <ImageDownloadButtons imageBase64={result.image_base64} jobIdNum={jobId!} jobLabel={jobStringId || String(jobId)} />
                  </div>
                )}

                {/* TEXT Result */}
                {(result.type === 'text' || result.type === 'llm_inference') && result.response && (
                  <div className="bg-[#00D9FF]/5 border border-[#00D9FF]/20 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full bg-[#00D9FF]" />
                      <span className="text-[#00D9FF] font-semibold text-sm">{t('playground.ai_response')}</span>
                      <span className="text-white/30 text-xs ml-auto">{result.model?.split('/').pop()}</span>
                    </div>
                    <p className="text-white/90 leading-relaxed text-lg">{result.response}</p>
                  </div>
                )}

                {/* Execution Proof */}
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="font-semibold text-sm">{t('playground.execution_proof')}</span>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                      <ProofRow label={t('playground.proof.job_id')} value={proof?.job_id || `#${jobId}`} />
                      <ProofRow label={t('playground.proof.status')} value={proof?.status || t('playground.completed')} highlight />
                      <ProofRow label={t('playground.proof.provider')} value={proof?.provider_name || '—'} />
                      <ProofRow label={t('playground.proof.gpu')} value={proof?.provider_gpu || '—'} />
                      <ProofRow label={t('playground.proof.hostname')} value={proof?.provider_hostname || '—'} />
                      <ProofRow label={t('playground.proof.device')} value={result.device?.toUpperCase() || '—'} highlight={result.device === 'cuda'} />
                      <ProofRow label={t('playground.proof.model')} value={result.model || '—'} />
                      {result.type === 'text' && (
                        <>
                          <ProofRow label={t('playground.proof.tokens_generated')} value={String(result.tokens_generated || 0)} />
                          <ProofRow label={t('playground.proof.speed')} value={`${result.tokens_per_second || 0} tok/s`} highlight />
                        </>
                      )}
                      {result.type === 'image' && (
                        <>
                          <ProofRow label={t('playground.proof.dimensions')} value={`${result.width}x${result.height}`} />
                          <ProofRow label={t('playground.proof.steps')} value={String(result.steps || 0)} />
                          {result.seed != null && <ProofRow label={t('playground.seed')} value={String(result.seed)} />}
                        </>
                      )}
                      <ProofRow label={t('playground.proof.generation_time')} value={`${result.gen_time_s || 0}s`} />
                      <ProofRow label={t('playground.proof.total_execution')} value={`${result.total_time_s || 0}s`} />
                      <ProofRow label={t('playground.proof.cost')} value={proof ? `${proof.cost_halala} halala (${(proof.cost_halala / 100).toFixed(2)} SAR)` : '—'} />
                      <ProofRow label={t('playground.proof.provider_earned')} value={proof ? `${proof.provider_earned_halala} halala (75%)` : '—'} />
                      <ProofRow label={t('playground.proof.dcp_fee')} value={proof ? `${proof.dc1_fee_halala} halala (25%)` : '—'} />
                    </div>
                  </div>
                </div>

                {/* Raw Log */}
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowRawLog(!showRawLog)}
                    className="w-full px-6 py-3 flex items-center gap-2 text-sm text-white/60 hover:text-white/80 transition"
                  >
                    <svg className={`w-3 h-3 transition-transform ${showRawLog ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    {t('playground.raw_daemon_log')}
                  </button>
                  {showRawLog && (
                    <div className="px-6 pb-4">
                      <pre className="bg-black/40 rounded-lg p-4 text-xs text-green-400/80 font-mono overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {proof?.raw_log || result?.response || t('playground.no_raw_log')}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Save as Template */}
                {templateSaved ? (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {t('playground.template_saved')}
                  </div>
                ) : (
                  <button
                    onClick={() => { setTemplateName(''); setSaveTemplateModal(true); }}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm border border-[#FFD700]/30 text-[#FFD700] hover:bg-[#FFD700]/10 transition flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                    {t('playground.save_as_template')}
                  </button>
                )}

                {/* Run Another */}
                <button
                  onClick={resetForm}
                  className={`w-full py-3 rounded-xl font-semibold border transition ${
                    jobType === 'image_generation'
                      ? 'border-[#A855F7]/30 text-[#A855F7] hover:bg-[#A855F7]/10'
                      : 'border-[#00D9FF]/30 text-[#00D9FF] hover:bg-[#00D9FF]/10'
                  }`}
                >
                  {jobType === 'image_generation' ? t('playground.generate_another_image') : t('playground.run_another_prompt')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {/* Save Template Modal */}
    {saveTemplateModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-labelledby="save-tpl-title">
        <div className="bg-[#1a1f2e] border border-white/10 rounded-xl w-full max-w-sm p-6 space-y-4">
          <h2 id="save-tpl-title" className="text-base font-bold text-white">{t('playground.save_as_template')}</h2>
          <p className="text-white/40 text-sm">{t('playground.save_template_desc')}</p>
          <input
            type="text"
            placeholder={t('playground.template_name_placeholder')}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#FFD700]/60 transition text-sm"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); }}
            autoFocus
            maxLength={120}
          />
          {templateError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{templateError}</p>
          )}
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => { setSaveTemplateModal(false); setTemplateError(''); }}
              disabled={savingTemplate}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 text-white/50 hover:bg-white/10 border border-white/10 transition"
            >
              {t('playground.cancel')}
            </button>
            <button
              onClick={saveTemplate}
              disabled={savingTemplate || !templateName.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#FFD700] text-[#0d1117] hover:bg-[#FFD700]/90 disabled:opacity-50 transition flex items-center gap-2"
            >
              {savingTemplate && <span className="animate-spin h-3.5 w-3.5 border-2 border-[#0d1117] border-t-transparent rounded-full" />}
              {t('playground.save')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function ProofRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-white/40">{label}</span>
      <span className={highlight ? 'text-[#00D9FF] font-medium' : 'text-white/80'}>{value}</span>
    </div>
  );
}
