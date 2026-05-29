'use client';

import React from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      {/* Page Header */}
      <div className="border-b border-[#1a1f2e] pb-5">
        <h1 className="text-xl font-bold tracking-wider font-mono uppercase text-white">
          SETTINGS
        </h1>
        <p className="text-xs font-mono text-gray-400 mt-1">
          Manage your workspace configurations, data integrations, and webhook triggers.
        </p>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card 1: Webhook Configuration */}
        <div className="border border-[#1a1f2e] bg-[#0d1117]/30 rounded-lg p-6 flex flex-col justify-between hover:border-[#6366f1]/50 hover:bg-[#0d1117]/50 transition-all group">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold bg-[#1a1f2e] text-[#6366f1] border border-[#1a1f2e] px-2 py-0.5 rounded uppercase">
                ACTIVE
              </span>
              <span className="text-xs font-mono text-gray-500">HTTP Webhook</span>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-sm font-mono font-bold text-white uppercase group-hover:text-[#6366f1] transition-colors">
                Webhook Configuration
              </h2>
              <p className="text-xs font-mono text-gray-400 leading-relaxed">
                Configure incoming data field mappings, manage authorization tokens, and review webhook ingestion transaction logs in real time.
              </p>
            </div>
          </div>
          
          <div className="pt-6">
            <Link
              href="/dashboard/settings/webhooks"
              className="inline-block bg-[#1a1f2e] hover:bg-[#6366f1] text-white font-mono text-xs py-2 px-4 rounded text-center transition-all active:scale-[0.98] w-full md:w-auto"
            >
              Configure Webhooks &rarr;
            </Link>
          </div>
        </div>

        {/* Card 2: CRM Integrations */}
        <div className="border border-[#1a1f2e] bg-[#0d1117]/30 rounded-lg p-6 flex flex-col justify-between relative overflow-hidden group">
          {/* Subtle visual gradient background indicating coming soon */}
          <div className="absolute inset-0 bg-gradient-to-tr from-[#6366f1]/5 via-transparent to-transparent opacity-40 pointer-events-none" />

          <div className="space-y-4 z-10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold bg-[#1a1f2e] text-[#f59e0b] border border-[#1a1f2e] px-2 py-0.5 rounded uppercase">
                COMING SOON
              </span>
              <span className="text-xs font-mono text-gray-500">Native Integration</span>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-sm font-mono font-bold text-white uppercase">
                CRM Integrations
              </h2>
              <p className="text-xs font-mono text-gray-400 leading-relaxed">
                Directly connect Hubspot, Salesforce, Pipedrive, and modern CRM suites. Streamline pipeline tracking and automate visitor segment conversions.
              </p>
            </div>

            {/* Visual CRM Logo Placeholders */}
            <div className="flex items-center space-x-3 pt-2">
              <div className="border border-[#1a1f2e] bg-[#080B0F] px-2.5 py-1 rounded font-mono text-[9px] text-gray-500 select-none">
                HUBSPOT
              </div>
              <div className="border border-[#1a1f2e] bg-[#080B0F] px-2.5 py-1 rounded font-mono text-[9px] text-gray-500 select-none">
                SALESFORCE
              </div>
              <div className="border border-[#1a1f2e] bg-[#080B0F] px-2.5 py-1 rounded font-mono text-[9px] text-gray-500 select-none">
                PIPEDRIVE
              </div>
            </div>
          </div>
          
          <div className="pt-6 z-10">
            <button
              disabled
              className="inline-block bg-[#1a1f2e]/40 text-gray-500 font-mono text-xs py-2 px-4 rounded text-center cursor-not-allowed w-full md:w-auto"
            >
              Unavailable
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
