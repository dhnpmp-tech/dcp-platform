'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../../components/layout/DashboardLayout'
import { useLanguage } from '../../../lib/i18n'
import {
  buildRenterLoginRedirect,
  buildRenterPlaygroundPath,
  setPendingRenterAuthIntent,
  type RenterAuthIntent,
  type RenterJobType,
} from '../../../lib/renter-auth-intent'

// ── Nav icons ─────────────────────────────────────────────────────────────────
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m0 0l4 4m-4-4V5" />
  </svg>
)
const MarketplaceIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
)
const ModelsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)
const JobsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const BillingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m4 0h1M9 19h6a2 2 0 002-2V5a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const PlaygroundIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)

// ── Template data (static — loaded from docker-templates/*.json at build/runtime) ──
// These match the files in docker-templates/ exactly.
// Hyperscaler reference prices (SAR/hr) for savings calculation:
// AWS p3.2xlarge (~V100 16GB): ~73 SAR/hr; A10G: ~28 SAR/hr; RunPod RTX 4090: ~14 SAR/hr
const HYPERSCALER_SAR_PER_HR_FALLBACK = 14.0  // RunPod RTX 4090 baseline

interface Template {
  id: string
  name: string
  description: string
  icon: string
  category: TemplateCategory
  min_vram_gb: number
  estimated_price_sar_per_hour: number
  hyperscaler_price_sar_per_hour?: number
  tags: string[]
  difficulty: 'easy' | 'medium' | 'advanced'
  is_arabic: boolean
  sort_order: number
}

type TemplateCategory = 'Arabic AI' | 'LLM' | 'Training' | 'Dev Tools' | 'Image'

const TEMPLATES: Template[] = [
  // ── Arabic AI ──────────────────────────────────────────────────────────────
  {
    id: 'arabic-rag-complete',
    name: 'Arabic RAG Pipeline',
    description: 'Full-stack Arabic RAG: BGE-M3 embeddings + BGE reranker + ALLaM/JAIS. PDPL-compliant, in-kingdom. Enterprise document retrieval.',
    icon: '🔍',
    category: 'Arabic AI',
    min_vram_gb: 40,
    estimated_price_sar_per_hour: 45,
    hyperscaler_price_sar_per_hour: 110,
    tags: ['rag', 'arabic', 'nlp', 'embedding', 'reranking', 'llm', 'pdpl-compliant', 'enterprise'],
    difficulty: 'easy',
    is_arabic: true,
    sort_order: 1,
  },
  {
    id: 'arabic-embeddings',
    name: 'Arabic Embeddings API',
    description: 'High-throughput embedding service for Arabic and bilingual retrieval pipelines using BAAI/bge-m3.',
    icon: '🌙',
    category: 'Arabic AI',
    min_vram_gb: 8,
    estimated_price_sar_per_hour: 9,
    hyperscaler_price_sar_per_hour: 25,
    tags: ['llm', 'embedding', 'rag', 'arabic'],
    difficulty: 'easy',
    is_arabic: true,
    sort_order: 2,
  },
  {
    id: 'arabic-reranker',
    name: 'Arabic Reranker API',
    description: 'Semantic reranking for Arabic search and RAG quality uplift. Improves retrieval precision by 30–40%.',
    icon: '🌙',
    category: 'Arabic AI',
    min_vram_gb: 8,
    estimated_price_sar_per_hour: 11,
    hyperscaler_price_sar_per_hour: 25,
    tags: ['llm', 'reranker', 'rag', 'arabic'],
    difficulty: 'easy',
    is_arabic: true,
    sort_order: 3,
  },
  {
    id: 'qwen25-7b',
    name: 'Qwen 2.5 7B',
    description: 'Alibaba Qwen 2.5 7B Instruct — strong multilingual model with Arabic support. OpenAI-compatible.',
    icon: '🌐',
    category: 'Arabic AI',
    min_vram_gb: 16,
    estimated_price_sar_per_hour: 9,
    hyperscaler_price_sar_per_hour: 22,
    tags: ['llm', 'inference', 'qwen', 'arabic', 'multilingual', 'openai-compatible'],
    difficulty: 'easy',
    is_arabic: true,
    sort_order: 4,
  },
  {
    id: 'llama3-8b',
    name: 'Llama 3 8B Instruct',
    description: 'Meta Llama 3 8B Instruct — fast, capable LLM for chat, summarization, and reasoning. OpenAI-compatible.',
    icon: '🦙',
    category: 'Arabic AI',
    min_vram_gb: 16,
    estimated_price_sar_per_hour: 9,
    hyperscaler_price_sar_per_hour: 22,
    tags: ['llm', 'inference', 'llama', 'meta', 'openai-compatible', 'arabic'],
    difficulty: 'easy',
    is_arabic: true,
    sort_order: 5,
  },
  {
    id: 'mistral-7b',
    name: 'Mistral 7B Instruct',
    description: 'Mistral AI 7B Instruct — strong reasoning and coding. Low latency, low cost. OpenAI-compatible.',
    icon: '🌊',
    category: 'Arabic AI',
    min_vram_gb: 16,
    estimated_price_sar_per_hour: 8,
    hyperscaler_price_sar_per_hour: 22,
    tags: ['llm', 'inference', 'mistral', 'openai-compatible', 'coding', 'reasoning', 'arabic'],
    difficulty: 'easy',
    is_arabic: true,
    sort_order: 6,
  },
  // ── LLM ───────────────────────────────────────────────────────────────────
  {
    id: 'nemotron-nano',
    name: 'Nemotron Nano 4B',
    description: 'NVIDIA Nemotron-Mini 4B Instruct — compact, efficient LLM optimized for instruction following. Fits in 8 GB.',
    icon: '⚡',
    category: 'LLM',
    min_vram_gb: 8,
    estimated_price_sar_per_hour: 5,
    hyperscaler_price_sar_per_hour: 14,
    tags: ['llm', 'inference', 'nvidia', 'nemotron', 'efficient', 'openai-compatible'],
    difficulty: 'easy',
    is_arabic: false,
    sort_order: 7,
  },
  {
    id: 'nemotron-super',
    name: 'Nemotron Super 70B',
    description: 'NVIDIA Llama-3.1-Nemotron-70B — high-capability enterprise LLM. Multi-GPU, OpenAI-compatible.',
    icon: '🏆',
    category: 'LLM',
    min_vram_gb: 80,
    estimated_price_sar_per_hour: 45,
    hyperscaler_price_sar_per_hour: 150,
    tags: ['llm', 'inference', 'nvidia', 'nemotron', '70b', 'enterprise', 'multi-gpu', 'openai-compatible'],
    difficulty: 'medium',
    is_arabic: false,
    sort_order: 8,
  },
  {
    id: 'vllm-serve',
    name: 'vLLM Serve',
    description: 'OpenAI-compatible LLM serving API. Deploy Mistral, Llama, Qwen and other models via vLLM.',
    icon: '🤖',
    category: 'LLM',
    min_vram_gb: 16,
    estimated_price_sar_per_hour: 9,
    hyperscaler_price_sar_per_hour: 22,
    tags: ['llm', 'inference', 'api', 'openai-compatible'],
    difficulty: 'medium',
    is_arabic: false,
    sort_order: 9,
  },
  {
    id: 'ollama',
    name: 'Ollama LLM',
    description: 'Run local LLMs via Ollama. Supports llama3, mistral, gemma and 50+ quantized models. Easy UI.',
    icon: '🦙',
    category: 'LLM',
    min_vram_gb: 4,
    estimated_price_sar_per_hour: 9,
    hyperscaler_price_sar_per_hour: 14,
    tags: ['llm', 'ollama', 'small-models', 'inference', 'quantized'],
    difficulty: 'easy',
    is_arabic: false,
    sort_order: 10,
  },
  // ── Training ──────────────────────────────────────────────────────────────
  {
    id: 'lora-finetune',
    name: 'LoRA Fine-Tuning',
    description: 'Parameter-efficient LoRA fine-tuning workflow for adapter training with low VRAM overhead.',
    icon: '🧩',
    category: 'Training',
    min_vram_gb: 16,
    estimated_price_sar_per_hour: 14,
    hyperscaler_price_sar_per_hour: 40,
    tags: ['lora', 'fine-tuning', 'llm', 'peft'],
    difficulty: 'medium',
    is_arabic: false,
    sort_order: 11,
  },
  {
    id: 'qlora-finetune',
    name: 'QLoRA Fine-Tuning',
    description: '4-bit QLoRA fine-tuning optimized for memory-constrained GPUs. Train 7B models on 12 GB VRAM.',
    icon: '🧠',
    category: 'Training',
    min_vram_gb: 12,
    estimated_price_sar_per_hour: 13,
    hyperscaler_price_sar_per_hour: 35,
    tags: ['qlora', 'fine-tuning', 'quantization', 'llm'],
    difficulty: 'medium',
    is_arabic: false,
    sort_order: 12,
  },
  {
    id: 'pytorch-training',
    name: 'PyTorch Training',
    description: 'Run PyTorch training jobs on GPU. Supports custom scripts with dataset mounting and checkpoint saving.',
    icon: '🔥',
    category: 'Training',
    min_vram_gb: 8,
    estimated_price_sar_per_hour: 9,
    hyperscaler_price_sar_per_hour: 22,
    tags: ['training', 'pytorch', 'ml', 'deep-learning'],
    difficulty: 'medium',
    is_arabic: false,
    sort_order: 13,
  },
  {
    id: 'pytorch-single-gpu',
    name: 'PyTorch Single GPU',
    description: 'One-command PyTorch training/inference on a single GPU with deterministic CUDA seeds.',
    icon: '🔥',
    category: 'Training',
    min_vram_gb: 12,
    estimated_price_sar_per_hour: 11,
    hyperscaler_price_sar_per_hour: 28,
    tags: ['pytorch', 'single-gpu', 'training', 'inference'],
    difficulty: 'easy',
    is_arabic: false,
    sort_order: 14,
  },
  {
    id: 'pytorch-multi-gpu',
    name: 'PyTorch Multi GPU',
    description: 'Multi-GPU PyTorch template for distributed workloads with NCCL-friendly defaults.',
    icon: '⚡',
    category: 'Training',
    min_vram_gb: 24,
    estimated_price_sar_per_hour: 18,
    hyperscaler_price_sar_per_hour: 60,
    tags: ['pytorch', 'multi-gpu', 'distributed', 'training'],
    difficulty: 'advanced',
    is_arabic: false,
    sort_order: 15,
  },
  {
    id: 'jupyter-gpu',
    name: 'Jupyter GPU Notebook',
    description: 'GPU-accelerated Jupyter notebook with PyTorch, CUDA, and popular ML libraries pre-installed.',
    icon: '📓',
    category: 'Dev Tools',
    min_vram_gb: 4,
    estimated_price_sar_per_hour: 9,
    hyperscaler_price_sar_per_hour: 22,
    tags: ['jupyter', 'notebook', 'interactive', 'development', 'training'],
    difficulty: 'easy',
    is_arabic: false,
    sort_order: 16,
  },
  // ── Dev Tools ─────────────────────────────────────────────────────────────
  {
    id: 'python-scientific-compute',
    name: 'Python Scientific Compute',
    description: 'CUDA-ready scientific Python template for linear algebra, simulation, and data processing.',
    icon: '🔬',
    category: 'Dev Tools',
    min_vram_gb: 8,
    estimated_price_sar_per_hour: 10,
    hyperscaler_price_sar_per_hour: 22,
    tags: ['scientific', 'python', 'cuda', 'simulation'],
    difficulty: 'easy',
    is_arabic: false,
    sort_order: 17,
  },
  {
    id: 'custom-container',
    name: 'Custom Container',
    description: 'Bring your own Docker image. Run any GPU workload using an approved base image. Full flexibility.',
    icon: '📦',
    category: 'Dev Tools',
    min_vram_gb: 4,
    estimated_price_sar_per_hour: 9,
    hyperscaler_price_sar_per_hour: 14,
    tags: ['custom', 'advanced', 'bring-your-own', 'flexible'],
    difficulty: 'advanced',
    is_arabic: false,
    sort_order: 18,
  },
  // ── Image ─────────────────────────────────────────────────────────────────
  {
    id: 'sdxl',
    name: 'Stable Diffusion XL',
    description: 'Stability AI SDXL — high-resolution 1024×1024 image generation. Significantly better than SD 1.5.',
    icon: '🎨',
    category: 'Image',
    min_vram_gb: 8,
    estimated_price_sar_per_hour: 12,
    hyperscaler_price_sar_per_hour: 28,
    tags: ['image-gen', 'diffusion', 'sdxl', 'creative', 'art', '1024px'],
    difficulty: 'easy',
    is_arabic: false,
    sort_order: 19,
  },
  {
    id: 'stable-diffusion',
    name: 'Stable Diffusion',
    description: 'Image generation with Stable Diffusion. Generate high-quality images from text prompts.',
    icon: '🎨',
    category: 'Image',
    min_vram_gb: 4,
    estimated_price_sar_per_hour: 12,
    hyperscaler_price_sar_per_hour: 22,
    tags: ['image-gen', 'diffusion', 'creative', 'art'],
    difficulty: 'easy',
    is_arabic: false,
    sort_order: 20,
  },
]

const CATEGORIES: { id: TemplateCategory | 'all'; label: string; emoji: string }[] = [
  { id: 'all',       label: 'All Templates', emoji: '🗂️' },
  { id: 'Arabic AI', label: 'Arabic AI',     emoji: '🌙' },
  { id: 'LLM',       label: 'LLM',           emoji: '🤖' },
  { id: 'Training',  label: 'Training',      emoji: '🧠' },
  { id: 'Dev Tools', label: 'Dev Tools',     emoji: '🛠️' },
  { id: 'Image',     label: 'Image Gen',     emoji: '🎨' },
]

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Easy start',
  medium: 'Intermediate',
  advanced: 'Advanced',
}

const DIFFICULTY_CLASS: Record<string, string> = {
  easy: 'bg-status-success/10 text-status-success border-status-success/20',
  medium: 'bg-dc1-amber/10 text-dc1-amber border-dc1-amber/20',
  advanced: 'bg-status-error/10 text-status-error border-status-error/20',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function deriveCategory(id: string, tags: string[]): TemplateCategory {
  const lower = id.toLowerCase()
  const tagSet = tags.map(t => t.toLowerCase())
  if (lower.includes('arabic') || lower.includes('allam') || lower.includes('jais') ||
      tagSet.includes('arabic')) return 'Arabic AI'
  if (lower.includes('sdxl') || lower.includes('stable-diff') || tagSet.includes('image')) return 'Image'
  if (lower.includes('lora') || lower.includes('qlora') || lower.includes('finetune') ||
      tagSet.includes('training')) return 'Training'
  if (lower.includes('jupyter') || lower.includes('python-scientific') ||
      tagSet.includes('notebook')) return 'Dev Tools'
  return 'LLM'
}

function getSavingsPct(t: Template): number | null {
  const ref = t.hyperscaler_price_sar_per_hour ?? HYPERSCALER_SAR_PER_HR_FALLBACK
  if (t.estimated_price_sar_per_hour >= ref) return null
  return Math.round((1 - t.estimated_price_sar_per_hour / ref) * 100)
}

function deriveTemplateIntentDefaults(template: Template): { mode: RenterJobType; model: string } {
  const lowerId = template.id.toLowerCase()
  if (template.category === 'Image' || lowerId.includes('sdxl') || lowerId.includes('stable-diffusion')) {
    return { mode: 'image_generation', model: 'CompVis/stable-diffusion-v1-4' }
  }
  if (lowerId.includes('vllm')) {
    return { mode: 'vllm_serve', model: 'mistralai/Mistral-7B-Instruct-v0.2' }
  }
  if (template.is_arabic || lowerId.includes('arabic') || lowerId.includes('qwen') || lowerId.includes('jais') || lowerId.includes('allam')) {
    return { mode: 'llm_inference', model: 'Qwen/Qwen2-7B-Instruct' }
  }
  return { mode: 'llm_inference', model: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0' }
}

// ── Deploy Modal (inline — mirrors DCP-857 modal pattern) ─────────────────────
interface DeployModalState {
  template: Template | null
  loading: boolean
  error: string
  jobId: string | null
}

function DeployModal({ state, onClose, onConfirm }: {
  state: DeployModalState
  onClose: () => void
  onConfirm: () => void
}) {
  const router = useRouter()
  const t = state.template!
  const savingsPct = getSavingsPct(t)
  const isInsufficientBalance = state.error.toLowerCase().includes('insufficient balance')
  const isNoProvider = state.error.toLowerCase().includes('no provider')

  // Auto-redirect after successful submit
  if (state.jobId && state.jobId !== 'submitted') {
    setTimeout(() => router.push(`/renter/jobs/${state.jobId}`), 1200)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tmpl-deploy-title"
    >
      <div className="card w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{t.icon}</span>
              <h2 id="tmpl-deploy-title" className="text-lg font-bold text-dc1-text-primary">{t.name}</h2>
            </div>
            <p className="text-xs text-dc1-text-muted">{t.category} • {t.min_vram_gb} GB VRAM min</p>
          </div>
          <button onClick={onClose} className="text-dc1-text-muted hover:text-dc1-text-primary p-1" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Pricing */}
        <div className="bg-dc1-surface-l2 rounded-lg px-4 py-3 text-xs grid grid-cols-2 gap-3">
          <div>
            <p className="text-dc1-text-muted uppercase tracking-wide text-[9px]">DCP Price</p>
            <p className="font-bold text-dc1-amber text-base">{t.estimated_price_sar_per_hour.toFixed(0)} <span className="text-xs font-normal text-dc1-text-muted">SAR/hr</span></p>
          </div>
          {t.hyperscaler_price_sar_per_hour && (
            <div>
              <p className="text-dc1-text-muted uppercase tracking-wide text-[9px]">vs RunPod/AWS</p>
              <p className="font-semibold text-dc1-text-secondary line-through text-sm">{t.hyperscaler_price_sar_per_hour} SAR/hr</p>
            </div>
          )}
        </div>

        {/* Savings badge */}
        {savingsPct !== null && savingsPct > 0 && (
          <div className="bg-status-success/5 border border-status-success/20 rounded-lg px-4 py-2.5 flex items-center justify-between text-sm">
            <span className="text-dc1-text-muted">vs hyperscalers</span>
            <span className="text-status-success font-bold">You save {savingsPct}%</span>
          </div>
        )}

        {t.is_arabic && (
          <div className="bg-dc1-amber/5 border border-dc1-amber/20 rounded-lg px-4 py-2.5 text-xs text-dc1-amber font-medium">
            🌙 Arabic-capable — PDPL-compliant, in-kingdom processing
          </div>
        )}

        <p className="text-sm text-dc1-text-secondary">
          Your job will be queued and assigned to an available GPU provider.
          Billing starts when execution begins.
        </p>

        {/* Error states */}
        {isNoProvider && (
          <div className="bg-dc1-amber/5 border border-dc1-amber/30 rounded-lg px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-dc1-amber">No providers available</p>
            <p className="text-xs text-dc1-text-secondary">Join the waitlist to be notified when capacity opens.</p>
            <Link href={`/renter/waitlist?template=${encodeURIComponent(t.id)}`} className="inline-block btn btn-outline btn-sm text-dc1-amber border-dc1-amber/40">Join Waitlist →</Link>
          </div>
        )}
        {isInsufficientBalance && (
          <div className="bg-status-error/5 border border-status-error/30 rounded-lg px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-status-error">Insufficient balance</p>
            <Link href="/renter/billing" className="inline-block btn btn-outline btn-sm text-status-error border-status-error/40">Add Credits →</Link>
          </div>
        )}
        {state.error && !isNoProvider && !isInsufficientBalance && (
          <div className="bg-status-error/10 border border-status-error/30 rounded-lg px-4 py-3 text-sm text-status-error">
            {state.error}
          </div>
        )}

        {/* Success */}
        {state.jobId && (
          <div className="bg-status-success/10 border border-status-success/30 rounded-lg px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-status-success font-semibold">
              <span className="animate-spin h-4 w-4 border-2 border-status-success border-t-transparent rounded-full" />
              Job submitted — redirecting to live status…
            </div>
            {state.jobId !== 'submitted' && (
              <div className="flex gap-3">
                <Link href={`/renter/jobs/${state.jobId}`} className="text-xs text-status-success underline">View Job Status →</Link>
                <Link href="/renter/live" className="text-xs text-cyan-400 underline">Live Monitor →</Link>
              </div>
            )}
          </div>
        )}

        {!state.jobId && (
          <div className="flex gap-3 justify-end">
            <button onClick={onClose} disabled={state.loading} className="btn btn-secondary min-h-[44px] px-4">Cancel</button>
            <button onClick={onConfirm} disabled={state.loading} className="btn btn-primary min-h-[44px] px-5 flex items-center gap-2">
              {state.loading && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />}
              {state.loading ? 'Submitting…' : 'Deploy Now'}
            </button>
          </div>
        )}
        {state.jobId && (
          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="btn btn-secondary min-h-[44px] px-4">Close</button>
            {state.jobId !== 'submitted' ? (
              <Link href={`/renter/jobs/${state.jobId}`} className="btn btn-primary min-h-[44px] px-5">View Live Status →</Link>
            ) : (
              <Link href="/renter/jobs" className="btn btn-primary min-h-[44px] px-5">View Jobs →</Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Template Card ─────────────────────────────────────────────────────────────
function TemplateCard({ template, onDeploy }: { template: Template; onDeploy: (t: Template) => void }) {
  const savingsPct = getSavingsPct(template)

  return (
    <article className={`bg-dc1-surface-l2 border rounded-xl p-5 flex flex-col gap-3 hover:shadow-amber transition-all duration-200 group ${
      template.is_arabic ? 'border-dc1-amber/30 hover:border-dc1-amber/60' : 'border-dc1-border hover:border-dc1-amber/30'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">{template.icon || '🚀'}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-dc1-text-primary group-hover:text-dc1-amber transition-colors leading-tight">
            {template.name}
          </h3>
          <p className="text-[10px] text-dc1-text-muted mt-0.5">{template.category}</p>
        </div>
        {template.is_arabic && (
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-dc1-amber/10 text-dc1-amber border border-dc1-amber/20 font-medium">
            🌙 Arabic
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-dc1-text-secondary leading-relaxed line-clamp-2">{template.description}</p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${DIFFICULTY_CLASS[template.difficulty]}`}>
          {DIFFICULTY_LABEL[template.difficulty]}
        </span>
        {template.tags.slice(0, 2).map(tag => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-dc1-surface-l3 text-dc1-text-muted border border-dc1-border">
            {tag}
          </span>
        ))}
      </div>

      {/* Specs */}
      <div className="bg-dc1-surface-l1 rounded-lg px-3 py-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-dc1-text-muted uppercase tracking-wide text-[9px]">Min VRAM</p>
          <p className="font-semibold text-dc1-text-primary">{template.min_vram_gb} GB</p>
        </div>
        <div>
          <p className="text-dc1-text-muted uppercase tracking-wide text-[9px]">DCP Price</p>
          <p className="font-extrabold text-dc1-amber">{template.estimated_price_sar_per_hour} <span className="text-[9px] font-normal text-dc1-text-muted">SAR/hr</span></p>
        </div>
      </div>

      {/* Savings */}
      {savingsPct !== null && savingsPct > 0 && (
        <div className="bg-status-success/5 border border-status-success/20 rounded-lg px-3 py-1.5 flex items-center justify-between text-xs">
          <span className="text-dc1-text-muted">vs hyperscalers</span>
          <span className="text-status-success font-bold">Save {savingsPct}%</span>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => onDeploy(template)}
        className="btn btn-primary w-full text-sm mt-auto min-h-[44px]"
      >
        Launch in Playground
      </button>
    </article>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-dc1-surface-l2 border border-dc1-border rounded-xl p-5 flex flex-col gap-3 animate-pulse">
      <div className="flex gap-3">
        <div className="w-8 h-8 bg-dc1-surface-l3 rounded" />
        <div className="flex-1 space-y-1">
          <div className="h-4 bg-dc1-surface-l3 rounded w-3/4" />
          <div className="h-3 bg-dc1-surface-l3 rounded w-1/3" />
        </div>
      </div>
      <div className="h-8 bg-dc1-surface-l3 rounded" />
      <div className="h-12 bg-dc1-surface-l3 rounded-lg" />
      <div className="h-9 bg-dc1-surface-l3 rounded-md" />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TemplateCatalogPage() {
  const router = useRouter()
  const { t } = useLanguage()

  const [category, setCategory] = useState<TemplateCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [maxVram, setMaxVram] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | 'easy' | 'medium' | 'advanced'>('all')
  const [deploy, setDeploy] = useState<DeployModalState>({ template: null, loading: false, error: '', jobId: null })
  const [apiTemplates, setApiTemplates] = useState<Template[] | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(true)

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const list: Record<string, unknown>[] = Array.isArray(data?.templates) ? data.templates : []
        const mapped: Template[] = list.map(raw => {
          const tags = Array.isArray(raw.tags) ? (raw.tags as string[]) : []
          const rawId = String(raw.id ?? '')
          const isArabic = tags.some(tag => tag.toLowerCase().includes('arabic')) ||
            rawId.includes('arabic') || rawId.includes('allam') || rawId.includes('jais')
          return {
            id: rawId,
            name: String(raw.name ?? ''),
            description: String(raw.description ?? ''),
            icon: String(raw.icon ?? '📦'),
            category: deriveCategory(rawId, tags),
            min_vram_gb: Number(raw.min_vram_gb ?? 8),
            estimated_price_sar_per_hour: Number(raw.estimated_price_sar_per_hour ?? 0),
            hyperscaler_price_sar_per_hour: undefined,
            tags,
            difficulty: (['easy', 'medium', 'advanced'].includes(String(raw.difficulty ?? ''))
              ? String(raw.difficulty) : 'easy') as Template['difficulty'],
            is_arabic: isArabic,
            sort_order: Number(raw.sort_order ?? 99),
          }
        })
        if (mapped.length > 0) setApiTemplates(mapped)
      })
      .catch(() => { /* fallback to static TEMPLATES */ })
      .finally(() => setLoadingTemplates(false))
  }, [])

  const activeTemplates = apiTemplates ?? TEMPLATES
  const trackTemplateEvent = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return
    const detail = {
      event,
      source_page: 'renter_template_catalog',
      role_intent: 'renter',
      surface: 'template_catalog',
      destination: 'none',
      step: 'view',
      ...payload,
    }
    window.dispatchEvent(new CustomEvent('dc1_analytics', { detail }))
    const win = window as typeof window & {
      dataLayer?: Array<Record<string, unknown>>
      gtag?: (...args: unknown[]) => void
    }
    if (Array.isArray(win.dataLayer)) win.dataLayer.push(detail)
    if (typeof win.gtag === 'function') win.gtag('event', event, detail)
  }, [])

  const navItems = [
    { label: t('nav.dashboard'), href: '/renter', icon: <HomeIcon /> },
    { label: t('nav.marketplace'), href: '/renter/marketplace', icon: <MarketplaceIcon /> },
    { label: 'Models', href: '/renter/models', icon: <ModelsIcon /> },
    { label: t('nav.playground'), href: '/renter/playground', icon: <PlaygroundIcon /> },
    { label: t('nav.jobs'), href: '/renter/jobs', icon: <JobsIcon /> },
    { label: t('nav.billing'), href: '/renter/billing', icon: <BillingIcon /> },
    { label: t('nav.analytics'), href: '/renter/analytics', icon: <ChartIcon /> },
    { label: t('nav.settings'), href: '/renter/settings', icon: <GearIcon /> },
  ]

  const filtered = useMemo(() => {
    return activeTemplates.filter(tmpl => {
      if (category !== 'all' && tmpl.category !== category) return false
      if (difficultyFilter !== 'all' && tmpl.difficulty !== difficultyFilter) return false
      if (maxVram !== '') {
        const v = parseInt(maxVram, 10)
        if (!isNaN(v) && tmpl.min_vram_gb > v) return false
      }
      if (maxPrice !== '') {
        const p = parseFloat(maxPrice)
        if (!isNaN(p) && tmpl.estimated_price_sar_per_hour > p) return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = `${tmpl.name} ${tmpl.description} ${tmpl.tags.join(' ')} ${tmpl.category}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    }).sort((a, b) => a.sort_order - b.sort_order)
  }, [activeTemplates, category, difficultyFilter, maxVram, maxPrice, search])

  const arabicCount = activeTemplates.filter(tt => tt.is_arabic).length

  const openDeploy = (tmpl: Template) => {
    const defaults = deriveTemplateIntentDefaults(tmpl)
    const intent: RenterAuthIntent = {
      template: tmpl.id,
      model: defaults.model,
      mode: defaults.mode,
      jobType: defaults.mode,
      source: 'renter_template_catalog',
    }
    const prefilledPlaygroundPath = buildRenterPlaygroundPath(intent)
    const key = localStorage.getItem('dc1_renter_key') || localStorage.getItem('dc1_api_key')
    if (!key) {
      setPendingRenterAuthIntent(intent)
      trackTemplateEvent('template_deploy_auth_redirect', {
        surface: 'template_card',
        destination: '/login',
        step: 'auth_required',
        template: tmpl.id,
        model: defaults.model,
        mode: defaults.mode,
      })
      router.push(buildRenterLoginRedirect('/renter/playground', 'renter_template_catalog'))
      return
    }
    trackTemplateEvent('template_prefill_playground_clicked', {
      surface: 'template_card',
      destination: prefilledPlaygroundPath,
      step: 'prefill_playground',
      template: tmpl.id,
      model: defaults.model,
      mode: defaults.mode,
      auth_state: 'signed_in',
    })
    router.push(prefilledPlaygroundPath)
  }

  const closeDeploy = () => setDeploy({ template: null, loading: false, error: '', jobId: null })

  const confirmDeploy = async () => {
    const tmpl = deploy.template
    if (!tmpl) return
    const apiKey = localStorage.getItem('dc1_renter_key') || localStorage.getItem('dc1_api_key') || ''
    setDeploy(d => ({ ...d, loading: true, error: '' }))
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(tmpl.id)}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-renter-key': apiKey },
        body: JSON.stringify({ duration_minutes: 60 }),
      })
      if (res.status === 503) {
        setDeploy(d => ({ ...d, loading: false, error: 'No GPU provider available right now. Please try again shortly.' }))
        return
      }
      if (res.status === 402) {
        setDeploy(d => ({ ...d, loading: false, error: 'Insufficient balance. Please top up your wallet before deploying.' }))
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setDeploy(d => ({ ...d, loading: false, error: err.error || 'Failed to submit job. Please try again.' }))
        return
      }
      const data = await res.json()
      const jobId = data.jobId || data.job_id || data.id || 'submitted'
      setDeploy(d => ({ ...d, loading: false, jobId }))
    } catch {
      setDeploy(d => ({ ...d, loading: false, error: 'Network error. Please try again.' }))
    }
  }

  const clearFilters = () => {
    setCategory('all')
    setSearch('')
    setMaxVram('')
    setMaxPrice('')
    setDifficultyFilter('all')
  }

  const hasFilters = category !== 'all' || search.trim() || maxVram || maxPrice || difficultyFilter !== 'all'

  return (
    <DashboardLayout navItems={navItems} role="renter">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-dc1-text-primary">GPU Template Catalog</h1>
            <p className="text-sm text-dc1-text-secondary mt-1">
              {activeTemplates.length} ready-to-deploy templates — LLMs, fine-tuning, embeddings, image generation.
            </p>
          </div>
          <Link href="/renter/marketplace" className="btn btn-secondary btn-sm self-start sm:self-auto">
            ← Back to Marketplace
          </Link>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="flex items-center gap-2 bg-dc1-surface-l1 rounded-lg px-3 py-2 border border-dc1-border">
            <span className="text-dc1-amber font-bold">{activeTemplates.length}</span>
            <span className="text-dc1-text-secondary">templates</span>
          </div>
          <div className="flex items-center gap-2 bg-dc1-amber/10 rounded-lg px-3 py-2 border border-dc1-amber/20">
            <span className="text-dc1-amber font-bold">🌙 {arabicCount}</span>
            <span className="text-dc1-amber font-medium">Arabic-capable</span>
          </div>
          <div className="flex items-center gap-2 bg-status-success/10 rounded-lg px-3 py-2 border border-status-success/20">
            <span className="text-status-success font-bold">Save 35–65%</span>
            <span className="text-dc1-text-secondary">vs hyperscalers</span>
          </div>
          <div className="flex items-center gap-2 bg-dc1-surface-l1 rounded-lg px-3 py-2 border border-dc1-border">
            <span className="text-dc1-amber font-bold">From 5 SAR/hr</span>
          </div>
        </div>

        {/* Arabic RAG callout */}
        <div className="bg-dc1-amber/5 border border-dc1-amber/30 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="text-3xl">🌙</div>
          <div className="flex-1">
            <h3 className="font-bold text-dc1-text-primary mb-1">Complete Arabic AI Stack — PDPL-Compliant</h3>
            <p className="text-sm text-dc1-text-secondary">
              BGE-M3 embeddings + BGE reranker + ALLaM/JAIS/Qwen — full Arabic RAG pipeline on Saudi GPUs.
              No data leaves the Kingdom. 35–65% below AWS/Azure pricing.
            </p>
          </div>
          <button
            onClick={() => setCategory('Arabic AI')}
            className="btn btn-primary shrink-0 text-sm"
          >
            Browse Arabic AI →
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                category === cat.id
                  ? 'bg-dc1-amber text-dc1-bg border-dc1-amber'
                  : 'bg-dc1-surface-l1 text-dc1-text-secondary border-dc1-border hover:border-dc1-amber/40 hover:text-dc1-text-primary'
              }`}
            >
              <span>{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap gap-3 items-center p-4 bg-dc1-surface-l1 rounded-xl border border-dc1-border">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <svg className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dc1-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search templates…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input ps-9 w-full text-sm"
            />
          </div>
          {/* VRAM filter */}
          <input
            type="number"
            min="4"
            step="4"
            placeholder="Max VRAM (GB)"
            value={maxVram}
            onChange={e => setMaxVram(e.target.value)}
            className="input text-sm w-36 min-h-[44px]"
          />
          {/* Price filter */}
          <input
            type="number"
            min="1"
            step="1"
            placeholder="Max price (SAR/hr)"
            value={maxPrice}
            onChange={e => setMaxPrice(e.target.value)}
            className="input text-sm w-40 min-h-[44px]"
          />
          {/* Difficulty */}
          <select
            value={difficultyFilter}
            onChange={e => setDifficultyFilter(e.target.value as typeof difficultyFilter)}
            className="input text-sm w-auto min-h-[44px]"
          >
            <option value="all">All levels</option>
            <option value="easy">Easy start</option>
            <option value="medium">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          {/* Results count + clear */}
          <div className="ms-auto flex items-center gap-3">
            <span className="text-xs text-dc1-text-muted whitespace-nowrap">
              {loadingTemplates ? 'Loading…' : `${filtered.length} of ${activeTemplates.length} templates`}
            </span>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-dc1-amber hover:underline">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Grid */}
        {loadingTemplates ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-2xl mb-3">🔍</p>
            <p className="text-dc1-text-secondary mb-1">No templates match your filters.</p>
            <button onClick={clearFilters} className="btn btn-outline btn-sm mt-3">Clear filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(tmpl => (
              <TemplateCard key={tmpl.id} template={tmpl} onDeploy={openDeploy} />
            ))}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="border border-dc1-border rounded-2xl p-6 text-center bg-dc1-surface-l1">
          <p className="text-dc1-text-secondary text-sm mb-3">
            Need a custom setup? Browse live providers directly or bring your own container.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/renter/marketplace" className="btn btn-secondary btn-sm">Browse Providers</Link>
            <button onClick={() => openDeploy(activeTemplates.find(t => t.id === 'custom-container') ?? activeTemplates[0])} className="btn btn-outline btn-sm">
              📦 Custom Container
            </button>
          </div>
        </div>
      </div>

      {/* Deploy modal */}
      {deploy.template && (
        <DeployModal state={deploy} onClose={closeDeploy} onConfirm={confirmDeploy} />
      )}
    </DashboardLayout>
  )
}
