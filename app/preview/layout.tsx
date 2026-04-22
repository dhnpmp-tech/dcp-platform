import type { Metadata } from 'next'
import { Instrument_Serif, Noto_Naskh_Arabic } from 'next/font/google'

const instrumentSerif = Instrument_Serif({
  weight: ['400'],
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument-serif',
})

const notoNaskh = Noto_Naskh_Arabic({
  weight: ['400', '500', '600', '700'],
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-noto-naskh',
})

export const metadata: Metadata = {
  title: 'DCP — Preview',
  description: 'Preview of the redesigned DCP homepage (Claude Design handover).',
}

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${instrumentSerif.variable} ${notoNaskh.variable}`}>
      {children}
    </div>
  )
}
