import React from 'react';
import Link from 'next/link';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  // Navigation items structure
  const navItems = [
    { label: 'Tracked Links', href: '/dashboard/links' },
    { label: 'Routing Rules', href: '/dashboard/rules' },
    { label: 'Playbook Library', href: '/dashboard/playbooks' },
    { label: 'AI Insights', href: '/dashboard/ai-insights' },
    { label: 'Scout', href: '/dashboard/scout' },
    { label: 'Analytics', href: '/dashboard/analytics' },
    { label: 'Snippet', href: '/dashboard/snippet' },
    { label: 'Settings', href: '/dashboard/settings' },
  ];

  return (
    <div className="min-h-screen bg-[#080B0F] text-white flex">
      {/* Sidebar Panel */}
      <aside className="w-64 bg-[#0d1117] border-r border-[#1a1f2e] flex flex-col justify-between select-none">
        <div>
          {/* Header Brand */}
          <div className="h-16 flex items-center px-6 border-b border-[#1a1f2e]">
            <Link href="/dashboard" className="text-xl font-bold tracking-wider hover:opacity-80 transition-opacity">
              CHURNAUT
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center px-4 py-3 rounded text-sm font-mono text-gray-400 hover:text-white hover:bg-[#1a1f2e]/45 border-l-2 border-transparent hover:border-[#6366f1] transition-all"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer Status Indicator */}
        <div className="p-4 border-t border-[#1a1f2e] bg-[#090d12]">
          <div className="flex items-center space-x-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <span className="text-xs font-mono text-gray-400 tracking-tight">
              Personalization Edge: <span className="text-green-400 font-semibold">Active</span>
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-[#1a1f2e] bg-[#0d1117]/50 backdrop-blur flex items-center justify-between px-8">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono px-2 py-1 bg-[#1a1f2e] text-[#6366f1] rounded uppercase">
              Dashboard
            </span>
          </div>
          <div>
            <Link
              href="/login"
              className="text-xs font-mono text-gray-400 hover:text-white hover:underline transition-all"
            >
              Sign Out
            </Link>
          </div>
        </header>

        {/* Dynamic Children Panel */}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
