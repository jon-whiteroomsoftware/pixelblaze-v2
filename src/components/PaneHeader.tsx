import { type ReactNode } from 'react'

export function PaneHeader({ children }: { children: ReactNode }) {
  return (
    <div className="h-9 flex items-center px-3 border-b border-seam shrink-0 gap-2 text-sm font-mono text-structural bg-panel">
      {children}
    </div>
  )
}
