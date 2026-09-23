'use client';

import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleDot, Loader2 } from 'lucide-react';
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
const STAGES = ['CRM', 'Ideal customer', 'Company size', 'Channels', 'Inbound problem'];

const optionClass = (selected: boolean) => `dashboard-onboarding-option flex min-h-12 w-full items-center border px-4 py-3 text-left text-sm transition duration-200 ${selected ? 'is-selected border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]' : 'border-[var(--border-subtle)] bg-[var(--bg-base)]/50 text-[var(--text-secondary)] hover:border-[var(--accent)]/60 hover:bg-[var(--bg-elevated)]'}`;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [crm, setCrm] = useState('HubSpot');
  const [idealCustomer, setIdealCustomer] = useState('');
  const [companySize, setCompanySize] = useState('50-200');
  const [channels, setChannels] = useState<string[]>(['Cold Email']);
  const [problem, setProblem] = useState('High-intent buyers not getting fast response');

  const handleSubmit = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ crm, ideal_customer: idealCustomer, company_size: companySize, channels, problem }) });
      const responseData = await res.json().catch(() => ({}));
      if (res.ok && responseData.success !== false) {
        setCompleted(true);
        toast.success('Workspace initialized successfully!');
        router.push('/dashboard/rules');
      } else {
        const message = responseData.error || (responseData.degraded ? 'AI setup is temporarily unavailable. You can continue manually from Routing Rules.' : 'Failed to complete onboarding setup.');
        setErrorMsg(message);
        toast.error(message);
      }
    } catch (err) {
      console.error(err);
      const message = 'An error occurred during onboarding rules generation.';
      setErrorMsg(message);
      toast.error(message);
    } finally { setLoading(false); }
  };

  const handleNext = () => step < 5 ? setStep((value) => value + 1) : handleSubmit();
  const handlePrev = () => { if (step > 1) { setErrorMsg(null); setStep((value) => value - 1); } };
  const toggleChannel = (channel: string) => { setErrorMsg(null); setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]); };

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-7">
      <PageHeader eyebrow="Signal Field · First signal" title="Initialize personalization" description="Answer five questions so Churnaut can shape your first routing rules around the way your team sells." />
      <Surface className="dashboard-onboarding-workbench dashboard-surface-owner" aria-busy={loading}>
        <div className="dashboard-onboarding-header px-5 py-5 sm:px-8"><div className="flex items-start justify-between gap-4"><div><p className="dashboard-eyebrow font-mono">Five signals, one focused setup</p><h2 className="mt-1 text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]">Build your first signal</h2></div><span className="shrink-0 text-right text-xs font-mono text-[var(--text-secondary)]">{completed ? 'Complete' : `Step ${step} of 5`}</span></div><div className="mt-5"><ProgressBar value={(step / 5) * 100} label={`Step ${step} of 5`} /></div></div>
        <div className="grid gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="dashboard-onboarding-rail border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/35 p-5 lg:border-b-0 lg:border-r lg:p-6" aria-label="Onboarding steps">
            <p className="dashboard-eyebrow font-mono">Your path</p>
            <ol className="dashboard-onboarding-stages mt-4 flex gap-2 lg:block lg:space-y-2" aria-label="Onboarding steps">
              {STAGES.map((stage, index) => { const active = step === index + 1; const done = step > index + 1 || completed; return <li key={stage}><div aria-current={active ? 'step' : undefined} className={`dashboard-onboarding-stage flex items-center gap-3 px-3 py-2.5 text-xs transition ${active ? 'is-active font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${done ? 'border-[var(--green)]/30 bg-[var(--green)]/10 text-[var(--green)]' : active ? 'border-[var(--accent)]/40 text-[var(--accent)]' : 'border-[var(--border-default)]'}`}>{done ? <Check className="h-3.5 w-3.5" /> : String(index + 1).padStart(2, '0')}</span><span>{stage}</span></div></li>; })}
            </ol>
          </aside>
          <div className="dashboard-onboarding-question flex flex-col justify-between gap-6 p-5 sm:p-8">
            {completed ? <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center" role="status" aria-live="polite"><div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--green)] bg-[var(--green)]/10 text-xl font-bold text-[var(--green)]"><Check className="h-6 w-6" /></div><div><h2 className="text-xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Workspace initialized</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">Your AI-generated rules have been compiled and saved. Redirecting to your Routing Rules board...</p></div><button type="button" onClick={() => router.push('/dashboard/rules')} className="rounded-full bg-[var(--accent)] px-6 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[var(--accent-hover)] motion-safe:active:scale-[0.98]">Go to Dashboard</button></div> : loading ? <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12" role="status" aria-live="polite"><Loader2 className="h-8 w-8 text-[var(--accent)] motion-safe:animate-spin" aria-hidden="true" /><p className="text-sm font-semibold text-[var(--text-primary)]">Generating personalized routing rules...</p><p className="max-w-xs text-center text-xs leading-relaxed text-[var(--text-muted)]">Churnaut is turning your answers into a useful first set of web variation templates.</p></div> : <div className="flex-1 space-y-5">
              {errorMsg && <div className="dashboard-wrap-anywhere border border-[var(--red)]/25 bg-[var(--red)]/8 p-4 text-sm leading-6 text-[var(--red)]" role="alert">{errorMsg}</div>}
              {step === 1 && <ChoiceStep title="What CRM system do you use?" hint="We sync deal stages and rep reassignments to personalize layouts."><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{CRM_OPTIONS.map((option) => <button key={option} type="button" aria-pressed={crm === option} onClick={() => { setErrorMsg(null); setCrm(option); }} className={optionClass(crm === option)}>{option}</button>)}</div></ChoiceStep>}
              {step === 2 && <ChoiceStep title="Describe your ideal customer in one sentence." hint="This helps Churnaut draft a more relevant first experience."><FormField id="ideal-customer" label="Ideal customer profile" required><textarea id="ideal-customer" rows={4} required value={idealCustomer} onChange={(event) => { setErrorMsg(null); setIdealCustomer(event.target.value); }} placeholder="e.g. B2B software companies with 100+ employees seeking marketing automation tools." className="dashboard-onboarding-input w-full resize-y border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]" /></FormField></ChoiceStep>}
              {step === 3 && <ChoiceStep title="How big are the companies you sell to?" hint="Set the firmographic context for your first routing variations."><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{SIZE_OPTIONS.map((option) => <button key={option} type="button" aria-pressed={companySize === option} onClick={() => { setErrorMsg(null); setCompanySize(option); }} className={optionClass(companySize === option)}>{option} employees</button>)}</div></ChoiceStep>}
              {step === 4 && <ChoiceStep title="What channels does your team use?" hint="Select all that apply. These become your first inbound signal handlers."><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{CHANNEL_OPTIONS.map((option) => { const selected = channels.includes(option); return <button key={option} type="button" aria-pressed={selected} onClick={() => toggleChannel(option)} className={`${optionClass(selected)} flex items-center justify-between`}><span>{option}</span><span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${selected ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-subtle)]'}`} aria-hidden="true">{selected ? '✓' : ''}</span></button>; })}</div></ChoiceStep>}
              {step === 5 && <ChoiceStep title="What is your biggest problem with inbound leads?" hint="This calibrates the first routing priorities Churnaut will suggest."><div className="grid grid-cols-1 gap-3">{PROBLEM_OPTIONS.map((option) => <button key={option} type="button" aria-pressed={problem === option} onClick={() => { setErrorMsg(null); setProblem(option); }} className={optionClass(problem === option)}>{option}</button>)}</div></ChoiceStep>}
            </div>}
            {!loading && !completed && <div className="dashboard-onboarding-footer flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-5"><button type="button" disabled={step === 1} onClick={handlePrev} className="dashboard-button-secondary"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> BACK</button><button type="button" disabled={step === 2 && !idealCustomer.trim()} onClick={handleNext} className="dashboard-button-primary">{step === 5 ? 'COMPLETE SETUP' : 'NEXT'} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button></div>}
          </div>
        </div>
      </Surface>
    </div>
  );
}

function ChoiceStep({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <section className="dashboard-onboarding-step space-y-5" aria-labelledby="onboarding-step-heading"><div><div className="mb-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--signal-observe)]"><CircleDot className="h-3.5 w-3.5" aria-hidden="true" /> Question {title.includes('CRM') ? '01' : title.includes('ideal customer') ? '02' : title.includes('big') ? '03' : title.includes('channels') ? '04' : '05'}</div><h2 id="onboarding-step-heading" className="dashboard-wrap-anywhere max-w-xl text-2xl font-semibold leading-tight tracking-[-0.05em] text-[var(--text-primary)] sm:text-3xl">{title}</h2><p className="dashboard-wrap-anywhere mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{hint}</p></div>{children}</section>;
}
