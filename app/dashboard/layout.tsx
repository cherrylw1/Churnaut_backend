'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home as HomeIcon, 
  Target, 
  Link2, 
  Sliders, 
  BookOpen, 
  Radar, 
  Sparkles, 
  BarChart3, 
  Code2, 
  Settings
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();

  const coreGroup = [
    { label: 'Home', href: '/dashboard', icon: HomeIcon },
    { label: 'Tracked Links', href: '/dashboard/links', icon: Link2 },
    { label: 'Routing Rules', href: '/dashboard/rules', icon: Sliders },
    { label: 'Playbook Library', href: '/dashboard/playbooks', icon: BookOpen },
  ];

  const intelligenceGroup = [
    { label: 'Scout', href: '/dashboard/scout', icon: Radar },
    { label: 'ICP Builder', href: '/dashboard/icp', icon: Target },
    { label: 'AI Insights', href: '/dashboard/ai-insights', icon: Sparkles },
  ];

  const accountGroup = [
    { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { label: 'Snippet', href: '/dashboard/snippet', icon: Code2 },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  // Combine to find the current active page label for breadcrumbs
  const allItems = [...coreGroup, ...intelligenceGroup, ...accountGroup];
  const activeItem = allItems.find(item => item.href === pathname) || allItems.find(item => pathname.startsWith(item.href) && item.href !== '/dashboard');
  const pageLabel = activeItem ? activeItem.label : 'Dashboard';

  const renderNavGroup = (title: string, items: typeof coreGroup) => (
    <div className="space-y-1.5">
      <div className="px-4 text-[10px] font-sans font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {title}
      </div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/dashboard');
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-md text-[14px] font-sans font-medium transition-all duration-150 relative overflow-hidden ${
                isActive
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
              }`}
            >
              <div 
                className="absolute left-0 top-0 bottom-0 bg-[var(--accent)] transition-[width] duration-150 ease-out"
                style={{ width: isActive ? '2px' : '0px' }}
              />
              {item.icon && <item.icon className="w-4 h-4" />}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex">
      {/* Sidebar Panel */}
      <aside className="w-64 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex flex-col select-none flex-shrink-0">
        {/* Header Brand */}
        <div className="h-16 flex items-center px-6 border-b border-[var(--border-subtle)] mb-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-sans font-bold text-[18px] text-[var(--text-primary)] hover:opacity-80 transition-opacity">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
            CHURNAUT
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-6">
          {renderNavGroup('CORE', coreGroup)}
          {renderNavGroup('INTELLIGENCE', intelligenceGroup)}
          {renderNavGroup('ACCOUNT', accountGroup)}

          {/* Sidebar Status Indicator */}
          <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center space-x-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <span className="text-[12px] font-sans font-medium text-[var(--text-secondary)]">
              Edge: <span className="text-green-500 font-semibold">Active</span>
            </span>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden bg-[var(--bg-base)]">
        {/* Top Header */}
        <header className="h-16 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between px-8">
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 text-[14px] font-sans text-[var(--text-secondary)] font-medium">
              <Link href="/dashboard" className="hover:text-[var(--text-primary)] transition-colors">Dashboard</Link>
              {pageLabel !== 'Home' && (
                <>
                  <span className="text-[var(--text-muted)] font-normal">/</span>
                  <span className="text-[var(--text-primary)] font-semibold">{pageLabel}</span>
                </>
              )}
            </div>
          </div>
          <div>
            <Link
              href="/login"
              className="text-[14px] font-sans font-normal text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
            >
              Sign Out
            </Link>
          </div>
        </header>

        {/* Dynamic Children Panel */}
        <main className="flex-1 p-8 bg-[var(--bg-base)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
