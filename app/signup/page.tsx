'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      // 1. Register the user via Supabase Auth
      const { data, error } = await supabaseBrowser.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      const user = data?.user;
      if (!user) {
        setErrorMsg('Sign up succeeded but user data was not returned.');
        setLoading(false);
        return;
      }

      // 2. Call the backend API to create the client profile row
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          companyName: companyName,
          email: email,
        }),
      });

      const result = await res.json();

      if (!res.ok || result.error) {
        setErrorMsg(result.error || 'Failed to initialize your workspace profile.');
        setLoading(false);
        return;
      }

      // 3. Redirect to /dashboard/onboarding on success
      router.push('/dashboard/onboarding');
      router.refresh();

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setErrorMsg(errorMessage);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] grid grid-cols-1 lg:grid-cols-12 font-sans">
      {/* Left panel: Form */}
      <div className="lg:col-span-5 flex flex-col justify-center px-8 sm:px-12 lg:px-16 py-12 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)]">
        <div className="w-full max-w-md mx-auto">
          {/* Logo brand at top */}
          <div className="mb-8">
            <div className="flex items-center gap-2 font-sans font-bold text-[24px] text-[var(--text-primary)]">
              <span className="w-3 h-3 rounded-full bg-[var(--accent)]" />
              CHURNAUT
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2 font-sans">Create your personalization workspace</p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 bg-[var(--red)]/5 border border-[var(--red)]/20 rounded-[8px] text-[var(--red)] text-xs font-mono">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="block text-[13px] font-sans font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Your Name
              </label>
              <input
                id="fullName"
                type="text"
                required
                disabled={loading}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Smith"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm px-[14px] py-[10px] rounded-[8px] text-[var(--text-primary)] transition-all font-sans"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="companyName" className="block text-[13px] font-sans font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Company Name
              </label>
              <input
                id="companyName"
                type="text"
                required
                disabled={loading}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Corp"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm px-[14px] py-[10px] rounded-[8px] text-[var(--text-primary)] transition-all font-sans"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-[13px] font-sans font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm px-[14px] py-[10px] rounded-[8px] text-[var(--text-primary)] transition-all font-sans"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-[13px] font-sans font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm px-[14px] py-[10px] rounded-[8px] text-[var(--text-primary)] transition-all font-sans"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-sans text-sm font-semibold py-3 px-4 rounded-[8px] transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center pt-3"
            >
              {loading ? 'INITIALIZING WORKSPACE...' : 'GET STARTED'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[var(--border-subtle)] text-center">
            <p className="text-xs text-[var(--text-muted)] font-sans">
              Already have an account?{' '}
              <a href="/login" className="text-[var(--accent)] hover:underline font-semibold transition-colors">
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Right panel: Brand Panel with gradient background */}
      <div className="hidden lg:col-span-7 lg:flex flex-col justify-center px-16 py-12 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #2B2018 0%, #3D2817 50%, #2B2420 100%)' }}>
        {/* Soft abstract shapes in background for premium look */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#C2683D]/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#C2683D]/10 rounded-full blur-3xl" />

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-4">
            <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-semibold text-[#E8A87C] tracking-wider uppercase font-sans">
              B2B Client Personalization
            </span>
            <h2 className="text-4xl font-extrabold text-white leading-tight font-sans">
              Stop leaving pipeline revenue on the table.
            </h2>
            <p className="text-[16px] text-[#D4C4B4] leading-relaxed font-sans">
              Churnaut captures real-time web engagement signals and dynamically personalizes your website experiences for high-value prospects.
            </p>
          </div>

          <div className="space-y-6 pt-6 border-t border-white/10">
            <div className="flex items-start gap-4">
              <div className="w-6 h-6 rounded-full bg-[#C2683D]/20 border border-[#C2683D]/40 flex items-center justify-center text-[#E8A87C] font-bold text-sm flex-shrink-0 mt-0.5 font-sans">✓</div>
              <div>
                <h4 className="text-white font-semibold font-sans">Dynamic Content Swaps</h4>
                <p className="text-xs text-[#D4C4B4] mt-1 font-sans">Instantly personalize headlines, subtext, and CTAs by industry, job title, or UTM parameters.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-6 h-6 rounded-full bg-[#C2683D]/20 border border-[#C2683D]/40 flex items-center justify-center text-[#E8A87C] font-bold text-sm flex-shrink-0 mt-0.5 font-sans">✓</div>
              <div>
                <h4 className="text-white font-semibold font-sans">CRM & HubSpot Sync</h4>
                <p className="text-xs text-[#D4C4B4] mt-1 font-sans">Auto-pull closed-won patterns to compile B2B Ideal Customer Profiles (ICP) and write Obituaries for lost deals.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-6 h-6 rounded-full bg-[#C2683D]/20 border border-[#C2683D]/40 flex items-center justify-center text-[#E8A87C] font-bold text-sm flex-shrink-0 mt-0.5 font-sans">✓</div>
              <div>
                <h4 className="text-white font-semibold font-sans">Scout AI Intelligence</h4>
                <p className="text-xs text-[#D4C4B4] mt-1 font-sans">Keep sales representatives accountable with automatic alerts, multithreading diagnostics, and inactivity detection.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
