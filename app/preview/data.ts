// Demo data for the /preview homepage redesign.
// Ported verbatim from the Claude Design handover bundle (assets/data.js).

export interface MarketplaceRow {
  id: string
  gpu: string
  vram: number
  region: string
  provider: string
  sarhr: number
  usd: number
  util: number
  perf: number
  reliability: number
  arabic: boolean
}

export interface ModelRow {
  id: string
  name: string
  org: string
  kind: 'chat' | 'image' | 'embed'
  arabic: boolean
  ctx: string
  in: number
  out: number
  tag: string
  hot: boolean
}

export interface RegionRow {
  id: string
  name: string
  code: string
  provider: string
  lat: string
  lon: string
  count: number
}

export const marketplace: MarketplaceRow[] = [
  { id: 'h100-80',   gpu: 'H100 SXM · 80GB',   vram: 80, region: 'RUH', provider: 'Aramco-Edge-07',    sarhr: 22.40, usd: 5.97, util: 72, perf: 98, reliability: 99.9, arabic: true  },
  { id: 'h100-pcie', gpu: 'H100 PCIe · 80GB',  vram: 80, region: 'JED', provider: 'MobilyDC-14',       sarhr: 20.10, usd: 5.36, util: 64, perf: 94, reliability: 99.7, arabic: true  },
  { id: 'a100-80',   gpu: 'A100 · 80GB',       vram: 80, region: 'RUH', provider: 'stcCloud-02',       sarhr: 12.80, usd: 3.41, util: 81, perf: 82, reliability: 99.8, arabic: true  },
  { id: 'a100-40',   gpu: 'A100 · 40GB',       vram: 40, region: 'DMM', provider: 'Aramco-Edge-03',    sarhr:  9.60, usd: 2.56, util: 58, perf: 76, reliability: 99.6, arabic: true  },
  { id: 'l40s',      gpu: 'L40S · 48GB',       vram: 48, region: 'RUH', provider: 'stcCloud-11',       sarhr:  7.20, usd: 1.92, util: 49, perf: 71, reliability: 99.6, arabic: true  },
  { id: 'rtx5090',   gpu: 'RTX 5090 · 32GB',   vram: 32, region: 'JED', provider: 'faisal-alqahtani',  sarhr:  4.80, usd: 1.28, util: 55, perf: 62, reliability: 98.9, arabic: false },
  { id: 'rtx4090',   gpu: 'RTX 4090 · 24GB',   vram: 24, region: 'RUH', provider: 'khaled-labs',       sarhr:  3.40, usd: 0.91, util: 73, perf: 58, reliability: 99.2, arabic: false },
  { id: 'rtx4080',   gpu: 'RTX 4080 · 16GB',   vram: 16, region: 'BAH', provider: 'gulf-compute-22',   sarhr:  2.40, usd: 0.64, util: 38, perf: 44, reliability: 98.5, arabic: false },
  { id: 'm4-max',    gpu: 'M4 Max · 36GB',     vram: 36, region: 'RUH', provider: 'al-rashid-studio',  sarhr:  2.20, usd: 0.59, util: 61, perf: 41, reliability: 99.0, arabic: false },
  { id: 'rtx4070',   gpu: 'RTX 4070 Ti · 12GB',vram: 12, region: 'JED', provider: 'ahmad-mesh',        sarhr:  1.60, usd: 0.43, util: 44, perf: 34, reliability: 98.2, arabic: false },
]

export const models: ModelRow[] = [
  { id: 'allam-7b',    name: 'ALLaM-7B-Instruct',   org: 'SDAIA',     kind: 'chat',  arabic: true,  ctx: '8K',   in: 0.40, out: 1.20, tag: 'Arabic · flagship',     hot: true  },
  { id: 'jais-13b',    name: 'JAIS-13B-Chat',       org: 'Inception', kind: 'chat',  arabic: true,  ctx: '8K',   in: 0.80, out: 2.40, tag: 'Arabic · bilingual',    hot: false },
  { id: 'falcon-h1',   name: 'Falcon-H1-34B',       org: 'TII',       kind: 'chat',  arabic: true,  ctx: '32K',  in: 1.10, out: 3.30, tag: 'Arabic · long context', hot: true  },
  { id: 'qwen-3-72b',  name: 'Qwen3-72B-Instruct',  org: 'Alibaba',   kind: 'chat',  arabic: false, ctx: '128K', in: 2.20, out: 6.60, tag: 'Reasoning',             hot: true  },
  { id: 'llama-3-70b', name: 'Llama-3-70B-Instruct',org: 'Meta',      kind: 'chat',  arabic: false, ctx: '8K',   in: 1.80, out: 5.40, tag: 'General',               hot: false },
  { id: 'mistral-l',   name: 'Mistral-Large-2',     org: 'Mistral',   kind: 'chat',  arabic: false, ctx: '128K', in: 2.00, out: 6.00, tag: 'Tool use',              hot: true  },
  { id: 'bge-m3',      name: 'BGE-M3',              org: 'BAAI',      kind: 'embed', arabic: true,  ctx: '8K',   in: 0.04, out: 0.00, tag: 'Embeddings',            hot: false },
  { id: 'sdxl-turbo',  name: 'SDXL-Turbo',          org: 'Stability', kind: 'image', arabic: false, ctx: '—',    in: 0.00, out: 0.00, tag: 'Image · turbo',         hot: false },
]

export const demoPrompts: Record<string, string> = {
  'allam-7b':   'اكتب فقرة تسويقية قصيرة عن حوسبة سحابية سعودية للذكاء الاصطناعي.',
  'jais-13b':   'ما الفرق بين الذكاء الاصطناعي التوليدي والتمييزي؟',
  'falcon-h1':  'لخّص فوائد تشغيل النماذج داخل المملكة العربية السعودية.',
  'qwen-3-72b': 'Explain why sovereign compute matters for Gulf enterprises.',
  'llama-3-70b':'Draft a value prop for an Arabic-first AI inference platform.',
  'mistral-l':  'Write a Python function that calls an OpenAI-compatible endpoint.',
  'bge-m3':     'Return vector for: sovereign GPU compute',
  'sdxl-turbo': 'A falcon perched on a server rack, cinematic lighting',
}

export const demoResponses: Record<string, string> = {
  'allam-7b':   'تُعدّ منصة DCP أول سوق سحابي سعودي لوحدات معالجة الرسوميات المصمَّم خصّيصًا للذكاء الاصطناعي العربي. نوفّر بنية تحتية سيادية داخل المملكة، مع فوترة بالريال لكل رمز، وزمن استجابة يقلّ عن ٤٠ مللي ثانية، وبلا أي تسريب للبيانات خارج الحدود — فقط حوسبة موثوقة تتحدث لغتك.',
  'jais-13b':   'الذكاء الاصطناعي التوليدي يُنشئ محتوى جديداً كالنصوص والصور، بينما التمييزي يُصنّف ويحلّل المدخلات الموجودة. الأول إبداعي، والثاني تشخيصي — وكلاهما يعملان بكفاءة أعلى على بنية DCP السيادية.',
  'falcon-h1':  'تشغيل النماذج داخل المملكة يعني: إقامة بيانات كاملة، التزام بنظام حماية البيانات الشخصية، زمن استجابة أقل بنسبة ٨٥٪، تكاليف بالريال بدون تحويلات بنكية، ودعم أصلي للعربية في طبقة النموذج الأساسية.',
  'qwen-3-72b': 'DCP is a GPU compute marketplace with Saudi data residency, Arabic AI models, and PDPL compliance. It offers an OpenAI-compatible API with per-token SAR billing. Saudi energy-cost conditions provide a structural advantage for sustained AI operations, and Arabic AI support is first-class across ALLaM 7B, Falcon H1, JAIS 13B, and BGE-M3.',
  'llama-3-70b':'DCP is the GPU compute marketplace with Saudi data residency and PDPL compliance. OpenAI-compatible API, Arabic AI models hosted in the Kingdom, per-token billing. Drop-in replacement for OpenAI — swap the base URL to https://api.dcp.sa/v1 and start generating.',
  'mistral-l':  'import { OpenAI } from "openai";\nconst client = new OpenAI({\n  baseURL: "https://api.dcp.sa/v1",\n  apiKey:  process.env.DCP_KEY,\n});\nconst r = await client.chat.completions.create({\n  model: "allam-7b-instruct",\n  messages: [{ role: "user", content: "مرحباً" }],\n});\nconsole.log(r.choices[0].message.content);',
  'bge-m3':     '[0.0142, -0.0831, 0.2104, 0.0572, -0.1109, … 1024 dim]',
  'sdxl-turbo': '[image generated · 1024×1024 · 2.3s · falcon.png]',
}

export const regions: RegionRow[] = [
  { id: 'ruh', name: 'Riyadh',  code: 'RUH', provider: 'STC Cloud',    lat: '24.71', lon: '46.67', count: 28 },
  { id: 'jed', name: 'Jeddah',  code: 'JED', provider: 'Mobily DC',    lat: '21.54', lon: '39.17', count: 11 },
  { id: 'dmm', name: 'Dammam',  code: 'DMM', provider: 'Aramco Edge',  lat: '26.43', lon: '50.10', count:  6 },
  { id: 'bah', name: 'Bahrain', code: 'BAH', provider: 'AWS me-south', lat: '26.07', lon: '50.55', count:  4 },
]

export const customers = ['SDAIA', 'STC', 'Tamimi', 'Tahakom', 'Elm', 'Bayan', 'Jahez', 'Tabby']
