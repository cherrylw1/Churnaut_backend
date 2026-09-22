'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ModalShell } from '@/components/dashboard/ModalShell';
import { Surface } from '@/components/dashboard/Surface';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { StatusBadge } from '@/components/dashboard/StatusBadge';

interface PlaybookInput {
  field_name: string;
  label: string;
  placeholder: string;
  type: string;
}

interface PlaybookTemplate {
  id: string;
  name: string;
  description: string;
  signal_type: string;
  tier: number;
  required_inputs: PlaybookInput[];
  rule_template: {
    signal_type?: string;
    conditions?: Record<string, unknown>;
    action_type: string;
    target_selector?: string;
    variant_content?: string;
    [key: string]: unknown;
  };
  created_at: string;
}

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<PlaybookTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal State
  const [selectedPlaybook, setSelectedPlaybook] = useState<PlaybookTemplate | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPlaybooks = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const res = await fetch('/api/playbooks');
      if (res.ok) {
        const data = await res.json();
        setPlaybooks(data.playbooks || []);
        setWarning(data.warning || null);
      } else {
        const data = await res.json().catch(() => ({}));
        setFetchError(data.error || 'Unable to load playbook templates.');
      }
    } catch (err) {
      console.error('Error fetching playbooks:', err);
      setFetchError('A network error occurred while loading playbook templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaybooks();
  }, []);

  const openInstallModal = (playbook: PlaybookTemplate) => {
    setSelectedPlaybook(playbook);
    const initialValues: Record<string, string> = {};
    playbook.required_inputs.forEach((input) => {
      initialValues[input.field_name] = '';
    });
    setFormValues(initialValues);
    setSuccess(false);
    setErrorMsg(null);
  };

  const closeInstallModal = () => {
    setSelectedPlaybook(null);
    setFormValues({});
    setSuccess(false);
    setErrorMsg(null);
  };

  const handleInputChange = (fieldName: string, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleInstallSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlaybook) return;

    setInstalling(true);
    setErrorMsg(null);

    try {
      // 1. Process rule template and replace {{placeholder}} variables
      let templateStr = JSON.stringify(selectedPlaybook.rule_template);
      
      Object.entries(formValues).forEach(([key, val]) => {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        templateStr = templateStr.replace(regex, val);
      });

      const compiledRule = JSON.parse(templateStr);

      // 2. Build action_payload object based on input types
      const actionPayload: Record<string, unknown> = {};
      
      if (formValues.calendly_url) {
        actionPayload.calendar_url = formValues.calendly_url;
      }
      if (formValues.cta_url) {
        actionPayload.url = formValues.cta_url;
      }
      if (formValues.case_study_url) {
        actionPayload.url = formValues.case_study_url;
      }
      if (formValues.upgrade_url) {
        actionPayload.url = formValues.upgrade_url;
      }
      if (formValues.trial_url) {
        actionPayload.url = formValues.trial_url;
      }

      // Add all variables as backup so they are saved
      Object.entries(formValues).forEach(([k, v]) => {
        actionPayload[k] = v;
      });

      compiledRule.action_payload = {
        ...(compiledRule.action_payload || {}),
        ...actionPayload,
      };

      // 3. POST to /api/rules
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(compiledRule),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Failed to install playbook rule.');
      }
    } catch (err) {
      console.error('[Playbook Install Exception] Error during installation:', err);
      setErrorMsg('An unexpected error occurred during installation.');
    } finally {
      setInstalling(false);
    }
  };

  const seedSql = `-- Copy and execute this SQL inside Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS playbook_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    signal_type text,
    tier integer,
    required_inputs jsonb DEFAULT '[]',
    rule_template jsonb NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Click below or copy from supabase/playbooks.sql to seed the 21 templates!`;

  if (loading) {
    return <div className="max-w-6xl space-y-6"><PageHeader eyebrow="Signal Field · Configuration library" title="Playbook library" description="Install proven routing patterns and tailor them to your workflow." /><Surface aria-busy="true" className="dashboard-surface flex min-h-48 items-center justify-center"><p role="status" className="text-sm uppercase tracking-widest text-[var(--text-muted)]">Retrieving playbook templates...</p></Surface></div>;
  }

  // Group playbooks by Tier
  const tier1 = playbooks.filter((p) => p.tier === 1);
  const tier2 = playbooks.filter((p) => p.tier === 2);
  const tier3 = playbooks.filter((p) => p.tier === 3);
  const tier4 = playbooks.filter((p) => p.tier === 4);

  const showSeedingWarning = !fetchError && (warning || playbooks.length === 0);

  return (
    <div className="max-w-6xl space-y-8 text-[var(--text-primary)]">
      <PageHeader eyebrow="Signal Field · Configuration library" title="Playbook library" description="Install proven routing patterns and tailor them to your workflow." />
      {fetchError && (
        <Surface role="alert" className="dashboard-surface flex items-center justify-between gap-4 border-rose-200 bg-rose-50 p-5 text-rose-700">
          <p className="text-sm">{fetchError}</p>
          <button type="button" onClick={fetchPlaybooks} className="dashboard-button-secondary min-h-9 px-3 text-xs">TRY AGAIN</button>
        </Surface>
      )}
      {/* Seeding Warning Alert */}
      {showSeedingWarning && (
        <Surface role="alert" className="dashboard-surface space-y-3 border-amber-200 bg-amber-50 p-6 text-amber-800">
          <span className="block font-semibold uppercase tracking-[0.14em]">PLAYBOOK LIBRARY NOTICE</span>
          <p className="leading-relaxed">
            {warning || 'The playbook library is empty. Seed the templates to make these ready-to-use routing patterns available.'}
          </p>
          <div className="relative group overflow-x-auto rounded-xl border border-amber-200 bg-white/70 p-3 font-mono text-[10px] text-[var(--text-secondary)]">
            <pre>{seedSql}</pre>
            <span className="absolute top-2 right-2 text-[var(--accent)] font-bold" aria-label="SQL migration file">supabase/playbooks.sql</span>
          </div>
        </Surface>
      )}

      {/* Render Playbooks Grid by Tiers */}
      {!showSeedingWarning && (
        <div className="space-y-12">
          {/* TIER 1 */}
          {tier1.length > 0 && (
            <div className="space-y-4">
              <SectionHeader title="Tier 1 Highest Value" description="Fastest paths to qualified conversations." action={<StatusBadge tone="success">Highest value</StatusBadge>} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {tier1.map((playbook) => (
                  <PlaybookCard key={playbook.id} playbook={playbook} onInstall={openInstallModal} />
                ))}
              </div>
            </div>
          )}

          {/* TIER 2 */}
          {tier2.length > 0 && (
            <div className="space-y-4">
              <SectionHeader title="Tier 2 High Value" description="Reliable signals for active buying intent." action={<StatusBadge tone="info">High value</StatusBadge>} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {tier2.map((playbook) => (
                  <PlaybookCard key={playbook.id} playbook={playbook} onInstall={openInstallModal} />
                ))}
              </div>
            </div>
          )}

          {/* TIER 3 */}
          {tier3.length > 0 && (
            <div className="space-y-4">
              <SectionHeader title="Tier 3 Solid Value" description="Supporting patterns for a fuller signal mix." action={<StatusBadge tone="neutral">Solid value</StatusBadge>} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {tier3.map((playbook) => (
                  <PlaybookCard key={playbook.id} playbook={playbook} onInstall={openInstallModal} />
                ))}
              </div>
            </div>
          )}

          {/* TIER 4 */}
          {tier4.length > 0 && (
            <div className="space-y-4">
              <SectionHeader title="Tier 4 Completeness" description="Long-tail signals that round out coverage." action={<StatusBadge tone="neutral">Completeness</StatusBadge>} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {tier4.map((playbook) => (
                  <PlaybookCard key={playbook.id} playbook={playbook} onInstall={openInstallModal} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* INSTALLATION MODAL */}
      {selectedPlaybook && (
        <ModalShell open={Boolean(selectedPlaybook)} onClose={closeInstallModal} title="Install Playbook" className="max-w-lg" contentClassName="p-6">

            {/* Modal Content */}
            <div>
              {success ? (
                <div className="space-y-6 py-4 text-center" role="status" aria-live="polite">
                  <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-[var(--green)]/10 text-[var(--green)] border border-[var(--green)]/30 mb-2">
                    ✓
                  </div>
                  <div className="space-y-2">
                      <h3 className="font-mono text-sm font-bold text-[var(--text-primary)] uppercase">
                      Playbook Installed Successfully
                    </h3>
                    <p className="font-mono text-xs text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
                      The routing rule was successfully created and added to your routing sequence.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={closeInstallModal}
                      className="flex-1 rounded-lg bg-[var(--border-subtle)] px-4 py-2.5 text-xs text-white transition-all hover:bg-[var(--bg-elevated)] motion-safe:active:scale-[0.98]"
                    >
                      Close Window
                    </button>
                    <Link
                      href="/dashboard/rules"
                      className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-center text-xs text-white transition-all hover:bg-[var(--accent-hover)] motion-safe:active:scale-[0.98]"
                    >
                      View Routing Rules &rarr;
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInstallSubmit} className="space-y-5">
                  <div className="space-y-1.5">
                    <h3 className="font-mono text-sm font-bold text-[var(--text-primary)] uppercase">
                      {selectedPlaybook.name}
                    </h3>
                    <p className="font-mono text-xs text-[var(--text-secondary)] leading-relaxed">
                      {selectedPlaybook.description}
                    </p>
                  </div>

                  {errorMsg && (
                    <div role="alert" className="rounded border border-[var(--red)]/30 bg-[var(--red)]/10 p-3 text-xs text-[var(--red)]">
                      {errorMsg}
                    </div>
                  )}

                  {/* Form inputs */}
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {selectedPlaybook.required_inputs.map((input) => (
                      <div key={input.field_name} className="space-y-1.5">
                        <label htmlFor={`playbook-${selectedPlaybook.id}-${input.field_name}`} className="block text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
                          {input.label}
                        </label>
                        <input
                          id={`playbook-${selectedPlaybook.id}-${input.field_name}`}
                          type="text"
                          required
                          value={formValues[input.field_name] || ''}
                          onChange={(e) => handleInputChange(input.field_name, e.target.value)}
                          placeholder={input.placeholder}
                          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Submit buttons */}
                  <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={closeInstallModal}
                      className="rounded-lg bg-[var(--border-subtle)] px-5 py-2.5 text-xs text-white transition-all hover:bg-[var(--bg-elevated)] motion-safe:active:scale-[0.98]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={installing}
                      className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-xs font-semibold text-white transition-all hover:bg-[var(--accent-hover)] motion-safe:active:scale-[0.98] disabled:opacity-55"
                    >
                      {installing ? 'INSTALLING...' : 'INSTALL PLAYBOOK'}
                    </button>
                  </div>
                </form>
              )}
            </div>
        </ModalShell>
      )}
    </div>
  );
}

// Sub-component: Playbook Card
interface PlaybookCardProps {
  playbook: PlaybookTemplate;
  onInstall: (playbook: PlaybookTemplate) => void;
}

function PlaybookCard({ playbook, onInstall }: PlaybookCardProps) {
  const getSignalBadgeClass = (signalType: string) => {
    const base = 'border text-[9px] font-mono px-2 py-0.5 rounded uppercase font-bold select-none';
    switch (signalType) {
      case 'cold_email':
        return `${base} bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/40`;
      case 'linkedin_lead_gen':
        return `${base} bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30`;
      case 'returning_visitor':
        return `${base} bg-[var(--green)]/10 text-[var(--green)] border-[var(--green)]/30`;
      case 'google_ad':
        return `${base} bg-[var(--amber)]/10 text-[var(--amber)] border-[var(--amber)]/30`;
      case 'linkedin_ad':
        return `${base} bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30`;
      case 'meta_ad':
        return `${base} bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30`;
      case 'tiktok_ad':
        return `${base} bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30`;
      case 'qr_code':
        return `${base} bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30`;
      case 'g2_referral':
        return `${base} bg-[var(--amber)]/10 text-[var(--amber)] border-[var(--amber)]/30`;
      case 'partner_referral':
        return `${base} bg-[var(--red)]/10 text-[var(--red)] border-[var(--red)]/30`;
      default:
        return `${base} bg-[var(--border-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]`;
    }
  };

  const getSignalLabel = (signalType: string) => {
    return signalType.replace(/_/g, ' ');
  };

  return (
    <article className="group flex flex-col justify-between rounded-2xl border border-[var(--field-line)] bg-[var(--field-surface)] p-5 shadow-[0_14px_35px_rgba(25,33,29,0.06)] transition-transform motion-safe:hover:-translate-y-0.5">
      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className={getSignalBadgeClass(playbook.signal_type)}>
            {getSignalLabel(playbook.signal_type)}
          </span>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">Tier {playbook.tier}</span>
        </div>
        
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold leading-tight text-[var(--field-ink)] transition-colors group-hover:text-[var(--signal-primary)]">
            {playbook.name}
          </h3>
          <p className="min-h-[48px] text-sm leading-relaxed text-[var(--field-ink-secondary)]">
            {playbook.description}
          </p>
        </div>
      </div>
      
      <div className="pt-4 border-t border-[var(--border-subtle)]/60 mt-4 flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          {playbook.required_inputs.length} input{playbook.required_inputs.length !== 1 ? 's' : ''} required
        </span>
        <button
          onClick={() => onInstall(playbook)}
          className="dashboard-button-primary min-h-9 px-4 text-xs"
        >
          Install
        </button>
      </div>
    </article>
  );
}
