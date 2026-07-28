import type { ReactNode } from 'react'
import RenterShell from './RenterShell'
import '../styles/renter-shell.css'

export default function RenterLayout({ children }: { children: ReactNode }) {
  return <RenterShell>{children}</RenterShell>
}
