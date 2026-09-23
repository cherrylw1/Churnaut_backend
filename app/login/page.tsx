'use client';

import React, { FormEvent, useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
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
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
      if (error) {
        const category = /rate|too many/i.test(error.message)
          ? 'rate_limited'
          : /invalid|credentials|password|email/i.test(error.message)
            ? 'invalid_credentials'
            : 'provider_error';
        void fetch('/api/ops/auth-failure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category }), keepalive: true }).catch(() => undefined);
        setErrorMsg(error.message);
      } else {
        if (!data.session) throw new Error('Login succeeded but no session was returned. Please try again.');
        const sessionResponse = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: data.session.access_token, expires_at: data.session.expires_at }),
        });
        if (!sessionResponse.ok) {
          await supabaseBrowser.auth.signOut();
          throw new Error('Unable to establish a secure server session. Please try again.');
        }
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="See what your pipeline is trying to tell you."
      subtitle="Sign in to your personalization workspace and pick up from the signal that needs a decision next."
      footer={<p className="text-center text-xs text-[var(--field-ink-muted)]">New to Churnaut? <a href="/signup" className="font-semibold text-[var(--signal-primary)] underline-offset-4 hover:underline">Create an account</a></p>}
    >
      {errorMsg ? <div className="mb-5 rounded-[var(--radius-nested)] border border-[var(--signal-critical)]/25 bg-[var(--signal-critical)]/8 p-4 text-sm leading-5 text-[var(--signal-critical)]" role="alert">{errorMsg}</div> : null}
      <form onSubmit={handleLogin} className="space-y-5" aria-busy={loading}>
        <div className="space-y-2"><label htmlFor="email" className="auth-field-label">Email Address</label><input id="email" type="email" required disabled={loading} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="auth-input" /></div>
        <div className="space-y-2"><div className="flex items-center justify-between gap-3"><label htmlFor="password" className="auth-field-label">Password</label><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--field-ink-muted)]">Private session</span></div><input id="password" type="password" required disabled={loading} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="auth-input" /></div>
        <button type="submit" disabled={loading} aria-busy={loading} className="auth-submit-button">{loading ? 'AUTHENTICATING…' : <><LockKeyhole className="h-4 w-4" aria-hidden="true" /> SIGN IN <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" /></>}</button>
      </form>
    </AuthShell>
  );
}
