'use client'

import {
  Home,
  Users,
  UsersRound,
  Star,
  Gift,
  Crown,
  Sparkles,
  Trophy,
  History,
  CalendarCheck,
  School,
  Settings,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGroup, motion } from 'framer-motion'
import { SidebarClassContext } from './sidebar-class-context'
import { SidebarPersistenceStatus } from './sidebar-persistence-status'
import { IconTouchButton } from '@/src/components/classroom'
import { useNavSidebar } from '@/src/store/NavSidebarContext'
import { cn } from '@/lib/utils'

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  title?: string
}

type NavSection = {
  label?: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    items: [{ label: 'Trang chủ', href: '/', icon: Home }],
  },
  {
    label: 'Lớp học',
    items: [
      { label: 'Học sinh', href: '/students', icon: Users },
      { label: 'Điểm danh', href: '/attendance', icon: CalendarCheck },
      { label: 'Tổ / Nhóm', href: '/teams', icon: UsersRound },
    ],
  },
  {
    label: 'Điểm & quà',
    items: [
      { label: 'Tích điểm', href: '/points', icon: Star },
      { label: 'Bảng xếp hạng', href: '/ranking', icon: Crown },
      { label: 'Quà tặng', href: '/rewards', icon: Gift },
    ],
  },
  {
    label: 'Hoạt động',
    items: [
      { label: 'Công cụ', href: '/tools', icon: Sparkles, title: 'Thử thách & Công cụ' },
      { label: 'Tuyên dương', href: '/recognition', icon: Trophy },
      { label: 'Lịch sử', href: '/history', icon: History },
    ],
  },
]

function isNavActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function SidebarNavLink({
  href,
  label,
  icon: Icon,
  title,
  active,
  collapsed = false,
  onNavigate,
}: NavItem & { active: boolean; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={() => onNavigate?.()}
      aria-current={active ? 'page' : undefined}
      title={title ?? label}
      className={cn(
        'relative flex min-h-10 items-center rounded-2xl text-sm font-bold transition-colors transition-shadow duration-[var(--motion-smooth)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        collapsed
          ? 'mx-auto min-h-10 min-w-10 justify-center px-0 py-2'
          : 'gap-2.5 px-3 py-2 text-left',
        active
          ? 'bg-white text-brand-dark shadow-sm'
          : 'text-slate-600 hover:bg-white/80 hover:text-brand-dark',
      )}
    >
      {active && !collapsed ? (
        <motion.span
          layoutId="sidebar-nav-indicator"
          className="absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand"
          aria-hidden
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      ) : null}
      <Icon className={cn('size-5 shrink-0', active ? 'text-brand' : 'text-slate-400')} />
      <span className={cn(collapsed ? 'sr-only' : 'truncate')}>{label}</span>
    </Link>
  )
}

export function Sidebar({
  mobileOpen = false,
  onNavigate,
}: {
  mobileOpen?: boolean
  onNavigate?: () => void
}) {
  const { collapsed, toggleCollapsed } = useNavSidebar()
  const pathname = usePathname() ?? ''
  const settingsActive = isNavActive(pathname, '/settings')
  const classroomsActive = isNavActive(pathname, '/classrooms')

  const iconRail = collapsed && !mobileOpen

  const sidebarToggleButton = (
    <IconTouchButton
      onClick={toggleCollapsed}
      className="absolute right-0 top-14 z-10 hidden -translate-y-1/2 translate-x-1/2 border border-sky-100 bg-white text-slate-500 shadow-sm hover:border-brand/20 hover:bg-white hover:text-brand md:inline-flex"
      aria-label={collapsed ? 'Mở menu điều hướng' : 'Thu gọn menu điều hướng'}
      aria-expanded={!collapsed}
    >
      {collapsed ? <PanelLeft className="size-5" /> : <PanelLeftClose className="size-5" />}
    </IconTouchButton>
  )

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-sky-100 bg-surface-soft',
        'fixed inset-y-0 left-0 z-50 transition-[transform,width] duration-[var(--motion-smooth)] ease-[var(--motion-ease-interactive)] md:relative',
        mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0',
        !mobileOpen && collapsed ? 'md:w-16' : 'w-64',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {iconRail ? <div className="hidden h-[108px] shrink-0 md:block" /> : <SidebarClassContext />}
        {sidebarToggleButton}

        <LayoutGroup id="sidebar-nav">
        <nav
          aria-label="Điều hướng lớp học"
          className={cn(
            'flex flex-1 flex-col overflow-y-auto scrollbar-thin',
            iconRail ? 'gap-1 px-2 py-2 md:gap-1' : 'gap-2.5 px-3 py-1',
          )}
        >
          {navSections.map((section) => (
            <div key={section.label ?? section.items[0]?.href} className="flex flex-col gap-0.5">
              {section.label && !iconRail ? (
                <p className="px-3 pb-0.5 pt-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                  {section.label}
                </p>
              ) : null}
              {section.items.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  {...item}
                  active={isNavActive(pathname, item.href)}
                  collapsed={iconRail}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
        </nav>
        </LayoutGroup>

        <div
          className={cn(
            'shrink-0 border-t border-sky-100/80 py-2.5',
            iconRail ? 'px-2' : 'px-3',
          )}
        >
          {!iconRail ? <SidebarPersistenceStatus /> : null}
          <SidebarNavLink
            href="/classrooms"
            label="Quản lý lớp"
            icon={School}
            active={classroomsActive}
            collapsed={iconRail}
            onNavigate={onNavigate}
          />
          <SidebarNavLink
            href="/settings"
            label="Cài đặt"
            icon={Settings}
            active={settingsActive}
            collapsed={iconRail}
            onNavigate={onNavigate}
          />
          {!iconRail ? (
            <p className="mt-3 px-3 text-[11px] font-semibold text-slate-400">
              <a
                href="https://www.facebook.com/10t03/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                Copyright by Tùng Huỳnh
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
