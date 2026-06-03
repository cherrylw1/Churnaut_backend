'use client';

import React from 'react';

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-4xl bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      {/* Page Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5">
        <h1 className="text-xl font-bold tracking-wider font-mono uppercase text-white">
          SETTINGS
        </h1>
        <p className="text-xs font-mono text-gray-400 mt-1">
          Manage your account, security, and billing preferences.
        </p>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card 1: Account */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-6 flex flex-col justify-between hover:border-[#6366f1]/30 hover:bg-[var(--bg-elevated)]/30 transition-all group">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold bg-green-950/20 text-green-400 border border-green-900/40 px-2 py-0.5 rounded uppercase">
                ACTIVE
              </span>
              <span className="text-xs font-mono text-gray-500">Profile</span>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-sm font-mono font-bold text-white uppercase group-hover:text-[#6366f1] transition-colors">
                Account
              </h2>
              <p className="text-xs font-mono text-gray-400 leading-relaxed">
                Update your display name, email address, and workspace preferences.
              </p>
            </div>
          </div>
          
          <div className="pt-6">
            <button
              disabled
              className="w-full py-2 px-3 border border-[var(--border-subtle)] text-gray-500 font-mono text-xs rounded cursor-not-allowed text-center transition-all"
            >
              MANAGE &rarr;
            </button>
          </div>
        </div>

        {/* Card 2: Billing */}
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-6 flex flex-col justify-between opacity-80 transition-all">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold bg-yellow-950/20 text-yellow-500 border border-yellow-900/40 px-2 py-0.5 rounded uppercase">
                PENDING
              </span>
              <span className="text-xs font-mono text-gray-500">Lemon Squeezy</span>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-sm font-mono font-bold text-white uppercase">
                Billing
              </h2>
              <p className="text-xs font-mono text-gray-400 leading-relaxed">
                Manage your subscription, view invoices, and update payment details. Powered by Lemon Squeezy.
              </p>
            </div>
          </div>
          
          <div className="pt-6">
            <button
              disabled
              className="w-full py-2 px-3 border border-[var(--border-subtle)] text-gray-500 font-mono text-xs rounded opacity-40 cursor-not-allowed text-center"
            >
              COMING SOON
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
