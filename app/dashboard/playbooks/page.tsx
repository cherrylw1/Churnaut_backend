'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

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

  // Modal State
  const [selectedPlaybook, setSelectedPlaybook] = useState<PlaybookTemplate | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPlaybooks = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/playbooks');
      if (res.ok) {
        const data = await res.json();
        setPlaybooks(data.playbooks || []);
        if (data.warning) {
          setWarning(data.warning);
        }
      } else {
        console.error('Failed to load playbook templates');
      }
    } catch (err) {
      console.error('Error fetching playbooks:', err);
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
    return (
      <div className="text-center py-12 text-gray-500 font-mono text-sm uppercase tracking-widest bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
        RETRIEVING PLAYBOOK TEMPLATES...
      </div>
    );
  }

  // Group playbooks by Tier
  const tier1 = playbooks.filter((p) => p.tier === 1);
  const tier2 = playbooks.filter((p) => p.tier === 2);
  const tier3 = playbooks.filter((p) => p.tier === 3);
  const tier4 = playbooks.filter((p) => p.tier === 4);

  const showSeedingWarning = warning || playbooks.length === 0;

  return (
    <div className="space-y-8 max-w-6xl bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen">
      {/* Page Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5">
        <h1 className="text-xl font-bold tracking-wider font-mono uppercase text-white">
          PLAYBOOK LIBRARY
        </h1>
        <p className="text-xs font-mono text-gray-400 mt-1">
          Deploy pre-configured high-converting routing rules and personalization flows in one click.
        </p>
      </div>

      {/* Seeding Warning Alert */}
      {showSeedingWarning && (
        <div className="border border-yellow-900/40 bg-yellow-950/20 text-[#f59e0b] p-6 rounded-lg font-mono text-xs space-y-3">
          <span className="font-bold block uppercase tracking-wider">DATABASE SEEDING REQUIRED</span>
          <p className="leading-relaxed">
            The Playbook templates have not been seeded into the database yet. To load the 21 standard playbooks, please copy and run the SQL migration statements.
          </p>
          <div className="relative group border border-yellow-950 bg-[#080B0F] rounded p-3 font-mono text-[10px] text-gray-300 overflow-x-auto">
            <pre>{seedSql}</pre>
            <Link
              href="file:///Users/macbook/Movie%20review%20website/TEST%20frontend%20for%20router/Churnaut_backend/supabase/playbooks.sql"
              className="absolute top-2 right-2 text-indigo-400 hover:text-white underline font-bold"
              target="_blank"
            >
              VIEW SQL FILE
            </Link>
          </div>
        </div>
      )}

      {/* Render Playbooks Grid by Tiers */}
      {!showSeedingWarning && (
        <div className="space-y-12">
          {/* TIER 1 */}
          {tier1.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xs font-mono font-bold text-[#10b981] uppercase tracking-widest bg-green-950/10 py-1.5 px-3 rounded border border-green-900/20 inline-block">
                Tier 1 Highest Value
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tier1.map((playbook) => (
                  <PlaybookCard key={playbook.id} playbook={playbook} onInstall={openInstallModal} />
                ))}
              </div>
            </div>
          )}

          {/* TIER 2 */}
          {tier2.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xs font-mono font-bold text-[#10b981] uppercase tracking-widest bg-green-950/10 py-1.5 px-3 rounded border border-green-900/20 inline-block">
                Tier 2 High Value
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tier2.map((playbook) => (
                  <PlaybookCard key={playbook.id} playbook={playbook} onInstall={openInstallModal} />
                ))}
              </div>
            </div>
          )}

          {/* TIER 3 */}
          {tier3.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xs font-mono font-bold text-[#10b981] uppercase tracking-widest bg-green-950/10 py-1.5 px-3 rounded border border-green-900/20 inline-block">
                Tier 3 Solid Value
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tier3.map((playbook) => (
                  <PlaybookCard key={playbook.id} playbook={playbook} onInstall={openInstallModal} />
                ))}
              </div>
            </div>
          )}

          {/* TIER 4 */}
          {tier4.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xs font-mono font-bold text-[#10b981] uppercase tracking-widest bg-green-950/10 py-1.5 px-3 rounded border border-green-900/20 inline-block">
                Tier 4 Completeness
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg max-w-lg w-full overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--border-subtle)] bg-[#090d12]">
              <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                Install Playbook
              </span>
              <button
                onClick={closeInstallModal}
                className="text-gray-400 hover:text-white transition-colors text-xs font-mono"
              >
                [CLOSE]
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {success ? (
                <div className="space-y-6 text-center py-4">
                  <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-950/30 text-[#10b981] border border-green-900/40 mb-2">
                    ✓
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-mono text-sm font-bold text-white uppercase">
                      Playbook Installed Successfully
                    </h3>
                    <p className="font-mono text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                      The routing rule was successfully created and added to your routing sequence.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={closeInstallModal}
                      className="flex-1 bg-[var(--border-subtle)] hover:bg-[#252b3e] text-white font-mono text-xs py-2.5 px-4 rounded transition-all active:scale-[0.98]"
                    >
                      Close Window
                    </button>
                    <Link
                      href="/dashboard/rules"
                      className="flex-1 bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2.5 px-4 rounded text-center transition-all active:scale-[0.98]"
                    >
                      View Routing Rules &rarr;
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInstallSubmit} className="space-y-5">
                  <div className="space-y-1.5">
                    <h3 className="font-mono text-sm font-bold text-white uppercase">
                      {selectedPlaybook.name}
                    </h3>
                    <p className="font-mono text-xs text-gray-400 leading-relaxed">
                      {selectedPlaybook.description}
                    </p>
                  </div>

                  {errorMsg && (
                    <div className="border border-red-900/40 bg-red-950/20 text-red-400 p-3 rounded font-mono text-xs">
                      {errorMsg}
                    </div>
                  )}

                  {/* Form inputs */}
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {selectedPlaybook.required_inputs.map((input) => (
                      <div key={input.field_name} className="space-y-1.5">
                        <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                          {input.label}
                        </label>
                        <input
                          type="text"
                          required
                          value={formValues[input.field_name] || ''}
                          onChange={(e) => handleInputChange(input.field_name, e.target.value)}
                          placeholder={input.placeholder}
                          className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Submit buttons */}
                  <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={closeInstallModal}
                      className="bg-[var(--border-subtle)] hover:bg-[#252b3e] text-white font-mono text-xs py-2.5 px-5 rounded transition-all active:scale-[0.98]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={installing}
                      className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2.5 px-6 rounded transition-all active:scale-[0.98] disabled:opacity-55"
                    >
                      {installing ? 'INSTALLING...' : 'INSTALL PLAYBOOK'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
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
        return `${base} bg-indigo-950/20 text-[#6366f1] border-indigo-900/40`;
      case 'linkedin_lead_gen':
        return `${base} bg-blue-950/20 text-blue-400 border-blue-900/40`;
      case 'returning_visitor':
        return `${base} bg-green-950/20 text-[#10b981] border-green-900/40`;
      case 'google_ad':
        return `${base} bg-yellow-950/20 text-yellow-500 border-yellow-900/40`;
      case 'linkedin_ad':
        return `${base} bg-sky-950/20 text-sky-400 border-sky-900/40`;
      case 'meta_ad':
        return `${base} bg-purple-950/20 text-purple-400 border-purple-900/40`;
      case 'tiktok_ad':
        return `${base} bg-pink-950/20 text-pink-400 border-pink-900/40`;
      case 'qr_code':
        return `${base} bg-teal-950/20 text-teal-400 border-teal-900/40`;
      case 'g2_referral':
        return `${base} bg-orange-950/20 text-orange-400 border-orange-900/40`;
      case 'partner_referral':
        return `${base} bg-rose-950/20 text-rose-400 border-rose-900/40`;
      default:
        return `${base} bg-[var(--border-subtle)] text-gray-400 border-[var(--border-subtle)]`;
    }
  };

  const getSignalLabel = (signalType: string) => {
    return signalType.replace(/_/g, ' ');
  };

  return (
    <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-lg p-5 flex flex-col justify-between hover:border-[#6366f1]/50 hover:bg-[var(--bg-elevated)] transition-all group">
      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className={getSignalBadgeClass(playbook.signal_type)}>
            {getSignalLabel(playbook.signal_type)}
          </span>
          <span className="text-[10px] font-mono text-gray-500">Tier {playbook.tier}</span>
        </div>
        
        <div className="space-y-1.5">
          <h3 className="text-xs font-mono font-bold text-white uppercase group-hover:text-[#6366f1] transition-colors leading-tight">
            {playbook.name}
          </h3>
          <p className="text-[11px] font-mono text-gray-400 leading-relaxed min-h-[48px]">
            {playbook.description}
          </p>
        </div>
      </div>
      
      <div className="pt-4 border-t border-[var(--border-subtle)]/60 mt-4 flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-gray-500">
          {playbook.required_inputs.length} input{playbook.required_inputs.length !== 1 ? 's' : ''} required
        </span>
        <button
          onClick={() => onInstall(playbook)}
          className="bg-[var(--border-subtle)] hover:bg-[#6366f1] text-white font-mono text-[10px] py-1.5 px-4 rounded transition-all active:scale-[0.98]"
        >
          Install
        </button>
      </div>
    </div>
  );
}
