'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Send,
  Copy,
  ChevronDown,
  ChevronUp,
  Zap,
  Mail,
  Brain,
  Skull,
} from 'lucide-react';

interface ScoutDealDetail {
  id: string;
  deal_id: string;
  deal_name: string;
  stage: string;
  deal_value: number;
  close_date: string | null;
  days_in_stage: number;
  last_activity_days: number | null;
  contact_count: number;
  website_visits_7d: number;
  score: 'RED' | 'AMBER' | 'GREEN';
  primary_risk: string;
  next_action: string;
  draft_email: string | null;
  rep_name: string;
  rep_email: string;
}

interface PipelineSnapshot {
  id: string;
  total_deals: number;
  red_count: number;
  amber_count: number;
  green_count: number;
  total_pipeline_value: number;
  pressure_score: number;
  created_at: string;
}

interface AccelerationTrigger {
  prospect_name: string;
  company_name: string;
  deal_stage: string;
  last_visit_timestamp: string | null;
  deal_value: number;
  deal_id: string;
  rep_name: string;
  rep_email: string;
}

interface ModalData {
  dealId: string;
  dealName: string;
  repName: string;
  repEmail: string;
  message: string;
  subject: string;
  type: 'nudge' | 'notify';
}

interface BlindSpot {
  type: string;
  severity: 'critical' | 'warning';
  description: string;
}

interface RepBlindSpotReport {
  rep_name: string;
  deal_count: number;
  blind_spots: BlindSpot[];
}

interface DealObituary {
  id: string;
  deal_id: string;
  deal_name: string;
  deal_value: number;
  close_date: string | null;
  stage_died_in: string;
  days_in_final_stage: number;
  likely_cause: string;
  what_rep_could_do: string;
  pattern_match: string;
  full_obituary: string;
  created_at: string;
}

export default function ScoutDashboard() {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [deals, setDeals] = useState<ScoutDealDetail[]>([]);
  const [triggers, setTriggers] = useState<AccelerationTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningScout, setRunningScout] = useState(false);
  const [expandedDeals, setExpandedDeals] = useState<Record<string, boolean>>({});
  const [expandedEmails, setExpandedEmails] = useState<Record<string, boolean>>({});
  const [scoreChanges, setScoreChanges] = useState<string[]>([]);
  const [blindSpots, setBlindSpots] = useState<RepBlindSpotReport[]>([]);
  const [obituaries, setObituaries] = useState<DealObituary[]>([]);
  const [generatingObits, setGeneratingObits] = useState(false);

  // Layout States
  const [activeTab, setActiveTab] = useState<'red' | 'amber' | 'green'>('red');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    triggers: true,       // Default collapsed
    pipelineHealth: false, // Default expanded
    repIntelligence: false, // Default expanded
    obituaries: true,     // Default collapsed
  });

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Nudge/Notify Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [sendingNudge, setSendingNudge] = useState(false);

  // Fetch all pipeline data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      const res = await fetch('/api/scout/pipeline');
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.pipeline_snapshot || null);
        const fetchedDeals = (data.deal_scores || []) as ScoutDealDetail[];
        setDeals(fetchedDeals);
        setTriggers(data.acceleration_triggers || []);

        // Detect score changes since last stored scores
        if (typeof window !== 'undefined') {
          try {
            const localScoresStr = localStorage.getItem('scout_previous_scores');
            const prevScores = localScoresStr ? JSON.parse(localScoresStr) : {};
            const changed: string[] = [];
            fetchedDeals.forEach((deal) => {
              const prev = prevScores[deal.deal_id];
              if (prev && prev !== deal.score) {
                changed.push(`${deal.deal_name} moved to ${deal.score}`);
              }
            });
            setScoreChanges(changed);

            // Update localStorage
            const currentScores: Record<string, string> = {};
            fetchedDeals.forEach((deal) => {
              currentScores[deal.deal_id] = deal.score;
            });
            localStorage.setItem('scout_previous_scores', JSON.stringify(currentScores));
          } catch (err) {
            console.error('Failed to parse or save previous scores:', err);
          }
        }

        // Initialize expanded states: RED expanded, AMBER/GREEN collapsed
        const initialExpanded: Record<string, boolean> = {};
        for (const deal of fetchedDeals) {
          initialExpanded[deal.deal_id] = deal.score === 'RED';
        }
        setExpandedDeals(initialExpanded);
      }

      // Fetch Rep Blindspots
      const bsRes = await fetch('/api/scout/blindspots');
      if (bsRes.ok) {
        const bsData = await bsRes.json();
        setBlindSpots(bsData || []);
      }

      // Fetch Deal Obituaries
      await fetchObituaries();
    } catch (err) {
      console.error('Failed to load Scout pipeline details:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchObituaries = async () => {
    try {
      const res = await fetch('/api/scout/obituaries');
      if (res.ok) {
        const data = await res.json();
        setObituaries(data || []);
      }
    } catch (err) {
      console.error('Failed to load deal obituaries:', err);
    }
  };

  const handleGenerateObituaries = async () => {
    if (generatingObits) return;
    setGeneratingObits(true);
    try {
      const res = await fetch('/api/scout/obituaries', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Successfully generated ${data.count} new deal obituaries.`);
        await fetchObituaries();
      } else {
        alert('Failed to generate deal obituaries.');
      }
    } catch (err) {
      console.error('Error generating obituaries:', err);
      alert('An error occurred during obituary generation.');
    } finally {
      setGeneratingObits(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Run Scout AI scoring pipeline analysis
  const handleRunAnalysis = async () => {
    if (runningScout) return;
    setRunningScout(true);
    try {
      const res = await fetch('/api/scout/score', {
        method: 'POST',
      });
      if (res.ok) {
        await fetchData();
      } else {
        alert('Failed to execute Scout AI analysis.');
      }
    } catch (err) {
      console.error('Error running Scout analysis:', err);
      alert('An error occurred during Scout analysis.');
    } finally {
      setRunningScout(false);
    }
  };

  // Log Nudge/Notify action
  const handleSendNudge = async () => {
    if (!modalData) return;
    setSendingNudge(true);
    try {
      const res = await fetch('/api/scout/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal_id: modalData.dealId,
          deal_name: modalData.dealName,
          rep_email: modalData.repEmail,
          rep_name: modalData.repName,
          message: `Subject: ${modalData.subject}\n\n${modalData.message}`,
        }),
      });

      if (res.ok) {
        alert(`${modalData.type === 'nudge' ? 'Nudge' : 'Notification'} logged and representative alerted!`);
        setShowModal(false);
      } else {
        alert('Failed to log nudge in database.');
      }
    } catch (err) {
      console.error('Error sending nudge:', err);
      alert('An error occurred while logging nudge.');
    } finally {
      setSendingNudge(false);
    }
  };

  // Open Nudge Modal for RED Deals
  const openNudgeModal = (deal: ScoutDealDetail) => {
    // Generate default subject and message
    const defaultSubject = `Action Needed: Re-engage ${deal.deal_name}`;
    const defaultMessage = deal.draft_email
      ? deal.draft_email
      : `Hi ${deal.rep_name},\n\nI reviewed our pipeline and noticed ${deal.deal_name} is currently flagged at risk because: ${deal.primary_risk}.\n\nPlease review and take this action today: ${deal.next_action}.\n\nBest,\nSales Operations`;

    setModalData({
      dealId: deal.deal_id,
      dealName: deal.deal_name,
      repName: deal.rep_name,
      repEmail: deal.rep_email,
      subject: defaultSubject,
      message: defaultMessage,
      type: 'nudge',
    });
    setShowModal(true);
  };

  // Open Notify Modal for Acceleration Triggers
  const openNotifyModal = (trigger: AccelerationTrigger) => {
    const defaultSubject = `VIP Prospect Activity: ${trigger.prospect_name} at ${trigger.company_name}`;
    const defaultMessage = `Hi ${trigger.rep_name},\n\nGreat news! ${trigger.prospect_name} from ${trigger.company_name} just visited our website and triggered personalization rules in the last 24 hours.\n\nThey have an open deal in the "${trigger.deal_stage}" stage (Value: $${trigger.deal_value.toLocaleString()}).\n\nThis is a high-intent signal! Please reach out to them today to accelerate this deal.\n\nBest,\nSales Operations`;

    setModalData({
      dealId: trigger.deal_id,
      dealName: `${trigger.prospect_name} - ${trigger.company_name}`,
      repName: trigger.rep_name,
      repEmail: trigger.rep_email,
      subject: defaultSubject,
      message: defaultMessage,
      type: 'notify',
    });
    setShowModal(true);
  };

  // Toggle card collapse state
  const toggleCard = (dealId: string) => {
    setExpandedDeals((prev) => ({
      ...prev,
      [dealId]: !prev[dealId],
    }));
  };

  // Toggle collapsible email state
  const toggleEmail = (dealId: string) => {
    setExpandedEmails((prev) => ({
      ...prev,
      [dealId]: !prev[dealId],
    }));
  };

  // Copy Draft Email utility
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Draft email copied to clipboard!');
  };

  // Get Pressure Score formatting classes
  const getPressureStatus = (score: number) => {
    if (score <= 30) {
      return {
        borderClass: 'border-[var(--green)]/35 bg-[var(--green)]/5',
        textClass: 'text-[var(--green)]',
        label: 'PIPELINE HEALTHY',
      };
    } else if (score <= 60) {
      return {
        borderClass: 'border-[var(--amber)]/35 bg-[var(--amber)]/5',
        textClass: 'text-[var(--amber)]',
        label: 'PIPELINE NEEDS ATTENTION',
      };
    } else {
      return {
        borderClass: 'border-[var(--red)]/35 bg-[var(--red)]/5',
        textClass: 'text-[var(--red)]',
        label: 'PIPELINE AT RISK',
      };
    }
  };

  const pressureStatus = snapshot ? getPressureStatus(snapshot.pressure_score) : null;
  const redDeals = deals.filter((d) => d.score === 'RED');
  const amberDeals = deals.filter((d) => d.score === 'AMBER');
  const greenDeals = deals.filter((d) => d.score === 'GREEN');

  const hasRedDeals = redDeals.length > 0;
  const inboxItems: string[] = [];

  if (hasRedDeals) {
    // 1. Any deals that changed score
    scoreChanges.forEach((change) => {
      inboxItems.push(change);
    });

    // 2. The top RED deal needing action today
    const topRed = redDeals[0];
    if (topRed) {
      inboxItems.push(`${topRed.deal_name}: ${topRed.next_action}`);
    }

    // 3. The rep with the most RED deals
    const repCounts: Record<string, number> = {};
    redDeals.forEach((deal) => {
      const rep = deal.rep_name || 'Unknown Rep';
      repCounts[rep] = (repCounts[rep] || 0) + 1;
    });
    let topRep = '';
    let maxCount = 0;
    for (const [rep, count] of Object.entries(repCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topRep = rep;
      }
    }
    if (topRep) {
      inboxItems.push(`${topRep} has ${maxCount} RED deals`);
    }
  }

  const displayInboxItems = inboxItems.slice(0, 3);

  // Format currency values
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="space-y-6 text-gray-300">
      {/* 1. HEADER SECTION */}
      <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-6 gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-[var(--text-primary)] font-sans flex items-center gap-2.5">
            <Sparkles className="text-[var(--accent)] w-6 h-6 animate-pulse" />
            SCOUT AI
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1 font-sans">Pipeline Intelligence — Powered by AI</p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={handleRunAnalysis}
            disabled={runningScout || loading}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-sans text-xs font-semibold py-2 px-4 rounded-[8px] transition-all active:scale-[0.98] flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${runningScout ? 'animate-spin' : ''}`} />
            {runningScout ? 'RUNNING SCOUT ANALYSIS...' : 'RUN SCOUT ANALYSIS'}
          </button>
          {snapshot && (
            <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase">
              Last Analyzed: {new Date(snapshot.created_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500 font-mono text-sm tracking-wider">
          RETRIEVING SCOUT PIPELINE INTEL...
        </div>
      ) : (
        <div className="space-y-6 max-w-5xl mx-auto">
          {/* SECTION 1 — PIPELINE OVERVIEW (always expanded, not collapsible) */}
          <div className="space-y-3">
            <div className="border-b border-[var(--border-subtle)] pb-1.5">
              <h2 className="text-[13px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] uppercase font-sans">
                PIPELINE OVERVIEW
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Pressure Score Display */}
              {snapshot && pressureStatus ? (
                <div className={`border rounded-[12px] p-5 flex items-center justify-between gap-4 bg-[var(--bg-surface)] ${pressureStatus.borderClass} shadow-[0_1px_4px_rgba(0,0,0,0.25)]`}>
                  <div>
                    <span className="text-[12px] font-sans font-medium text-[var(--text-muted)] block uppercase tracking-wider">Pressure Score</span>
                    <span className="text-[48px] font-extrabold font-sans text-[var(--text-primary)] block mt-1 leading-none">
                      {snapshot.pressure_score}
                    </span>
                  </div>
                  <div className="border-l border-[var(--border-subtle)] pl-6 flex-1">
                    <span className="text-[12px] font-sans font-medium text-[var(--text-muted)] block uppercase tracking-wider">Status</span>
                    <span className={`text-xs font-sans font-bold block mt-1 uppercase ${pressureStatus.textClass}`}>
                      {pressureStatus.label}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 rounded-[12px] text-center text-xs font-mono text-[var(--text-muted)]">
                  No snapshot data available.
                </div>
              )}

              {/* Card 2: Scout Pipeline Diagnostics */}
              {snapshot ? (
                <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] p-5 flex flex-col justify-between gap-4 shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
                  <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2">
                    <span className="text-[12px] font-sans font-medium text-[var(--text-muted)] uppercase tracking-wider">Total Pipeline Value</span>
                    <span className="text-lg font-bold font-sans text-[var(--green)]">
                      {formatCurrency(snapshot.total_pipeline_value)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 rounded-[8px]">
                      <span className="text-[10px] font-sans text-[var(--red)] block uppercase font-bold">At Risk</span>
                      <span className="text-lg font-bold font-mono text-[var(--text-primary)] block mt-0.5">
                        {snapshot.red_count}
                      </span>
                    </div>
                    <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 rounded-[8px]">
                      <span className="text-[10px] font-sans text-[var(--amber)] block uppercase font-bold">Warning</span>
                      <span className="text-lg font-bold font-mono text-[var(--text-primary)] block mt-0.5">
                        {snapshot.amber_count}
                      </span>
                    </div>
                    <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 rounded-[8px]">
                      <span className="text-[10px] font-sans text-[var(--green)] block uppercase font-bold">Healthy</span>
                      <span className="text-lg font-bold font-mono text-[var(--text-primary)] block mt-0.5">
                        {snapshot.green_count}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 rounded-[12px] text-center text-xs font-mono text-[var(--text-muted)]">
                  No diagnostics available.
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2 — SCOUT INBOX (always expanded, not collapsible) */}
          <div className="space-y-3">
            <div className="border-b border-[var(--border-subtle)] pb-1.5">
              <h2 className="text-[13px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] uppercase font-sans">
                SCOUT INBOX
              </h2>
            </div>
            
            <div className="border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--amber)] bg-[var(--bg-elevated)] rounded-[12px] p-5 shadow-[0_1px_4px_rgba(0,0,0,0.25)] font-sans text-xs space-y-2">
              <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold tracking-wider uppercase text-[12px]">
                <Zap className="text-[var(--amber)] w-4 h-4 fill-[var(--amber)]/10" />
                SCOUT INBOX — TODAY
              </div>
              <div className="space-y-1.5 text-[var(--text-secondary)]">
                {!hasRedDeals ? (
                  <p className="text-[var(--text-muted)] italic">No urgent items today.</p>
                ) : (
                  displayInboxItems.map((item, idx) => (
                    <p key={idx} className="flex items-start gap-2">
                      <span className="text-[var(--amber)]">•</span>
                      <span>{item}</span>
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3 — DEAL ACCELERATION TRIGGERS (collapsible, default collapsed) */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
            <button
              onClick={() => toggleSection('triggers')}
              className="w-full flex justify-between items-center p-4 bg-transparent hover:bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] transition-colors select-none text-left"
            >
              <span className="font-sans text-[13px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] uppercase flex items-center gap-2">
                <Zap className="text-[var(--amber)] w-3.5 h-3.5" />
                DEAL ACCELERATION TRIGGERS
              </span>
              {collapsedSections.triggers ? (
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                collapsedSections.triggers ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
              }`}
            >
              <div className="p-5 space-y-4">
                {triggers.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-[var(--border-subtle)] rounded bg-[var(--bg-elevated)]">
                    <p className="text-xs font-sans text-[var(--text-muted)]">No acceleration triggers in the last 24 hours.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {triggers.map((trigger, idx) => (
                      <div
                        key={idx}
                        className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 rounded-[12px] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-[var(--border-default)] transition-colors shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
                      >
                        <div className="space-y-1 md:space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-sans text-sm font-bold text-[var(--text-primary)]">{trigger.prospect_name}</span>
                            <span className="text-[var(--border-default)] font-sans text-xs">|</span>
                            <span className="font-sans text-xs text-[var(--text-secondary)]">{trigger.company_name}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-[var(--text-muted)]">
                            <span>Stage: <span className="text-[var(--text-secondary)]">{trigger.deal_stage}</span></span>
                            <span>Value: <span className="text-[var(--green)]">{formatCurrency(trigger.deal_value)}</span></span>
                            {trigger.last_visit_timestamp && (
                              <span>Visited: <span className="text-[var(--amber)]">{new Date(trigger.last_visit_timestamp).toLocaleTimeString()}</span></span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => openNotifyModal(trigger)}
                          className="w-full md:w-auto bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-sans text-xs font-semibold px-3.5 py-2 rounded-[8px] transition-colors active:scale-[0.98] flex items-center justify-center gap-1.5"
                        >
                          <Mail className="w-3 h-3" />
                          NOTIFY REP
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 4 — PIPELINE HEALTH (collapsible, default expanded) */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
            <button
              onClick={() => toggleSection('pipelineHealth')}
              className="w-full flex justify-between items-center p-4 bg-transparent hover:bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] transition-colors select-none text-left"
            >
              <span className="font-sans text-[13px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] uppercase flex items-center gap-2">
                <AlertTriangle className="text-[var(--red)] w-3.5 h-3.5" />
                PIPELINE HEALTH
              </span>
              {collapsedSections.pipelineHealth ? (
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                collapsedSections.pipelineHealth ? 'max-h-0 opacity-0' : 'max-h-[5000px] opacity-100'
              }`}
            >
              <div className="p-5 space-y-4">
                {/* Tabs Header */}
                <div className="flex border-b border-[var(--border-subtle)] font-sans text-xs mb-4">
                  <button
                    onClick={() => setActiveTab('red')}
                    className={`flex-1 py-3 text-center border-b-2 font-bold transition-all uppercase ${
                      activeTab === 'red'
                        ? 'border-[var(--red)] text-[var(--red)] bg-[var(--red)]/5'
                        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    AT RISK ({redDeals.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('amber')}
                    className={`flex-1 py-3 text-center border-b-2 font-bold transition-all uppercase ${
                      activeTab === 'amber'
                        ? 'border-[var(--amber)] text-[var(--amber)] bg-[var(--amber)]/5'
                        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    WARNING ({amberDeals.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('green')}
                    className={`flex-1 py-3 text-center border-b-2 font-bold transition-all uppercase ${
                      activeTab === 'green'
                        ? 'border-[var(--green)] text-[var(--green)] bg-[var(--green)]/5'
                        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    HEALTHY ({greenDeals.length})
                  </button>
                </div>

                {/* Tab content: AT RISK */}
                {activeTab === 'red' && (
                  <div className="space-y-4">
                    {redDeals.length === 0 ? (
                      <div className="py-8 text-center border border-[var(--border-subtle)] rounded-[12px] bg-[var(--bg-elevated)]">
                        <p className="text-xs font-sans text-[var(--text-muted)]">No red-scored deals in this snapshot.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {redDeals.map((deal) => {
                          const isExpanded = expandedDeals[deal.deal_id] !== false;
                          const isEmailOpen = expandedEmails[deal.deal_id] === true;
                          return (
                            <div
                              key={deal.deal_id}
                              className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] overflow-hidden border-l-[3px] border-l-[var(--red)] shadow-[0_1px_4px_rgba(0,0,0,0.25)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-all duration-200"
                            >
                              <div
                                onClick={() => toggleCard(deal.deal_id)}
                                className="p-4 flex justify-between items-center cursor-pointer hover:bg-[var(--bg-elevated)] select-none"
                              >
                                <div className="space-y-1">
                                  <h3 className="font-sans text-sm font-bold text-[var(--text-primary)]">{deal.deal_name}</h3>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-[var(--text-muted)]">
                                    <span>Rep: <span className="text-[var(--text-secondary)]">{deal.rep_name}</span></span>
                                    <span>Value: <span className="text-[var(--green)]">{formatCurrency(deal.deal_value)}</span></span>
                                    <span>Stage: <span className="text-[var(--text-secondary)]">{deal.stage}</span></span>
                                  </div>
                                </div>
                                <div>
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                                  )}
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="p-4 pt-0 border-t border-[var(--border-subtle)] space-y-4 bg-[var(--bg-surface)]">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-[var(--border-subtle)] py-3.5 text-[10px] font-mono">
                                    <div>
                                      <span className="text-[var(--text-muted)] block uppercase">Days In Stage</span>
                                      <span className="text-[var(--text-primary)] text-xs font-bold block mt-0.5">{deal.days_in_stage}d</span>
                                    </div>
                                    <div>
                                      <span className="text-[var(--text-muted)] block uppercase">Last Activity</span>
                                      <span className="text-[var(--text-primary)] text-xs font-bold block mt-0.5">
                                        {deal.last_activity_days !== null ? `${deal.last_activity_days}d ago` : 'None logged'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[var(--text-muted)] block uppercase">Contact Engagement</span>
                                      <span className="text-[var(--text-primary)] text-xs font-bold block mt-0.5">{deal.contact_count} contacts</span>
                                    </div>
                                    <div>
                                      <span className="text-[var(--text-muted)] block uppercase">Recent Web Visits</span>
                                      <span className="text-[var(--text-primary)] text-xs font-bold block mt-0.5">{deal.website_visits_7d} visits (7d)</span>
                                    </div>
                                  </div>

                                  <div className="space-y-1 text-xs font-sans">
                                    <span className="font-sans text-[11px] font-bold text-[var(--red)] uppercase tracking-wider block">Primary Risk Factor</span>
                                    <p className="font-mono text-[var(--red)] leading-relaxed">{deal.primary_risk}</p>
                                  </div>

                                  <div className="bg-[var(--red)]/5 border border-[var(--red)]/20 p-3 rounded-[8px] space-y-1 text-xs font-sans">
                                    <span className="font-sans text-[11px] font-bold text-[var(--red)] uppercase tracking-wider block">Recommended Rep Action (Today)</span>
                                    <p className="font-sans text-[var(--text-secondary)]">{deal.next_action}</p>
                                  </div>

                                  <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2">
                                    {deal.draft_email ? (
                                      <button
                                        onClick={() => toggleEmail(deal.deal_id)}
                                        className="border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-sans text-[11px] py-2 px-3.5 rounded-[8px] transition-all flex items-center justify-center gap-1.5"
                                      >
                                        <Mail className="w-3.5 h-3.5" />
                                        {isEmailOpen ? 'HIDE DRAFT EMAIL' : 'VIEW DRAFT EMAIL'}
                                      </button>
                                    ) : (
                                      <div />
                                    )}

                                    <button
                                      onClick={() => openNudgeModal(deal)}
                                      className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-sans text-xs font-semibold py-2 px-4.5 rounded-[8px] transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      NUDGE REP
                                    </button>
                                  </div>

                                  {isEmailOpen && deal.draft_email && (
                                    <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 rounded-[8px] space-y-3 relative">
                                      <span className="font-sans text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest block">AI DRAFT EMAIL</span>
                                      <div className="font-mono text-xs text-[var(--text-secondary)] whitespace-pre-wrap bg-black/10 p-3 rounded border border-[var(--border-subtle)] leading-relaxed select-text">
                                        {deal.draft_email}
                                      </div>
                                      <div className="flex justify-end">
                                        <button
                                          onClick={() => copyToClipboard(deal.draft_email || '')}
                                          className="border border-[var(--border-default)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-sans text-[10px] py-1.5 px-2.5 rounded-[6px] transition-all flex items-center gap-1"
                                        >
                                          <Copy className="w-3 h-3" />
                                          COPY EMAIL
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab content: WARNING */}
                {activeTab === 'amber' && (
                  <div className="space-y-4">
                    {amberDeals.length === 0 ? (
                      <div className="py-8 text-center border border-[var(--border-subtle)] rounded-[12px] bg-[var(--bg-elevated)]">
                        <p className="text-xs font-sans text-[var(--text-muted)]">No amber-scored deals in this snapshot.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {amberDeals.map((deal) => {
                          const isExpanded = expandedDeals[deal.deal_id] === true;
                          return (
                            <div
                              key={deal.deal_id}
                              className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] overflow-hidden border-l-[3px] border-l-[var(--amber)] shadow-[0_1px_4px_rgba(0,0,0,0.25)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-all duration-200"
                            >
                              <div
                                onClick={() => toggleCard(deal.deal_id)}
                                className="p-4 flex justify-between items-center cursor-pointer hover:bg-[var(--bg-elevated)] select-none"
                              >
                                <div className="space-y-1">
                                  <h3 className="font-sans text-sm font-bold text-[var(--text-primary)]">{deal.deal_name}</h3>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-[var(--text-muted)]">
                                    <span>Rep: <span className="text-[var(--text-secondary)]">{deal.rep_name}</span></span>
                                    <span>Value: <span className="text-[var(--green)]">{formatCurrency(deal.deal_value)}</span></span>
                                    <span>Stage: <span className="text-[var(--text-secondary)]">{deal.stage}</span></span>
                                  </div>
                                </div>
                                <div>
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                                  )}
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="p-4 pt-0 border-t border-[var(--border-subtle)] space-y-4 bg-[var(--bg-surface)]">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-[var(--border-subtle)] py-3.5 text-[10px] font-mono">
                                    <div>
                                      <span className="text-[var(--text-muted)] block uppercase">Days In Stage</span>
                                      <span className="text-[var(--text-primary)] text-xs font-bold block mt-0.5">{deal.days_in_stage}d</span>
                                    </div>
                                    <div>
                                      <span className="text-[var(--text-muted)] block uppercase">Last Activity</span>
                                      <span className="text-[var(--text-primary)] text-xs font-bold block mt-0.5">
                                        {deal.last_activity_days !== null ? `${deal.last_activity_days}d ago` : 'None logged'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[var(--text-muted)] block uppercase">Contact Engagement</span>
                                      <span className="text-[var(--text-primary)] text-xs font-bold block mt-0.5">{deal.contact_count} contacts</span>
                                    </div>
                                    <div>
                                      <span className="text-[var(--text-muted)] block uppercase">Recent Web Visits</span>
                                      <span className="text-[var(--text-primary)] text-xs font-bold block mt-0.5">{deal.website_visits_7d} visits (7d)</span>
                                    </div>
                                  </div>

                                  <div className="space-y-1 text-xs font-sans">
                                    <span className="font-sans text-[11px] font-bold text-[var(--amber)] uppercase tracking-wider block">Primary Risk Factor</span>
                                    <p className="font-mono text-[var(--amber)] leading-relaxed">{deal.primary_risk}</p>
                                  </div>

                                  <div className="bg-[var(--amber)]/5 border border-[var(--amber)]/20 p-3 rounded-[8px] space-y-1 text-xs font-sans">
                                    <span className="font-sans text-[11px] font-bold text-[var(--amber)] uppercase tracking-wider block">Recommended Rep Action (Today)</span>
                                    <p className="font-sans text-[var(--text-secondary)]">{deal.next_action}</p>
                                  </div>

                                  <div className="flex justify-end pt-2">
                                    <button
                                      onClick={() => openNudgeModal(deal)}
                                      className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-sans text-xs font-semibold py-2 px-4.5 rounded-[8px] transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      NUDGE REP
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab content: HEALTHY */}
                {activeTab === 'green' && (
                  <div className="space-y-4">
                    {greenDeals.length === 0 ? (
                      <div className="py-8 text-center border border-[var(--border-subtle)] rounded-[12px] bg-[var(--bg-elevated)]">
                        <p className="text-xs font-sans text-[var(--text-muted)]">No green-scored deals in this snapshot.</p>
                      </div>
                    ) : (
                      <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] divide-y divide-[var(--border-subtle)] overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
                        {greenDeals.map((deal) => (
                          <div
                            key={deal.deal_id}
                            className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:bg-[var(--bg-elevated)] transition-colors border-l-[3px] border-l-[var(--green)]"
                          >
                            <div className="space-y-0.5">
                              <span className="font-sans text-sm font-bold text-[var(--text-primary)]">{deal.deal_name}</span>
                              <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--text-muted)]">
                                <span>Rep: <span className="text-[var(--text-secondary)]">{deal.rep_name}</span></span>
                                <span>Stage: <span className="text-[var(--text-secondary)]">{deal.stage}</span></span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 justify-between w-full sm:w-auto">
                              <span className="font-sans text-sm font-bold text-[var(--green)]">{formatCurrency(deal.deal_value)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 5 — REP INTELLIGENCE (collapsible, default expanded) */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
            <button
              onClick={() => toggleSection('repIntelligence')}
              className="w-full flex justify-between items-center p-4 bg-transparent hover:bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] transition-colors select-none text-left"
            >
              <span className="font-sans text-[13px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] uppercase flex items-center gap-2">
                <Brain className="text-[var(--accent)] w-3.5 h-3.5" />
                REP INTELLIGENCE
              </span>
              {collapsedSections.repIntelligence ? (
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                collapsedSections.repIntelligence ? 'max-h-0 opacity-0' : 'max-h-[3000px] opacity-100'
              }`}
            >
              <div className="p-5 space-y-4">
                {blindSpots.length === 0 || blindSpots.reduce((acc, report) => acc + (report.blind_spots?.length || 0), 0) === 0 ? (
                  <div className="py-8 text-center border border-dashed border-[var(--border-subtle)] rounded bg-[var(--bg-elevated)]">
                    <p className="text-xs font-sans text-[var(--text-muted)]">No blind spots detected across your team.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {blindSpots.map((report, idx) => {
                      const hasSpots = report.blind_spots && report.blind_spots.length > 0;
                      return (
                        <div
                          key={idx}
                          className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 rounded-[12px] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-[var(--border-default)] transition-colors shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
                        >
                          <div className="space-y-1.5 w-full">
                            <div className="flex items-center justify-between">
                              <span className="font-sans text-sm font-bold text-[var(--text-primary)]">{report.rep_name}</span>
                              <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase font-semibold">
                                {report.deal_count} {report.deal_count === 1 ? 'DEAL' : 'DEALS'}
                              </span>
                            </div>

                            {!hasSpots ? (
                              <div className="text-[10px] font-sans text-[var(--green)] uppercase tracking-wider flex items-center gap-1.5 font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
                                No blind spots detected
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {report.blind_spots.map((spot, sIdx) => {
                                  const isCritical = spot.severity === 'critical';
                                  const badgeColorClass = isCritical
                                    ? 'bg-[var(--red)]/5 text-[var(--red)] border-[var(--red)]/20'
                                    : 'bg-[var(--amber)]/5 text-[var(--amber)] border-[var(--amber)]/20';
                                  return (
                                    <div
                                      key={sIdx}
                                      className={`flex flex-col border p-2 rounded-[6px] text-[11px] font-sans w-full sm:w-auto sm:max-w-xs ${badgeColorClass}`}
                                    >
                                      <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] mb-0.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-[var(--red)]' : 'bg-[var(--amber)]'}`} />
                                        {spot.type}
                                      </div>
                                      <div className="text-[var(--text-secondary)] text-[10px] leading-relaxed">
                                        {spot.description}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 6 — DEAL OBITUARIES (collapsible, default collapsed) */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
            <button
              onClick={() => toggleSection('obituaries')}
              className="w-full flex justify-between items-center p-4 bg-transparent hover:bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] transition-colors select-none text-left"
            >
              <span className="font-sans text-[13px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] uppercase flex items-center gap-2">
                <Skull className="text-[var(--red)] w-3.5 h-3.5" />
                DEAL OBITUARIES
              </span>
              {collapsedSections.obituaries ? (
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                collapsedSections.obituaries ? 'max-h-0 opacity-0' : 'max-h-[3000px] opacity-100'
              }`}
            >
              <div className="p-5 space-y-4 font-sans">
                <div className="flex justify-between items-center pb-2 border-b border-[var(--border-subtle)]">
                  <div className="text-[12px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                    Post-Mortem Deal Reviews
                  </div>
                  <button
                    onClick={handleGenerateObituaries}
                    disabled={generatingObits}
                    className="border border-[var(--red)]/40 bg-[var(--red)]/5 hover:bg-[var(--red)]/10 text-[var(--red)] font-sans text-[11px] font-bold py-1.5 px-3 rounded-[8px] uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${generatingObits ? 'animate-spin' : ''}`} />
                    {generatingObits ? 'GENERATING...' : 'GENERATE OBITUARIES'}
                  </button>
                </div>

                {obituaries.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-[var(--border-subtle)] rounded bg-[var(--bg-elevated)]">
                    <p className="text-xs font-sans text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
                      No closed-lost deals found. Obituaries are generated automatically when deals are marked lost in HubSpot.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {obituaries.map((obit, idx) => (
                      <div
                        key={idx}
                        className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 rounded-[12px] flex flex-col justify-between gap-3 hover:border-[var(--border-default)] transition-colors shadow-[0_1px_4px_rgba(0,0,0,0.15)] font-sans"
                      >
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <span className="text-sm font-bold text-[var(--text-primary)] leading-snug font-sans">{obit.deal_name}</span>
                            <span className="text-xs font-bold text-[var(--red)] font-mono">{formatCurrency(obit.deal_value)}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--text-muted)] uppercase font-semibold">
                            <span>Died in: <strong className="text-[var(--text-secondary)]">{obit.stage_died_in}</strong></span>
                            {obit.days_in_final_stage !== undefined && (
                              <span>Days in stage: <strong className="text-[var(--text-secondary)]">{obit.days_in_final_stage}</strong></span>
                            )}
                            {obit.close_date && (
                              <span>Lost Date: <strong className="text-[var(--text-secondary)]">{obit.close_date.split('T')[0]}</strong></span>
                            )}
                          </div>
                          
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed pt-1.5 border-t border-[var(--border-subtle)]">
                            {obit.full_obituary}
                          </p>
                        </div>

                        <div className="space-y-1.5 text-[10px] pt-1.5 border-t border-[var(--border-subtle)]/60 font-sans">
                          <div>
                            <span className="text-[var(--red)] font-bold uppercase tracking-wider">Likely Cause: </span>
                            <span className="text-[var(--text-secondary)]">{obit.likely_cause}</span>
                          </div>
                          <div>
                            <span className="text-[var(--accent)] font-bold uppercase tracking-wider">Loss Pattern: </span>
                            <span className="text-[var(--text-secondary)]">{obit.pattern_match}</span>
                          </div>
                          <div>
                            <span className="text-[var(--green)] font-bold uppercase tracking-wider">Advice: </span>
                            <span className="text-[var(--text-secondary)]">{obit.what_rep_could_do}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. NUDGE / NOTIFY REPRESENTATIVE MODAL */}
      {showModal && modalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay backdrop */}
          <div
            onClick={() => setShowModal(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
          />

          {/* Modal Container */}
          <div className="relative border border-[var(--border-subtle)] bg-[var(--bg-surface)] w-full max-w-lg rounded-[12px] overflow-hidden shadow-2xl p-6 space-y-4 font-sans">
            
            {/* Title header */}
            <div className="border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Mail className="text-[var(--accent)] w-4.5 h-4.5" />
                {modalData.type === 'nudge' ? 'NUDGE DEAL REPRESENTATIVE' : 'SEND ALERTS NOTIFICATION'}
              </h3>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[var(--text-muted)] uppercase text-[9px] block font-semibold">To Representative</label>
                <input
                  type="text"
                  readOnly
                  value={`${modalData.repName} <${modalData.repEmail}>`}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-2.5 rounded-[8px] text-[var(--text-secondary)] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[var(--text-muted)] uppercase text-[9px] block font-semibold">Subject</label>
                <input
                  type="text"
                  value={modalData.subject}
                  onChange={(e) => setModalData({ ...modalData, subject: e.target.value })}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-2.5 rounded-[8px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-all font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[var(--text-muted)] uppercase text-[9px] block font-semibold">Email Body Message</label>
                <textarea
                  rows={8}
                  value={modalData.message}
                  onChange={(e) => setModalData({ ...modalData, message: e.target.value })}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-3 rounded-[8px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-all resize-none leading-relaxed font-sans"
                />
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                disabled={sendingNudge}
                className="border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-sans text-xs py-2 px-4 rounded-[8px] transition-all"
              >
                CANCEL
              </button>
              <button
                onClick={handleSendNudge}
                disabled={sendingNudge}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-sans text-xs font-semibold py-2 px-4.5 rounded-[8px] transition-all active:scale-[0.98] flex items-center gap-1.5"
              >
                {sendingNudge ? 'SENDING...' : 'SEND NUDGE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
