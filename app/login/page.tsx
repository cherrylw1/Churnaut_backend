'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const { error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setErrorMsg(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md border border-[#1a1f2e] bg-[#0a0a0a] rounded-lg p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-2">CHURNAUT</h1>
          <p className="text-sm text-gray-400 font-mono">Sign in to your account</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-950/30 border border-red-900/50 rounded text-red-400 text-xs font-mono">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
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
            {loading ? 'AUTHENTICATING...' : 'SIGN IN'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#1a1f2e] text-center">
          <p className="text-xs text-gray-500 font-mono">
            New to Churnaut?{' '}
            <a href="/signup" className="text-[#6366f1] hover:underline">
              Create an account
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
