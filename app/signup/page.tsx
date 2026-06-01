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
    <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md border border-[#1a1f2e] bg-[#0a0a0a] rounded-lg p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-2">CHURNAUT</h1>
          <p className="text-sm text-gray-400 font-mono">Create your workspace</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-950/30 border border-red-900/50 rounded text-red-400 text-xs font-mono">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="fullName" className="block text-xs font-mono text-gray-400 uppercase tracking-wider">
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
              className="w-full bg-[#0a0a0a] border border-[#1a1f2e] focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] outline-none text-sm px-4 py-2.5 rounded text-white transition-all font-mono"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="companyName" className="block text-xs font-mono text-gray-400 uppercase tracking-wider">
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
              className="w-full bg-[#0a0a0a] border border-[#1a1f2e] focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] outline-none text-sm px-4 py-2.5 rounded text-white transition-all font-mono"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="block text-xs font-mono text-gray-400 uppercase tracking-wider">
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
              className="w-full bg-[#0a0a0a] border border-[#1a1f2e] focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] outline-none text-sm px-4 py-2.5 rounded text-white transition-all font-mono"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-xs font-mono text-gray-400 uppercase tracking-wider">
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
              className="w-full bg-[#0a0a0a] border border-[#1a1f2e] focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] outline-none text-sm px-4 py-2.5 rounded text-white transition-all font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-sm py-3 px-4 rounded transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center"
          >
            {loading ? 'INITIALIZING WORKSPACE...' : 'GET STARTED'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#1a1f2e] text-center">
          <p className="text-xs text-gray-500 font-mono">
            Already have an account?{' '}
            <a href="/login" className="text-[#6366f1] hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
