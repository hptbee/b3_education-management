import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ClassroomCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Hover/press lift. Off for dense forms so clicking a child does not move the whole panel. */
  lift?: boolean
}

export function ClassroomCard({ className, lift = true, ...props }: ClassroomCardProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-sky-100 bg-white p-5 shadow-sm',
        lift && 'ui-card-lift',
        className,
      )}
      {...props}
    />
  )
}
