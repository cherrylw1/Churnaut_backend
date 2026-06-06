'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home as HomeIcon, 
  Target, 
  Link2, 
  Sliders, 
  Radar, 
  Sparkles, 
  BarChart3, 
  Code2, 
  Settings,
  Menu,
  Plug,
  HelpCircle
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ToastContainer } from '@/components/ui/Toast';
import KeyboardShortcutsModal from '@/components/ui/KeyboardShortcutsModal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import SupportWidget from '@/components/SupportWidget';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Bind keyboard shortcuts hook
  useKeyboardShortcuts(() => setShortcutsOpen(true));

  const coreGroup = [
    { label: 'Home', href: '/dashboard', icon: HomeIcon },
    { label: 'Tracked Links', href: '/dashboard/links', icon: Link2 },
    { label: 'Routing Rules', href: '/dashboard/rules', icon: Sliders },
    { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  ];

  const intelligenceGroup = [
    { label: 'Scout', href: '/dashboard/scout', icon: Radar },
    { label: 'ICP Builder', href: '/dashboard/icp', icon: Target },
    { label: 'AI Insights', href: '/dashboard/ai-insights', icon: Sparkles },
  ];

  const setupGroup = [
    { label: 'Integrations', href: '/dashboard/integrations', icon: Plug },
    { label: 'Snippet', href: '/dashboard/snippet', icon: Code2 },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
    { label: 'Support', href: '/dashboard/support', icon: HelpCircle },
  ];

  // Combine to find the current active page label for breadcrumbs
  const allItems = [...coreGroup, ...intelligenceGroup, ...setupGroup];
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
              onClick={() => setSidebarOpen(false)}
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

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[var(--bg-surface)]">
      {/* Header Brand */}
      <div className="h-16 flex items-center px-6 border-b border-[var(--border-subtle)] mb-4 flex-shrink-0">
        <Link 
          href="/dashboard" 
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-2 font-sans font-bold text-[18px] text-[var(--text-primary)] hover:opacity-80 transition-opacity"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
          CHURNAUT
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="p-4 space-y-6 flex-1 overflow-y-auto">
        {renderNavGroup('CORE', coreGroup)}
        {renderNavGroup('INTELLIGENCE', intelligenceGroup)}
        {renderNavGroup('SETUP', setupGroup)}

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
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex">
      {/* Sidebar Panel - Desktop */}
      <aside className="hidden md:flex w-64 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex-col select-none flex-shrink-0">
        {renderSidebarContent()}
      </aside>

      {/* Sidebar Panel - Mobile Drawer Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black z-40 md:hidden"
            />
            {/* Slide-out Sidebar */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 bottom-0 left-0 w-64 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] z-50 md:hidden flex flex-col select-none shadow-2xl"
            >
              {renderSidebarContent()}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden bg-[var(--bg-base)]">
        {/* Top Header */}
        <header className="h-16 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between px-4 md:px-8 flex-shrink-0">
          <div className="flex items-center space-x-3">
            {/* Hamburger Button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none"
            >
              <Menu className="w-5 h-5" />
            </button>
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
        <main className="flex-1 p-4 md:p-8 bg-[var(--bg-base)]">
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

      {/* Global Toast notifications */}
      <ToastContainer />

      {/* Keyboard Shortcuts Legend helper */}
      <KeyboardShortcutsModal 
        isOpen={shortcutsOpen} 
        onClose={() => setShortcutsOpen(false)} 
      />

      {/* Support widget helper */}
      <SupportWidget />
    </div>
  );
}

