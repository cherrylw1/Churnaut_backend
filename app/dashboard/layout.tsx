'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  HelpCircle,
  CreditCard,
  Search,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ToastContainer } from '@/components/ui/Toast';
import KeyboardShortcutsModal from '@/components/ui/KeyboardShortcutsModal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import SupportWidget from '@/components/SupportWidget';
import { supabaseBrowser } from '@/lib/supabase';
import { CommandPalette } from '@/components/dashboard/CommandPalette';
import { ChurnautMark } from '@/components/brand/ChurnautMark';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const overviewPilot = pathname === '/dashboard';
  const overviewPilotStyle = overviewPilot ? {
    '--room-bg': '#F4F1E9',
    '--room-panel': '#FFFDF8',
    '--room-panel-raised': '#EEEAE1',
    '--room-panel-muted': '#F7F4EE',
    '--room-line': '#DED7CC',
    '--room-line-strong': '#C8BFB3',
    '--signal-text': '#17221E',
    '--signal-text-secondary': '#5D6963',
    '--signal-text-muted': '#7E8883',
    '--signal-primary': '#176B4F',
    '--signal-primary-strong': '#10563F',
    '--signal-primary-soft': 'rgba(23, 107, 79, 0.10)',
    '--signal-positive': '#2F8D68',
    '--signal-warning': '#A66E10',
    '--signal-critical': '#B94A3C',
    '--signal-info': '#507F95',
    '--signal-glow': 'rgba(23, 107, 79, 0.16)',
    '--signal-focus': '#176B4F',
    colorScheme: 'light',
  } as React.CSSProperties : undefined;
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const mobileNavRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (!sidebarOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const main = document.getElementById('main-content');
    const drawer = mobileNavRef.current;
    const trigger = menuButtonRef.current;
    document.body.style.overflow = 'hidden';
    main?.setAttribute('inert', '');
    const getFocusable = () => Array.from(drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    const focusTimer = window.setTimeout(() => getFocusable()[0]?.focus(), 20);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSidebarOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      main?.removeAttribute('inert');
      (previouslyFocused ?? trigger)?.focus();
    };
  }, [sidebarOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Keep the server-side HttpOnly session cookie aligned when Supabase refreshes
  // the browser session in localStorage.
  React.useEffect(() => {
    let mounted = true;
    const authTimeout = window.setTimeout(() => {
      if (mounted) router.replace('/login');
    }, 15_000);

    // A stalled Supabase request must not leave the dashboard on an endless
    // “Securing your workspace…” screen. This is especially important when
    // Supabase is paused or temporarily unreachable: fail closed and return
    // the visitor to login so they can retry.
    const withTimeout = <T,>(promise: Promise<T>, timeoutMs = 10_000) => {
      let timeoutId: number | undefined;
      const timeout = new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('Authentication timed out')), timeoutMs);
      });
      return Promise.race([promise, timeout]).finally(() => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      });
    };

    const syncSession = async () => {
      try {
        const { data: { session }, error } = await withTimeout(supabaseBrowser.auth.getSession());
        if (error || !session) {
          await withTimeout(fetch('/api/auth/session', { method: 'DELETE' }), 5_000).catch(() => undefined);
          if (mounted) router.replace('/login');
          return;
        }

        const response = await withTimeout(fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: session.access_token, expires_at: session.expires_at }),
        }), 10_000);
        if (!response.ok) {
          await supabaseBrowser.auth.signOut();
          await fetch('/api/auth/session', { method: 'DELETE' });
          if (mounted) router.replace('/login');
          return;
        }
        if (mounted) {
          window.clearTimeout(authTimeout);
          setAuthReady(true);
        }
      } catch (error) {
        console.error('[Auth] Failed to establish the dashboard session:', error);
        window.clearTimeout(authTimeout);
        if (mounted) router.replace('/login');
      }
    };
    void syncSession();

    const { data: authListener } = supabaseBrowser.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        void (async () => {
          try {
            const response = await withTimeout(fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: session.access_token, expires_at: session.expires_at }),
            }), 10_000);
            if (!response.ok) throw new Error(`Session refresh failed (${response.status})`);
          } catch (error) {
            console.error('[Auth] Failed to refresh the dashboard session:', error);
            await withTimeout(fetch('/api/auth/session', { method: 'DELETE' }), 5_000).catch(() => undefined);
            if (mounted) {
              setAuthReady(false);
              router.replace('/login');
            }
          }
        })();
      } else if (event === 'SIGNED_OUT') {
        setAuthReady(false);
        void withTimeout(fetch('/api/auth/session', { method: 'DELETE' }), 5_000).catch(() => undefined);
        router.replace('/login');
      }
    });
    return () => {
      mounted = false;
      window.clearTimeout(authTimeout);
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  // Bind keyboard shortcuts hook
  useKeyboardShortcuts(() => setShortcutsOpen(true));

  const observeGroup = [
    { label: 'Home', href: '/dashboard', icon: HomeIcon },
    { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { label: 'Scout', href: '/dashboard/scout', icon: Radar },
  ];

  const activateGroup = [
    { label: 'Tracked Links', href: '/dashboard/links', icon: Link2 },
    { label: 'Routing Rules', href: '/dashboard/rules', icon: Sliders },
  ];

  const intelligenceGroup = [
    { label: 'ICP Builder', href: '/dashboard/icp', icon: Target },
    { label: 'AI Insights', href: '/dashboard/ai-insights', icon: Sparkles },
  ];

  const connectGroup = [
    { label: 'Integrations', href: '/dashboard/integrations', icon: Plug },
    { label: 'Snippet', href: '/dashboard/snippet', icon: Code2 },
  ];

  const workspaceGroup = [
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
    { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
    { label: 'Support', href: '/dashboard/support', icon: HelpCircle },
  ];

  // Combine to find the current active page label for breadcrumbs
  const allItems = [...observeGroup, ...activateGroup, ...intelligenceGroup, ...connectGroup, ...workspaceGroup];
  const commandItems = [...allItems, { label: 'Playbook Library', href: '/dashboard/playbooks', icon: Sliders }];
  const activeItem = allItems.find(item => item.href === pathname) || allItems.find(item => pathname.startsWith(item.href) && item.href !== '/dashboard');
  const pageLabel = activeItem ? activeItem.label : 'Dashboard';

  const groupAccent: Record<string, string> = {
    OBSERVE: 'var(--signal-observe)',
    ACTIVATE: 'var(--signal-activate)',
    INTELLIGENCE: 'var(--signal-intelligence)',
    CONNECT: 'var(--accent)',
    WORKSPACE: 'var(--text-secondary)',
  };

  const renderNavGroup = (title: string, items: Array<{ label: string; href: string; icon: React.ComponentType<{ className?: string }> }>) => (
    <div className="space-y-1.5">
      <div className="px-4 text-[10px] font-mono font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]">
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
              aria-current={isActive ? 'page' : undefined}
              className={`dashboard-nav-item flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-sans font-medium transition-all duration-150 relative overflow-hidden ${
                isActive
                  ? 'bg-[var(--accent)]/10 text-[var(--text-primary)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
              }`}
            >
              <div
                className="dashboard-nav-rail absolute left-0 top-1.5 bottom-1.5 transition-[width] duration-150 ease-out"
                style={{ width: isActive ? '3px' : '0px', backgroundColor: groupAccent[title] }}
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
      <div className="flex h-[84px] flex-shrink-0 items-center border-b border-[var(--border-subtle)] px-6">
        <ChurnautMark href="/dashboard" onClick={() => setSidebarOpen(false)} />
      </div>

      {/* Navigation Links */}
      <nav aria-label="Primary navigation" className="p-4 space-y-7 flex-1 overflow-y-auto">
        {renderNavGroup('OBSERVE', observeGroup)}
        {renderNavGroup('ACTIVATE', activateGroup)}
        {renderNavGroup('INTELLIGENCE', intelligenceGroup)}
        {renderNavGroup('CONNECT', connectGroup)}
        {renderNavGroup('WORKSPACE', workspaceGroup)}

        <div className="dashboard-nav-footer mt-auto border-t border-[var(--border-subtle)] px-4 pt-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.13em] text-[var(--text-muted)]">Workspace</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Your signal system, in one place.</p>
        </div>
      </nav>
    </div>
  );

  // Do not mount dashboard pages until the refreshed access token has been
  // validated and copied into the HttpOnly server cookie. This prevents child
  // effects from racing the cookie refresh and failing with a transient 401.
  if (!authReady) {
    return (
      <div className="dashboard-app dashboard-auth-state min-h-screen bg-[var(--bg-base)] text-[var(--text-secondary)] flex items-center justify-center font-sans" role="status" aria-live="polite">
        <div className="dashboard-auth-state-card dashboard-surface dashboard-surface-owner px-6 py-5 text-center">
          <ChurnautMark href="/" />
          <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">Securing your workspace…</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Checking your session before opening Signal Field.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-app min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex" data-overview-pilot={overviewPilot ? 'true' : undefined} style={overviewPilotStyle}>
      {/* Sidebar Panel - Desktop */}
      <aside aria-label="Primary navigation" className="dashboard-sidebar hidden lg:flex w-60 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex-col select-none flex-shrink-0">
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
              className="fixed inset-0 bg-black z-40 lg:hidden"
            />
            {/* Slide-out Sidebar */}
            <motion.aside
              initial={reduceMotion ? false : { x: -280 }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: -280 }}
              transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 200 }}
              role="dialog"
              aria-modal="true"
              aria-label="Primary navigation"
              id="mobile-navigation"
              ref={mobileNavRef}
              className="dashboard-mobile-drawer fixed top-0 bottom-0 left-0 w-72 max-w-[calc(100vw-2rem)] bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] z-50 lg:hidden flex flex-col select-none shadow-2xl"
            >
              {renderSidebarContent()}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="dashboard-main flex-1 flex flex-col min-h-screen bg-[var(--bg-base)] min-w-0">
        {/* Top Header */}
        <header className="h-[68px] border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-sm flex items-center justify-between px-4 md:px-8 flex-shrink-0" aria-label="Workspace toolbar">
          <div className="flex items-center space-x-3">
            {/* Hamburger Button */}
            <button
              ref={menuButtonRef}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
              aria-controls="mobile-navigation"
              className="dashboard-menu-button lg:hidden inline-flex h-10 w-10 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2 text-[12px] font-mono uppercase tracking-[0.05em] text-[var(--text-muted)] font-medium">
              <Link href="/dashboard" className="hover:text-[var(--text-primary)] transition-colors">Signal Field</Link>
              {pageLabel !== 'Home' && (
                <>
                  <span className="text-[var(--border-default)] font-normal">/</span>
                  <span className="text-[var(--text-primary)] font-semibold">{pageLabel}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCommandOpen(true)} className="dashboard-toolbar-control hidden sm:inline-flex h-9 items-center gap-2 border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-xs text-[var(--text-muted)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/5 hover:text-[var(--text-primary)]" aria-label="Search workspace">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Search workspace</span><kbd className="ml-2 rounded border border-[var(--border-default)] px-1.5 py-0.5 text-[10px]">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={async () => {
                await supabaseBrowser.auth.signOut();
                await fetch('/api/auth/session', { method: 'DELETE' });
                router.push('/login');
                router.refresh();
              }}
              className="dashboard-toolbar-control min-h-9 px-3 text-[12px] font-mono uppercase tracking-[0.05em] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Dynamic Children Panel */}
        <main className="dashboard-main-content flex-1 min-w-0 p-4 md:p-8 bg-[var(--bg-base)]" id="main-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
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
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} items={commandItems.map((item) => ({ ...item, group: item.href === '/dashboard' || item.href.startsWith('/dashboard/analytics') || item.href.startsWith('/dashboard/scout') ? 'Observe' : item.href.startsWith('/dashboard/links') || item.href.startsWith('/dashboard/rules') || item.href.startsWith('/dashboard/playbooks') ? 'Activate' : item.href.startsWith('/dashboard/icp') || item.href.startsWith('/dashboard/ai-insights') ? 'Intelligence' : item.href.startsWith('/dashboard/integrations') || item.href.startsWith('/dashboard/snippet') ? 'Connect' : 'Workspace' }))} />
    </div>
  );
}
