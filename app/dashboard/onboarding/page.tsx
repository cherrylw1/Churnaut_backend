'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/useToast';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Surface } from '@/components/dashboard/Surface';
import { ProgressBar } from '@/components/dashboard/ProgressBar';
import { FormField } from '@/components/dashboard/FormField';

const CRM_OPTIONS = ['HubSpot', 'Zoho', 'Salesforce', 'Pipedrive', 'None'];
const SIZE_OPTIONS = ['1-50', '50-200', '200-500', '500-2000', '2000+'];
const CHANNEL_OPTIONS = ['Cold Email', 'LinkedIn Outreach', 'Google Ads', 'LinkedIn Ads', 'Events and Conferences', 'Partner Referrals'];
const PROBLEM_OPTIONS = ['Too many junk leads', 'High-intent buyers not getting fast response', 'Hard to know who is on our website', 'Reps waste time on bad demos'];

const optionClass = (selected: boolean) => `rounded-lg border px-4 py-3 text-left text-xs font-mono transition motion-safe:hover:-translate-y-0.5 ${selected ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)] shadow-[0_0_0_1px_var(--accent)]' : 'border-[var(--border-subtle)] bg-[var(--bg-base)]/50 text-[var(--text-secondary)] hover:border-[var(--accent)]/60'}`;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [crm, setCrm] = useState('HubSpot');
  const [idealCustomer, setIdealCustomer] = useState('');
  const [companySize, setCompanySize] = useState('50-200');
  const [channels, setChannels] = useState<string[]>(['Cold Email']);
  const [problem, setProblem] = useState('High-intent buyers not getting fast response');

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ crm, ideal_customer: idealCustomer, company_size: companySize, channels, problem }) });
      const responseData = await res.json().catch(() => ({}));
      if (res.ok && responseData.success !== false) {
        setCompleted(true);
        toast.success('Workspace initialized successfully!');
        router.push('/dashboard/rules');
      } else {
        toast.error(responseData.error || (responseData.degraded ? 'AI setup is temporarily unavailable. You can continue manually from Routing Rules.' : 'Failed to complete onboarding setup.'));
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred during onboarding rules generation.');
    } finally { setLoading(false); }
  };

  const handleNext = () => step < 5 ? setStep((value) => value + 1) : handleSubmit();
  const handlePrev = () => { if (step > 1) setStep((value) => value - 1); };
  const toggleChannel = (channel: string) => setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Signal Room · Workspace initialization" title="Initialize personalization" description="Answer five quick questions so Churnaut can tailor your first routing rules." />
      <Surface className="overflow-hidden" aria-busy={loading}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-5 py-5 sm:px-8"><div><p className="dashboard-eyebrow font-mono">AI setup assistant</p><h2 className="mt-1 text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">Initialize workspace personalization</h2></div><span className="shrink-0 text-right text-xs font-mono text-[var(--text-secondary)]">{completed ? 'Complete' : `Step ${step} of 5`}</span></div>
        <div className="px-5 pt-5 sm:px-8"><ProgressBar value={(step / 5) * 100} label={`Step ${step} of 5`} /></div>
        <div className="flex min-h-[450px] flex-col justify-between gap-6 p-5 sm:p-8">
          {completed ? <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center" role="status" aria-live="polite"><div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--green)] bg-[var(--green)]/10 text-xl font-bold text-[var(--green)]">✓</div><div><h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Workspace initialized</h2><p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-[var(--text-secondary)]">Your AI-generated rules have been compiled and saved. Redirecting to your Routing Rules board...</p></div><button type="button" onClick={() => router.push('/dashboard/rules')} className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[var(--accent-hover)] motion-safe:active:scale-[0.98]">Go to Dashboard</button></div> : loading ? <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12" role="status" aria-live="polite"><div className="motion-safe:animate-spin h-8 w-8 rounded-full border-2 border-[var(--accent)] border-t-transparent" aria-hidden="true" /><p className="text-sm uppercase tracking-wide text-[var(--accent)]">Generating personalized routing rules...</p><p className="max-w-xs text-center text-[10px] leading-relaxed text-[var(--text-muted)]">Churnaut AI is evaluating your customer profile to compile custom web variation templates.</p></div> : <div className="flex-1 space-y-5">
            {step === 1 && <ChoiceStep title="1. What CRM system do you use?" hint="We sync deal stages and rep reassignments to personalize layouts."><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{CRM_OPTIONS.map((option) => <button key={option} type="button" aria-pressed={crm === option} onClick={() => setCrm(option)} className={optionClass(crm === option)}>{option}</button>)}</div></ChoiceStep>}
            {step === 2 && <ChoiceStep title="2. Describe your ideal customer in one sentence." hint="Helps the AI draft tailored headline copies."><FormField id="ideal-customer" label="Ideal customer profile" required><textarea id="ideal-customer" rows={4} required value={idealCustomer} onChange={(event) => setIdealCustomer(event.target.value)} placeholder="e.g. B2B software companies with 100+ employees seeking marketing automation tools." className="w-full resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 text-xs text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]" /></FormField></ChoiceStep>}
            {step === 3 && <ChoiceStep title="3. How big are the companies you sell to?" hint="Sets up variations matching firmographic segments."><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{SIZE_OPTIONS.map((option) => <button key={option} type="button" aria-pressed={companySize === option} onClick={() => setCompanySize(option)} className={optionClass(companySize === option)}>{option} employees</button>)}</div></ChoiceStep>}
            {step === 4 && <ChoiceStep title="4. What channels does your team use?" hint="Select all that apply. We create matching inbound signal handlers."><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{CHANNEL_OPTIONS.map((option) => { const selected = channels.includes(option); return <button key={option} type="button" aria-pressed={selected} onClick={() => toggleChannel(option)} className={`${optionClass(selected)} flex items-center justify-between`}><span>{option}</span><span className={`flex h-4 w-4 items-center justify-center rounded border text-[9px] ${selected ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-subtle)]'}`} aria-hidden="true">{selected ? '✓' : ''}</span></button>; })}</div></ChoiceStep>}
            {step === 5 && <ChoiceStep title="5. What is your biggest problem with inbound leads?" hint="Calibrates routing priorities and scheduling variants."><div className="grid grid-cols-1 gap-3">{PROBLEM_OPTIONS.map((option) => <button key={option} type="button" aria-pressed={problem === option} onClick={() => setProblem(option)} className={optionClass(problem === option)}>{option}</button>)}</div></ChoiceStep>}
          </div>}
          {!loading && !completed && <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-5"><button type="button" disabled={step === 1} onClick={handlePrev} className="rounded-lg border border-[var(--border-subtle)] px-6 py-2 text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30">BACK</button><button type="button" disabled={step === 2 && !idealCustomer.trim()} onClick={handleNext} className="rounded-lg bg-[var(--accent)] px-6 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)] motion-safe:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">{step === 5 ? 'COMPLETE SETUP' : 'NEXT'}</button></div>}
        </div>
      </Surface>
    </div>
  );
}

function ChoiceStep({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <section className="space-y-4" aria-labelledby="onboarding-step-heading"><div><h2 id="onboarding-step-heading" className="text-sm uppercase tracking-wide text-[var(--text-secondary)]">{title}</h2><p className="mt-1 text-[10px] text-[var(--text-muted)]">{hint}</p></div>{children}</section>;
}
