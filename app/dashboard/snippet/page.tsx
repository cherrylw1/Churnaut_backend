'use client';

import React, { useState, useEffect } from 'react';

interface ClientProfile {
  id: string;
  company_name: string;
  snippet_key: string;
}

interface VerificationStatus {
  active: boolean;
  lastPing?: string;
}

export default function SnippetPage() {
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Collapsible Guides State
  const [openGuide, setOpenGuide] = useState<string | null>('custom');

  // Load client data initially
  useEffect(() => {
    const loadClient = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/client');
        if (res.ok) {
          const data = await res.json();
          setClient(data.client);
        }
      } catch (err) {
        console.error('Failed to load client details:', err);
      } finally {
        setLoading(false);
      }
    };
    loadClient();
  }, []);

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/snippet-status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to query snippet status:', err);
    } finally {
      setChecking(false);
    }
  };

  const getSnippetCode = () => {
    const key = client?.snippet_key || 'CLIENT_UNIQUE_KEY_HERE';
    return `<script>window.SR_CLIENT_ID = '${key}';</script>\n<script src="https://cdn.churnaut.com/snippet.js" async defer></script>`;
  };

  const toggleGuide = (guideName: string) => {
    setOpenGuide(prev => (prev === guideName ? null : guideName));
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500 font-mono text-sm">RETRIEVING SNIPPET CONFIGURATIONS...</div>;
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5">
        <h1 className="text-xl font-bold tracking-wider font-mono">SNIPPET INSTALLATION</h1>
        <p className="text-xs font-mono text-gray-400 mt-1">Connect your website to Churnaut to enable real-time content personalizations</p>
      </div>

      {/* STEP 1: Installation Code */}
      <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-mono font-bold bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[#6366f1] px-2 py-0.5 rounded">
            STEP 1
          </span>
          <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
            YOUR INSTALLATION CODE
          </h2>
        </div>
        <p className="text-xs font-mono text-gray-400">
          {"Copy the script block below and paste it in the header <head> section of your website on every page you want to personalize."}
        </p>

        {/* Monospace Code block */}
        <div className="relative group border border-[var(--border-subtle)] bg-[#1e1e2e] rounded-lg p-4 font-mono text-xs overflow-x-auto text-[#e2e8f0]" style={{ backgroundColor: '#1e1e2e', color: '#e2e8f0' }}>
          <pre className="leading-relaxed select-all">
            {getSnippetCode()}
          </pre>
          <button
            onClick={() => handleCopyCode(getSnippetCode())}
            className="absolute top-3 right-3 bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-[10px] py-1.5 px-3 rounded transition-all active:scale-[0.98]"
          >
            {copied ? 'COPIED!' : 'COPY'}
          </button>
        </div>
      </div>

      {/* STEP 2: Tag Target Elements */}
      <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-mono font-bold bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[#6366f1] px-2 py-0.5 rounded">
            STEP 2
          </span>
          <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
            TAG YOUR TARGET ELEMENTS
          </h2>
        </div>
        <p className="text-xs font-mono text-gray-400">
          {"Add the class "}
          <span className="text-indigo-400 font-bold bg-[var(--border-subtle)] px-1.5 py-0.5 rounded">sr-target</span>
          {" to any element (such as a heading, description text, or calendar wrapper) on your site where you want content swaps to happen. Alternatively, you can target specific elements using custom CSS selectors in your rules config."}
        </p>

        {/* Monospace Example */}
        <div className="border border-[var(--border-subtle)] bg-[#1e1e2e] rounded-lg p-4 font-mono text-xs text-[#e2e8f0]" style={{ backgroundColor: '#1e1e2e', color: '#e2e8f0' }}>
          <span className="text-gray-500 block mb-2">&lt;!-- Example element swaps --&gt;</span>
          <pre className="leading-relaxed">
            {`<!-- Swap a headline copy -->\n<h1 class="sr-target font-bold">Welcome to Churnaut</h1>\n\n<!-- Swap a direct scheduling button -->\n<div class="sr-target">\n  <a href="/pricing">View Plans</a>\n</div>`}
          </pre>
        </div>
      </div>

      {/* STEP 3: Verify Installation */}
      <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-mono font-bold bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[#6366f1] px-2 py-0.5 rounded">
            STEP 3
          </span>
          <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
            VERIFY INSTALLATION
          </h2>
        </div>
        <p className="text-xs font-mono text-gray-400">
          {"Verify that your tracking snippet is properly loading and communicating with our personalized routing system."}
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
          <button
            onClick={handleCheckStatus}
            disabled={checking}
            className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2.5 px-6 rounded transition-all active:scale-[0.98] disabled:opacity-55"
          >
            {checking ? 'VERIFYING...' : 'CHECK STATUS'}
          </button>

          {/* Dynamic Badges */}
          {status && (
            <div className="flex-1 flex justify-end">
              {status.active ? (
                <div className="flex items-center space-x-3 border border-green-900/40 bg-green-950/20 text-[#10b981] p-3 rounded-lg font-mono text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]"></span>
                  </span>
                  <div>
                    <span className="font-bold block text-[#10b981]">CONNECTION CONFIRMED</span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">
                      Last ping detected: {new Date(status.lastPing || '').toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border border-yellow-900/40 bg-yellow-950/20 text-[#f59e0b] p-4 rounded-lg font-mono text-xs space-y-2 max-w-md w-full">
                  <div className="flex items-center space-x-2">
                    <span className="h-2 w-2 rounded-full bg-[#f59e0b]"></span>
                    <span className="font-bold">WAITING FOR PINGS</span>
                  </div>
                  <div className="text-[10px] text-gray-400 leading-relaxed space-y-1">
                    <span className="block font-bold text-gray-300">Troubleshooting Tips:</span>
                    <span className="block">• Ensure you pasted the script directly before the closing &lt;/head&gt; tag.</span>
                    <span className="block">• Visit your website with a tracking parameter (e.g. yoursite.com/?sid=test) to trigger a resolve event.</span>
                    <span className="block">• Clear your browser cache and reload the page.</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* STEP 4: Platform Guides */}
      <div className="space-y-4">
        <h2 className="text-xs font-mono font-bold text-[#6366f1] uppercase tracking-widest bg-[var(--border-subtle)]/40 py-1.5 px-3 rounded border border-[var(--border-subtle)] inline-block">
          Platform Setup Instructions
        </h2>

        <div className="space-y-3">
          {/* Custom HTML */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGuide('custom')}
              className="w-full text-left p-4 font-mono text-xs font-bold text-gray-300 uppercase hover:bg-[var(--border-subtle)]/20 transition-all flex justify-between items-center"
            >
              <span>Custom HTML Layouts</span>
              <span>{openGuide === 'custom' ? '[-]' : '[+]'}</span>
            </button>
            {openGuide === 'custom' && (
              <div className="p-4 border-t border-[var(--border-subtle)] text-xs font-mono text-gray-400 space-y-2.5 leading-relaxed bg-[#080B0F]/20">
                <p>
                  {"To install the snippet on a custom server-side or static website, paste the script tags directly inside the head block, after other third-party dependencies:"}
                </p>
                <div className="p-3 bg-[#1e1e2e] border border-[var(--border-subtle)] text-[#e2e8f0] rounded overflow-x-auto text-[11px]" style={{ backgroundColor: '#1e1e2e', color: '#e2e8f0' }}>
                  {`<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>Your Site</title>\n  <!-- Paste Churnaut tag below -->\n  ${getSnippetCode()}\n</head>\n<body>...</body>\n</html>`}
                </div>
              </div>
            )}
          </div>

          {/* Webflow */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGuide('webflow')}
              className="w-full text-left p-4 font-mono text-xs font-bold text-gray-300 uppercase hover:bg-[var(--border-subtle)]/20 transition-all flex justify-between items-center"
            >
              <span>Webflow Setup</span>
              <span>{openGuide === 'webflow' ? '[-]' : '[+]'}</span>
            </button>
            {openGuide === 'webflow' && (
              <div className="p-4 border-t border-[var(--border-subtle)] text-xs font-mono text-gray-400 space-y-2.5 leading-relaxed bg-[#080B0F]/20">
                <p>{"1. Go to your Webflow Dashboard and select your project Project Settings."}</p>
                <p>{"2. Navigate to the Custom Code tab."}</p>
                <p>{"3. Paste your two-line script tag into the Head Code block text field."}</p>
                <p>{"4. Click Save Changes and Publish your Webflow site to make it live."}</p>
              </div>
            )}
          </div>

          {/* WordPress */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGuide('wordpress')}
              className="w-full text-left p-4 font-mono text-xs font-bold text-gray-300 uppercase hover:bg-[var(--border-subtle)]/20 transition-all flex justify-between items-center"
            >
              <span>WordPress Setup</span>
              <span>{openGuide === 'wordpress' ? '[-]' : '[+]'}</span>
            </button>
            {openGuide === 'wordpress' && (
              <div className="p-4 border-t border-[var(--border-subtle)] text-xs font-mono text-gray-400 space-y-2.5 leading-relaxed bg-[#080B0F]/20">
                <p>{"1. Log in to your WordPress Dashboard."}</p>
                <p>{"2. Go to Plugins > Add New and install a header injection plugin like Insert Headers and Footers."}</p>
                <p>{"3. Go to Settings > Insert Headers and Footers."}</p>
                <p>{"4. Paste the script tag in the Scripts in Header text area."}</p>
                <p>{"5. Click Save to complete the configuration."}</p>
              </div>
            )}
          </div>

          {/* Shopify */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGuide('shopify')}
              className="w-full text-left p-4 font-mono text-xs font-bold text-gray-300 uppercase hover:bg-[var(--border-subtle)]/20 transition-all flex justify-between items-center"
            >
              <span>Shopify Setup</span>
              <span>{openGuide === 'shopify' ? '[-]' : '[+]'}</span>
            </button>
            {openGuide === 'shopify' && (
              <div className="p-4 border-t border-[var(--border-subtle)] text-xs font-mono text-gray-400 space-y-2.5 leading-relaxed bg-[#080B0F]/20">
                <p>{"1. In your Shopify Admin, navigate to Online Store > Themes."}</p>
                <p>{"2. Click Actions (...) > Edit Code under your active theme."}</p>
                <p>{"3. Open the Layout directory and select the theme.liquid template."}</p>
                <p>{"4. Locate the closing </head> tag and paste the script snippet block directly above it."}</p>
                <p>{"5. Click Save at the top right to deploy it."}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
