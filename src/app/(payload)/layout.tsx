import type { ReactNode } from 'react'
import config from '@payload-config'
import { RootLayout } from '@payloadcms/next/layouts'
import '@payloadcms/next/css'

export default function PayloadLayout({ children }: { children: ReactNode }) {
  return <RootLayout config={config}>{children}</RootLayout>
}
