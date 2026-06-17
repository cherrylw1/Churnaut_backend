import React from 'react';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#1A1614] text-white flex flex-col justify-between p-8 font-sans selection:bg-[#C2683D]/30">
      {/* Top Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-6">
        <div className="text-xl font-bold tracking-widest font-mono text-[#C2683D]">CHURNAUT</div>
        <div className="flex items-center space-x-6 font-mono text-sm">
          <a href="/login" className="text-[#C4BAB0] hover:text-white transition-colors">
            SIGN IN
          </a>
          <a href="/signup" className="border border-[var(--border-subtle)] hover:border-[#C2683D] text-white px-4 py-2 rounded transition-all">
            GET STARTED
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-4xl w-full mx-auto text-center my-auto py-12 space-y-8">
        <div className="inline-block border border-[#C2683D]/20 bg-[#C2683D]/5 text-[#C2683D] font-mono text-xs px-3 py-1 rounded-full uppercase tracking-wider">
          Real-time Personalization Engine
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-none bg-gradient-to-r from-white via-gray-300 to-gray-500 bg-clip-text text-transparent">
          Banish customer churn with dynamic personalization.
        </h1>
        <p className="text-[#C4BAB0] max-w-xl mx-auto text-sm sm:text-base font-light">
          Churnaut routes leads, injects custom copy, and serves Calendly slots in real-time, matching incoming signals with priority-based rules.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center pt-4">
          <a
            href="/signup"
            className="w-full sm:w-auto bg-[#C2683D] hover:bg-[#A8552F] text-white font-mono text-sm py-3.5 px-8 rounded transition-all active:scale-[0.98] shadow-lg shadow-[#C2683D]/15 text-center"
          >
            INITIALIZE WORKSPACE
          </a>
          <a
            href="/login"
            className="w-full sm:w-auto border border-[var(--border-subtle)] hover:border-gray-500 text-[#C4BAB0] hover:text-white font-mono text-sm py-3.5 px-8 rounded transition-all text-center"
          >
            ACCESS DASHBOARD
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto border-t border-[var(--border-subtle)] pt-6 flex flex-col sm:flex-row justify-between items-center text-xs text-[#9B9189] font-mono gap-4">
        <div>© 2026 Churnaut. All rights reserved.</div>
        <div className="flex space-x-6">
          <a href="#" className="hover:text-white transition-colors">PRIVACY</a>
          <a href="#" className="hover:text-white transition-colors">TERMS</a>
          <a href="/snippet.js" className="hover:text-white transition-colors">SDK</a>
        </div>
      </footer>
    </main>
  );
}
