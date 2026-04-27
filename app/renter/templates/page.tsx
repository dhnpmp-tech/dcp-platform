'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useLanguage } from '../../lib/i18n'

const API_BASE = '/api'

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
const PlaygroundIcon = () => (
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
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const GearIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const ModelsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
  </svg>
)
const TemplatesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12 0a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
  </svg>
)

type Category = 'all' | 'inference' | 'generation' | 'training' | 'embedding'

interface JobTemplate {
  id: string
  name: string
  description: string
  category: Exclude<Category, 'all'>
  jobType: string
  estimatedMinutes: number
  rateHalalaPerMin: number
  model: string
  params: Record<string, string | number | boolean>
  tags: string[]
  vramGb: number
  tier: 'Instant' | 'Cached' | 'On-demand'
  estimatedLoadTimeSeconds: number
}

const TEMPLATES: JobTemplate[] = [
  {
    id: 'llm-chat',
    name: 'LLM Chat Inference',
    description: 'Run a single-turn chat completion with Mistral-7B. Great for Q&A, summarization, and text generation tasks.',
    category: 'inference',
    jobType: 'llm-inference',
    estimatedMinutes: 2,
    rateHalalaPerMin: 15,
    model: 'mistralai/Mistral-7B-Instruct-v0.2',
    params: {
      prompt: 'Explain the basics of GPU computing in simple terms.',
      max_tokens: 512,
      temperature: 0.7,
    },
    tags: ['LLM', 'Chat', 'Mistral'],
    vramGb: 16,
    tier: 'Cached',
    estimatedLoadTimeSeconds: 10,
  },
  {
    id: 'llm-llama',
    name: 'Llama 3 Inference',
    description: "Run Meta's Llama 3 8B model for instruction following, coding assistance, and reasoning tasks.",
    category: 'inference',
    jobType: 'llm-inference',
    estimatedMinutes: 2,
    rateHalalaPerMin: 15,
    model: 'meta-llama/Meta-Llama-3-8B-Instruct',
    params: {
      prompt: 'Write a Python function that checks if a number is prime.',
      max_tokens: 1024,
      temperature: 0.3,
    },
    tags: ['LLM', 'Llama', 'Coding'],
    vramGb: 16,
    tier: 'Cached',
    estimatedLoadTimeSeconds: 10,
  },
  {
    id: 'image-sdxl',
    name: 'SDXL Image Generation',
    description: 'Generate high-quality 1024×1024 images using Stable Diffusion XL. Ideal for art, product mockups, and creative work.',
    category: 'generation',
    jobType: 'image_generation',
    estimatedMinutes: 3,
    rateHalalaPerMin: 20,
    model: 'stabilityai/stable-diffusion-xl-base-1.0',
    params: {
      prompt: 'A futuristic data center in Saudi Arabia at night, cinematic lighting, 8k',
      negative_prompt: 'blurry, low quality, watermark',
      steps: 30,
      guidance_scale: 7.5,
      width: 1024,
      height: 1024,
    },
    tags: ['Image', 'SDXL', 'Art'],
    vramGb: 8,
    tier: 'Cached',
    estimatedLoadTimeSeconds: 10,
  },
  {
    id: 'image-sd15',
    name: 'SD 1.5 Fast Generation',
    description: 'Quick 512×512 image generation using Stable Diffusion 1.5. Lower cost, faster turnaround.',
    category: 'generation',
    jobType: 'image_generation',
    estimatedMinutes: 1,
    rateHalalaPerMin: 20,
    model: 'runwayml/stable-diffusion-v1-5',
    params: {
      prompt: 'A photorealistic portrait of a tech entrepreneur, studio lighting',
      steps: 20,
      guidance_scale: 7.0,
      width: 512,
      height: 512,
    },
    tags: ['Image', 'SD 1.5', 'Fast'],
    vramGb: 8,
    tier: 'Cached',
    estimatedLoadTimeSeconds: 10,
  },
  {
    id: 'embed-sentence',
    name: 'Batch Text Embeddings',
    description: 'Generate dense embeddings for a list of texts using sentence-transformers. Useful for semantic search and RAG pipelines.',
    category: 'embedding',
    jobType: 'llm-inference',
    estimatedMinutes: 1,
    rateHalalaPerMin: 15,
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    params: {
      texts: '["Hello world", "GPU computing is powerful", "DCP marketplace"]',
      batch_size: 32,
    },
    tags: ['Embeddings', 'NLP', 'RAG'],
    vramGb: 4,
    tier: 'Instant',
    estimatedLoadTimeSeconds: 5,
  },
  {
    id: 'finetune-lora',
    name: 'LoRA Fine-tuning',
    description: 'Fine-tune a base LLM using LoRA adapters on your custom dataset. Customize for domain-specific tasks.',
    category: 'training',
    jobType: 'training',
    estimatedMinutes: 30,
    rateHalalaPerMin: 25,
    model: 'mistralai/Mistral-7B-v0.1',
    params: {
      dataset: 'your_dataset.jsonl',
      epochs: 3,
      lora_r: 16,
      lora_alpha: 32,
      learning_rate: 0.0002,
      batch_size: 4,
    },
    tags: ['Training', 'LoRA', 'Fine-tune'],
    vramGb: 24,
    tier: 'Cached',
    estimatedLoadTimeSeconds: 15,
  },
  {
    id: 'vllm-serve',
    name: 'vLLM Serving',
    description: 'Deploy a model with vLLM for high-throughput inference serving. Get an OpenAI-compatible API endpoint.',
    category: 'inference',
    jobType: 'vllm_serve',
    estimatedMinutes: 60,
    rateHalalaPerMin: 20,
    model: 'mistralai/Mistral-7B-Instruct-v0.2',
    params: {
      max_model_len: 4096,
      gpu_memory_utilization: 0.9,
      tensor_parallel_size: 1,
    },
    tags: ['vLLM', 'Serving', 'API'],
    vramGb: 16,
    tier: 'Cached',
    estimatedLoadTimeSeconds: 10,
  },
  {
    id: 'render-blender',
    name: 'GPU Rendering',
    description: 'Render a 3D scene using GPU-accelerated rendering. Upload your .blend file and get the output frames.',
    category: 'generation',
    jobType: 'rendering',
    estimatedMinutes: 10,
    rateHalalaPerMin: 20,
    model: 'blender/4.0',
    params: {
      scene_file: 'scene.blend',
      samples: 128,
      resolution_x: 1920,
      resolution_y: 1080,
      output_format: 'PNG',
    },
    tags: ['Rendering', 'Blender', '3D'],
    vramGb: 12,
    tier: 'Cached',
    estimatedLoadTimeSeconds: 20,
  },
]

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All Templates',
  inference: 'Inference',
  generation: 'Generation',
  training: 'Training',
  embedding: 'Embedding',
}

const CATEGORY_COLORS: Record<string, string> = {
  inference: 'text-status-info bg-status-info-bg border-status-info/20',
  generation: 'text-status-success bg-status-success-bg border-status-success/20',
  training: 'text-dc1-amber bg-status-warning-bg border-dc1-amber/20',
  embedding: 'text-status-info bg-status-info-bg border-status-info/20',
}

function getCategoryForTemplate(t: Record<string, unknown>): string {
  const tags = ((t.tags as string[]) ?? []).map((x: string) => x.toLowerCase())
  const id = (t.id as string)?.toLowerCase() ?? ''
  if (tags.includes('training') || id.includes('finetune') || id.includes('lora') || id.includes('qlora')) return 'training'
  if (tags.includes('embedding') || tags.includes('rag') || id.includes('embed') || id.includes('rerank')) return 'embedding'
  if (tags.includes('image') || id.includes('sdxl') || id.includes('stable-diffusion')) return 'image'
  if (tags.includes('llm') || tags.includes('inference') || id.includes('llm') || id.includes('vllm') || id.includes('ollama')) return 'inference'
  return 'inference'
}

function estimatedCost(minutes: number, rateHalalaPerMin: number): string {
  const halala = minutes * rateHalalaPerMin
  return (halala / 100).toFixed(2)
}

function buildPlaygroundQuery(template: JobTemplate): string {
  const params = new URLSearchParams({
    job_type: template.jobType,
    model: template.model,
  })
  return `/renter/playground?${params.toString()}`
}

function formatLoadTime(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `~${minutes}m`
}

function getTierBadgeColor(tier: string): string {
  if (tier === 'Instant') return 'bg-status-success/15 text-status-success border-status-success/30'
  if (tier === 'Cached') return 'bg-status-info/15 text-status-info border-status-info/30'
  return 'bg-status-warning/15 text-status-warning border-status-warning/30'
}

export default function TemplatesPage() {
  const { t } = useLanguage()
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<Category>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Fetch docker-templates from API and normalize snake_case API fields to camelCase JobTemplate shape
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch(`${API_BASE}/templates`)
        if (res.ok) {
          const data = await res.json()
          const raw: Record<string, unknown>[] = Array.isArray(data?.templates) ? data.templates : []
          const normalized: JobTemplate[] = raw.map((t) => {
            const vramGb = (t.min_vram_gb as number) ?? (t.vramGb as number) ?? 8
            const priceHr = (t.estimated_price_sar_per_hour as number) ?? 5
            // Convert SAR/hr to halala/min for cost display compatibility
            const rateHalalaPerMin = Math.round((priceHr * 100) / 60)
            const rawTier = (t.tier as string) ?? 'standard'
            const tier = rawTier === 'instant' ? 'Instant' : rawTier === 'cached' ? 'Cached' : 'On-demand'
            const rawCategory = getCategoryForTemplate(t)
            const category: JobTemplate['category'] =
              rawCategory === 'embedding' ? 'embedding' :
              rawCategory === 'image' ? 'generation' :
              rawCategory === 'training' ? 'training' : 'inference'
            const params = (t.params as Record<string, string | number | boolean>) ?? {}
            const model = (params.model as string) ?? (t.model as string) ?? (t.image as string) ?? 'unknown'
            return {
              id: t.id as string,
              name: t.name as string,
              description: t.description as string,
              category,
              jobType: (t.job_type as string) ?? (t.jobType as string) ?? 'llm-inference',
              estimatedMinutes: (t.estimatedMinutes as number) ?? 5,
              rateHalalaPerMin,
              model,
              params,
              tags: (t.tags as string[]) ?? [],
              vramGb,
              tier,
              estimatedLoadTimeSeconds: (t.estimatedLoadTimeSeconds as number) ?? 30,
            }
          })
          setTemplates(normalized)
        }
      } catch (err) {
        console.error('Failed to load templates:', err)
        // Fallback to hardcoded templates on error
        setTemplates(TEMPLATES)
      } finally {
        setLoading(false)
      }
    }
    fetchTemplates()
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

  const filtered = templates.filter(
    (t) => activeCategory === 'all' || t.category === activeCategory
  )

  const handleCopyParams = (template: JobTemplate) => {
    const payload = JSON.stringify(
      { job_type: template.jobType, model: template.model, params: template.params },
      null,
      2
    )
    navigator.clipboard.writeText(payload).then(() => {
      setCopiedId(template.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <DashboardLayout navItems={navItems} role="renter">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-dc1-text-primary mb-1">{t('templates.title')}</h1>
          <p className="text-dc1-text-secondary text-sm">
            {t('templates.subtitle')}
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Template categories">
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                activeCategory === cat
                  ? 'bg-dc1-amber text-white border-dc1-amber'
                  : 'bg-transparent text-dc1-text-secondary border-dc1-border hover:border-dc1-border-light hover:text-dc1-text-primary'
              }`}
            >
              {CATEGORY_LABELS[cat]}
              {cat !== 'all' && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({templates.filter((t) => t.category === cat).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="animate-spin h-8 w-8 border-2 border-dc1-amber border-t-transparent rounded-full"
              aria-label={t('common.loading')}
              role="status"
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-dc1-text-secondary mb-2">{t('templates.no_templates')}</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((template) => {
            const isExpanded = expandedId === template.id
            const isCopied = copiedId === template.id

            return (
              <div
                key={template.id}
                className="card flex flex-col hover:border-dc1-amber/20 transition-colors"
                role="article"
                aria-label={template.name}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-base font-semibold text-dc1-text-primary">{template.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[template.category]}`}>
                        {CATEGORY_LABELS[template.category]}
                      </span>
                    </div>
                    <p className="text-sm text-dc1-text-secondary leading-relaxed">{template.description}</p>
                  </div>
                </div>

                {/* Model + Cost + Specs */}
                <div className="flex flex-wrap gap-3 text-xs mb-3">
                  <div className="flex items-center gap-1.5 text-dc1-text-secondary">
                    <svg className="w-3.5 h-3.5 text-dc1-amber shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                    </svg>
                    <span className="font-mono text-dc1-text-primary truncate max-w-[200px]">{template.model.split('/').pop()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-dc1-text-secondary">
                    <svg className="w-3.5 h-3.5 text-dc1-amber shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      ~<span className="text-dc1-amber font-semibold">{estimatedCost(template.estimatedMinutes, template.rateHalalaPerMin)} SAR</span>
                      {' '}estimated
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-dc1-text-secondary">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>~{template.estimatedMinutes}m</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-dc1-text-secondary">{template.vramGb}GB</span>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-medium ${getTierBadgeColor(template.tier)}`}>
                    <span>{template.tier}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-dc1-text-secondary">
                    <span className="text-dc1-text-muted">Load:</span>
                    <span className="font-medium text-dc1-text-primary">{formatLoadTime(template.estimatedLoadTimeSeconds)}</span>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {template.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded bg-dc1-surface-l2 text-dc1-text-muted border border-dc1-border">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Expandable Params */}
                <div className="mb-4">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : template.id)}
                    className="flex items-center gap-1.5 text-xs text-dc1-text-secondary hover:text-dc1-text-primary transition-colors"
                    aria-expanded={isExpanded}
                    aria-controls={`params-${template.id}`}
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {isExpanded ? 'Hide' : 'Show'} default parameters
                  </button>
                  {isExpanded && (
                    <div
                      id={`params-${template.id}`}
                      className="mt-2 bg-dc1-surface-l1 rounded-md p-3 overflow-x-auto"
                    >
                      <pre className="text-xs text-dc1-text-secondary font-mono whitespace-pre-wrap">
                        {JSON.stringify(template.params, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  <Link
                    href={buildPlaygroundQuery(template)}
                    className="btn btn-primary flex-1 text-center text-sm"
                  >
                    Use Template
                  </Link>
                  <button
                    onClick={() => handleCopyParams(template)}
                    className="btn btn-secondary text-sm px-3"
                    aria-label="Copy parameters as JSON"
                    title="Copy parameters as JSON"
                  >
                    {isCopied ? (
                      <svg className="w-4 h-4 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        )}

        {/* Footer CTA */}
        <div className="card text-center py-8">
          <h3 className="text-lg font-semibold text-dc1-text-primary mb-2">Ready to run a job?</h3>
          <p className="text-dc1-text-secondary text-sm mb-4">
            Browse available GPUs in the marketplace or jump straight into the playground.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href="/renter/marketplace" className="btn btn-primary">
              Browse GPUs
            </Link>
            <Link href="/renter/playground" className="btn btn-secondary">
              Open Playground
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
