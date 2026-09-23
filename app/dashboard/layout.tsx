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
  Keyboard,
  LogOut,
  BookOpen,
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
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{ name: string; email: string }>({ name: 'Admin', email: '' });
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
        if (session.user) {
          const email = session.user.email || '';
          const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || email.split('@')[0] || 'User';
          setUserProfile({ name, email });
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
        if (session.user) {
          const email = session.user.email || '';
          const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || email.split('@')[0] || 'User';
          setUserProfile({ name, email });
        }
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

  const menuGroup = [
    { label: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { label: 'Scout AI', href: '/dashboard/scout', icon: Radar },
    { label: 'Tracked Links', href: '/dashboard/links', icon: Link2 },
    { label: 'Routing Rules', href: '/dashboard/rules', icon: Sliders },
    { label: 'Playbook Library', href: '/dashboard/playbooks', icon: BookOpen },
  ];

  const intelligenceGroup = [
    { label: 'ICP Builder', href: '/dashboard/icp', icon: Target },
    { label: 'AI Insights', href: '/dashboard/ai-insights', icon: Sparkles },
  ];

  const generalGroup = [
    { label: 'Integrations', href: '/dashboard/integrations', icon: Plug },
    { label: 'Snippet', href: '/dashboard/snippet', icon: Code2 },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
    { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
    { label: 'Help & Support', href: '/dashboard/support', icon: HelpCircle },
  ];

  const allItems = [...menuGroup, ...intelligenceGroup, ...generalGroup];
  const commandItems = allItems;

  const renderNavGroup = (title: string, items: Array<{ label: string; href: string; icon: React.ComponentType<{ className?: string }> }>) => (
    <div className="space-y-1">
      <div className="px-3.5 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-slate-400">
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
              className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all relative ${
                isActive
                  ? 'bg-[#165B40]/10 text-[#165B40] font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-1 bg-[#165B40] rounded-r-full" />
              )}
              {item.icon && (
                <item.icon className={`w-4 h-4 flex-shrink-0 transition-colors ${
                  isActive ? 'text-[#165B40]' : 'text-slate-400 group-hover:text-slate-700'
                }`} />
              )}
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white">
      {/* Header Brand */}
      <div className="flex h-[76px] flex-shrink-0 items-center border-b border-slate-100 px-6">
        <ChurnautMark href="/dashboard" onClick={() => setSidebarOpen(false)} />
      </div>

      {/* Navigation Links */}
      <nav aria-label="Primary navigation" className="p-3.5 space-y-6 flex-1 overflow-y-auto">
        {renderNavGroup('MENU', menuGroup)}
        {renderNavGroup('INTELLIGENCE', intelligenceGroup)}
        {renderNavGroup('GENERAL', generalGroup)}
      </nav>

      {/* Bottom Promo Bento Card */}
      <div className="p-3.5 mt-auto border-t border-slate-100">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#123828] via-[#165B40] to-[#0D2E20] p-4 text-white shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <Radar className="w-3.5 h-3.5 text-emerald-300" />
            </div>
            <span className="text-xs font-bold text-emerald-100">Scout AI Radar</span>
          </div>
          <p className="text-[11px] text-emerald-100/80 leading-relaxed mb-3">
            Real-time intent signals & account pressure monitoring.
          </p>
          <Link
            href="/dashboard/scout"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center w-full rounded-full bg-white text-[#165B40] hover:bg-emerald-50 text-xs font-semibold py-2 px-3 transition-colors shadow-xs"
          >
            Launch Scout ↗
          </Link>
        </div>
      </div>
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
    <div className="dashboard-app min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex">
      {/* Sidebar Panel - Desktop */}
      <aside aria-label="Primary navigation" className="dashboard-sidebar hidden lg:flex w-64 bg-white border-r border-slate-200/80 flex-col select-none flex-shrink-0">
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
        <header className="h-[74px] border-b border-slate-200/80 bg-white/95 backdrop-blur-sm flex items-center justify-between px-5 md:px-8 flex-shrink-0" aria-label="Workspace toolbar">
          <div className="flex items-center gap-3">
            {/* Hamburger Button */}
            <button
              ref={menuButtonRef}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
              aria-controls="mobile-navigation"
              className="dashboard-menu-button lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Donezo-style Pill Search Bar */}
            <button 
              type="button" 
              onClick={() => setCommandOpen(true)} 
              className="dashboard-search-trigger relative flex items-center gap-2.5 rounded-full border border-slate-200 bg-[#F4F5F7]/80 hover:bg-white hover:border-slate-300 px-4 py-2 text-xs text-slate-500 hover:text-slate-900 transition-all shadow-xs w-48 sm:w-72 md:w-80 text-left" 
              aria-label="Search workspace"
            >
              <Search className="h-4 w-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">Search signals, rules, deals...</span>
              <kbd className="ml-auto hidden sm:inline-flex rounded-full bg-white border border-slate-200/90 px-2 py-0.5 text-[10px] font-mono text-slate-500 font-semibold shadow-xs">⌘K</kbd>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="dashboard-circle-button hidden sm:inline-flex"
              title="Keyboard Shortcuts"
              aria-label="Keyboard Shortcuts"
            >
              <Keyboard className="w-4 h-4 text-slate-600" />
            </button>

            <Link
              href="/dashboard/support"
              className="dashboard-circle-button hidden sm:inline-flex"
              title="Help & Support"
              aria-label="Help & Support"
            >
              <HelpCircle className="w-4 h-4 text-slate-600" />
            </Link>

            {/* User Profile Chip */}
            <div className="flex items-center gap-2.5 pl-2 sm:border-l sm:border-slate-200">
              <div className="w-9 h-9 rounded-full bg-[#165B40]/10 text-[#165B40] font-bold text-xs flex items-center justify-center border border-[#165B40]/25 flex-shrink-0">
                {userProfile.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-xs font-semibold text-slate-900 truncate max-w-[130px]">{userProfile.name}</div>
                <div className="text-[11px] text-slate-400 truncate max-w-[130px]">{userProfile.email || 'Admin'}</div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await supabaseBrowser.auth.signOut();
                  await fetch('/api/auth/session', { method: 'DELETE' });
                  router.push('/login');
                  router.refresh();
                }}
                className="dashboard-circle-button !w-8 !h-8 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors ml-1"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
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
