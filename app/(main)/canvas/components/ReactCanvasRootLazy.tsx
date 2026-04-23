'use client'

import dynamic from 'next/dynamic'
import type { ReactCanvasRootProps } from './ReactCanvasRoot'

const ReactCanvasRoot = dynamic(
  () => import('./ReactCanvasRoot').then((m) => ({ default: m.ReactCanvasRoot })),
  { ssr: false, loading: () => <div className="min-h-screen w-full bg-white dark:bg-[#0f1012]" /> }
)

export function ReactCanvasRootLazy(props: ReactCanvasRootProps) {
  return <ReactCanvasRoot {...props} />
}
