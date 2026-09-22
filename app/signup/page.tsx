'use client';

import React, { FormEvent, useState } from 'react';
import { ArrowRight, Building2, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
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
    let redirecting = false;
    try {
      const { data, error } = await supabaseBrowser.auth.signUp({ email, password, options: { data: { full_name: fullName, company_name: companyName } } });
      if (error) { setErrorMsg(error.message); return; }
      const user = data?.user;
      if (!user) { setErrorMsg('Sign up succeeded but user data was not returned.'); return; }
      if (data.session) {
        const sessionResponse = await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: data.session.access_token, expires_at: data.session.expires_at }) });
        if (!sessionResponse.ok) { await supabaseBrowser.auth.signOut(); throw new Error('Unable to establish a secure server session. Please try again.'); }
      }
      const res = await fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, companyName, email }) });
      const result = await res.json();
      if (!res.ok || result.error) { setErrorMsg(result.error || 'Failed to initialize your workspace profile.'); return; }
      redirecting = true;
      router.push('/dashboard/onboarding');
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      if (!redirecting) setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Create your workspace"
      title="Give every valuable signal somewhere to go."
      subtitle="Start with a clean workspace. Churnaut will help you connect your site, CRM, and first routing decision."
      footer={<p className="text-center text-xs text-[var(--field-ink-muted)]">Already have an account? <a href="/login" className="font-semibold text-[var(--signal-primary)] underline-offset-4 hover:underline">Sign in</a></p>}
    >
      {errorMsg ? <div className="mb-5 rounded-2xl border border-[var(--signal-critical)]/25 bg-[var(--signal-critical)]/8 p-4 text-sm leading-5 text-[var(--signal-critical)]" role="alert">{errorMsg}</div> : null}
      <form onSubmit={handleSignup} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><label htmlFor="fullName" className="auth-field-label">Your Name</label><div className="relative"><UserRound className="auth-input-icon" aria-hidden="true" /><input id="fullName" type="text" required disabled={loading} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" className="auth-input pl-10" /></div></div>
          <div className="space-y-2"><label htmlFor="companyName" className="auth-field-label">Company Name</label><div className="relative"><Building2 className="auth-input-icon" aria-hidden="true" /><input id="companyName" type="text" required disabled={loading} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" className="auth-input pl-10" /></div></div>
        </div>
        <div className="space-y-2"><label htmlFor="email" className="auth-field-label">Email Address</label><input id="email" type="email" required disabled={loading} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="auth-input" /></div>
        <div className="space-y-2"><label htmlFor="password" className="auth-field-label">Password</label><input id="password" type="password" required disabled={loading} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a secure password" className="auth-input" /></div>
        <button type="submit" disabled={loading} className="auth-submit-button">{loading ? 'INITIALIZING WORKSPACE…' : <>GET STARTED <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" /></>}</button>
      </form>
    </AuthShell>
  );
}
