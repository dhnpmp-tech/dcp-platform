'use client'

import { useState } from 'react'
import Link from 'next/link'
import Header from '../../components/layout/Header'
import Footer from '../../components/layout/Footer'
import { useLanguage } from '../../lib/i18n'

interface Model {
  id: string
  name: string
  org: string
  params: string
  vram: string
  useCases: string[]
  category: 'arabic' | 'open'
  type?: string
}

const models: Model[] = [
  {
    id: 'allam-7b',
    name: 'ALLaM 7B',
    org: 'SDAIA Foundation',
    params: '7B',
    vram: '16GB',
    useCases: ['Text Generation', 'Classification', 'Summarization'],
    category: 'arabic',
  },
  {
    id: 'falcon-h1',
    name: 'Falcon H1',
    org: 'TII Abu Dhabi',
    params: 'Hybrid',
    vram: '24GB',
    useCases: ['Reasoning', 'Code', 'Chat'],
    category: 'arabic',
  },
  {
    id: 'jais-13b',
    name: 'JAIS 13B',
    org: 'Inception/G42',
    params: '13B',
    vram: '32GB',
    useCases: ['Arabic NLP', 'Translation', 'QA'],
    category: 'arabic',
  },
  {
    id: 'bge-m3',
    name: 'BGE-M3',
    org: 'BAAI',
    params: '568M',
    vram: '4GB',
    useCases: ['Semantic Search', 'RAG', 'Retrieval'],
    category: 'arabic',
  },
  {
    id: 'llama-31',
    name: 'Llama 3.1',
    org: 'Meta',
    params: '8B/70B',
    vram: '16-140GB',
    useCases: ['General Purpose', 'Code', 'Reasoning'],
    category: 'open',
  },
  {
    id: 'mistral-7b',
    name: 'Mistral 7B',
    org: 'Mistral AI',
    params: '7B',
    vram: '16GB',
    useCases: ['Fast Inference', 'Code', 'Instruction Following'],
    category: 'open',
  },
  {
    id: 'qwen-25',
    name: 'Qwen 2.5',
    org: 'Alibaba',
    params: '7B/72B',
    vram: '16-140GB',
    useCases: ['Multilingual', 'Math', 'Code'],
    category: 'open',
  },
  {
    id: 'gemma-2',
    name: 'Gemma 2',
    org: 'Google',
    params: '9B/27B',
    vram: '20-54GB',
    useCases: ['Efficient Inference', 'Instruction Following'],
    category: 'open',
  },
]

function ModelCard({ model }: { model: Model }) {
  const isArabic = model.category === 'arabic'
  const initial = model.name.charAt(0)

  return (
    <div
      className={`relative rounded-lg border-2 p-6 backdrop-blur-sm transition-all hover:shadow-lg ${
        isArabic
          ? 'border-[#F5A524] bg-[#161b22] shadow-lg shadow-[#F5A52433]'
          : 'border-[#38B6E0] bg-[#161b22]'
      }`}
    >
      {/* Badge */}
      <div className="mb-4 flex items-center justify-between">
        <div
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            isArabic
              ? 'bg-[#F5A524] text-[#0d1117]'
              : 'bg-[#38B6E0] text-[#0d1117]'
          }`}
        >
          {isArabic ? 'Arabic AI' : 'Open Model'}
        </div>
        {model.type && (
          <span className="text-xs text-gray-400">{model.type}</span>
        )}
      </div>

      {/* Logo/Initial */}
      <div
        className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold ${
          isArabic ? 'bg-[#F5A524] text-[#0d1117]' : 'bg-[#38B6E0] text-white'
        }`}
      >
        {initial}
      </div>

      {/* Model Info */}
      <h3 className="mb-1 text-lg font-bold text-white">{model.name}</h3>
      <p className="mb-4 text-sm text-gray-400">{model.org}</p>

      {/* Specs */}
      <div className="mb-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Parameters:</span>
          <span className="font-medium text-gray-200">{model.params}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">VRAM Required:</span>
          <span className="font-medium text-gray-200">{model.vram}</span>
        </div>
      </div>

      {/* Use Cases */}
      <div className="flex flex-wrap gap-2">
        {model.useCases.map((useCase) => (
          <span
            key={useCase}
            className="inline-block rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300"
          >
            {useCase}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ModelsPage() {
  const { t } = useLanguage()
  const [filter, setFilter] = useState<'all' | 'arabic' | 'open'>('all')

  const filteredModels = models.filter((model) => {
    if (filter === 'all') return true
    return model.category === filter
  })

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <Header />

      {/* Hero Section */}
      <section className="border-b border-gray-800 bg-gradient-to-b from-[#161b22] to-[#0d1117] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="mb-4 text-4xl font-bold text-white sm:text-5xl">
            Supported Models
          </h1>
          <p className="text-lg text-gray-400">
            Deploy and run cutting-edge AI models on DCP's distributed GPU
            infrastructure. From Arabic-specialized models to popular open-source
            options, find the perfect model for your use case.
          </p>
        </div>
      </section>

      {/* Filter Section */}
      <section className="border-b border-gray-800 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="mb-4 text-sm font-semibold text-gray-300">FILTER BY</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-lg px-4 py-2 font-medium transition-all ${
                filter === 'all'
                  ? 'bg-[#38B6E0] text-[#0d1117]'
                  : 'border border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('arabic')}
              className={`rounded-lg px-4 py-2 font-medium transition-all ${
                filter === 'arabic'
                  ? 'bg-[#F5A524] text-[#0d1117]'
                  : 'border border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              Arabic AI
            </button>
            <button
              onClick={() => setFilter('open')}
              className={`rounded-lg px-4 py-2 font-medium transition-all ${
                filter === 'open'
                  ? 'bg-[#38B6E0] text-[#0d1117]'
                  : 'border border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              Open Models
            </button>
          </div>
        </div>
      </section>

      {/* Models Grid */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredModels.map((model) => (
              <ModelCard key={model.id} model={model} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-gray-800 bg-gradient-to-r from-[#38B6E0] to-[#F5A524] bg-opacity-10 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-white">
            Ready to run these models?
          </h2>
          <p className="mb-8 text-gray-300">
            Join DCP and start deploying powerful AI models on our GPU cloud
            infrastructure today.
          </p>
          <Link
            href="/renter/register"
            className="inline-block rounded-lg bg-[#38B6E0] px-8 py-3 font-semibold text-[#0d1117] transition-all hover:bg-[#F5A524]"
          >
            Get Started
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}
