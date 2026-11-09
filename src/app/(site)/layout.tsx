import type { ReactNode } from 'react'
import '../globals.css'

export default function SiteLayout({ children }: { children: ReactNode }) {
  // The locale is resolved by each localized public route; the admin is a separate layout.
  return <html lang="uk"><body>{children}</body></html>
}
