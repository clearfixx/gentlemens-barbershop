import type { ReactNode } from 'react'
import '../globals.css'

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <html lang="uk"><body>{children}</body></html>
}
