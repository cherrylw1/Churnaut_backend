import type { ReactNode } from 'react';
import { ArrowUpRight, Check, CircleDot, GitBranch, Sparkles } from 'lucide-react';
import { ChurnautMark } from '@/components/brand/ChurnautMark';

type AuthShellProps = {
  title: string;
  subtitle: string;
  eyebrow?: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthShell({ title, subtitle, eyebrow = 'Signal Field workspace', children, footer }: AuthShellProps) {
  return (
    <main className="auth-shell min-h-screen bg-[var(--field-canvas)] text-[var(--field-ink)] lg:grid lg:grid-cols-[minmax(520px,1.12fr)_minmax(400px,0.88fr)]">
      <section className="flex min-h-screen flex-col bg-[var(--field-surface)] px-6 py-7 sm:px-10 lg:px-16 lg:py-10">
        <div className="flex items-center justify-between">
          <ChurnautMark href="/" />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--field-ink-muted)] sm:inline">Revenue signal workspace</span>
        </div>
        <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-14">
          <p className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--signal-primary)]">{eyebrow}</p>
          <h1 className="max-w-[12ch] text-4xl font-semibold leading-[0.98] tracking-[-0.06em] text-[var(--field-ink)] sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-[42ch] text-sm leading-6 text-[var(--field-ink-secondary)]">{subtitle}</p>
          <div className="mt-9">{children}</div>
          <div className="mt-8 border-t border-[var(--field-line)] pt-5">{footer}</div>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--field-line)] pt-4 text-[10px] text-[var(--field-ink-muted)]">
          <span>© 2026 Churnaut</span>
          <span className="font-mono uppercase tracking-[0.12em]">Signals in. Revenue out.</span>
        </div>
      </section>

      <aside className="auth-story relative hidden min-h-screen overflow-hidden bg-[var(--instrument-bg)] px-10 py-10 text-[var(--instrument-text)] lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="pointer-events-none absolute -right-24 -top-20 h-96 w-96 rounded-full bg-[var(--signal-primary)]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-[#D27B53]/16 blur-3xl" />
        <div className="relative max-w-xl">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/70">B2B signal intelligence</span>
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/50"><CircleDot className="h-3.5 w-3.5 text-[#8FE0A7]" /> Live system</span>
          </div>
          <h2 className="mt-16 max-w-[16ch] text-4xl font-semibold leading-[0.96] tracking-[-0.06em] text-white xl:text-5xl">Turn intent into a next move.</h2>
          <p className="mt-6 max-w-lg text-sm leading-6 text-white/65">Churnaut reads the quiet signals hiding inside your web traffic, CRM, and routing logic—then makes the valuable action obvious.</p>
        </div>

        <div className="relative mt-16 max-w-2xl">
          <div className="auth-story-trace">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.14em] text-white/45"><span>Signal path</span><span>01 / 03</span></div>
            <div className="mt-6 space-y-3">
              <div className="auth-story-trace-row"><span className="auth-story-trace-icon bg-[#8FC3D5]/15 text-[#A7D8EB]"><GitBranch className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-medium text-white">High-intent visitor</p><p className="text-xs text-white/45">Returning from a target account</p></div></div>
              <div className="ml-4 h-5 border-l border-dashed border-white/20" />
              <div className="auth-story-trace-row"><span className="auth-story-trace-icon bg-[#D27B53]/15 text-[#F0B28D]"><Sparkles className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-medium text-white">Rule matched</p><p className="text-xs text-white/45">Enterprise proof point selected</p></div></div>
              <div className="ml-4 h-5 border-l border-dashed border-white/20" />
              <div className="auth-story-trace-row"><span className="auth-story-trace-icon bg-[#8FE0A7]/15 text-[#8FE0A7]"><ArrowUpRight className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-medium text-white">Experience adapted</p><p className="text-xs text-white/45">The next action is now contextual</p></div></div>
            </div>
          </div>
          <p className="mt-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35"><Check className="h-3.5 w-3.5 text-[#8FE0A7]" /> One workspace for the signal, the decision, and the experience.</p>
        </div>
      </aside>
    </main>
  );
}
