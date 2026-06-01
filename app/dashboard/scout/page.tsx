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
        borderClass: 'border-green-900/50 bg-green-950/10',
        textClass: 'text-green-500',
        label: 'PIPELINE HEALTHY',
      };
    } else if (score <= 60) {
      return {
        borderClass: 'border-yellow-900/50 bg-yellow-950/10',
        textClass: 'text-yellow-500',
        label: 'PIPELINE NEEDS ATTENTION',
      };
    } else {
      return {
        borderClass: 'border-red-900/50 bg-red-950/10',
        textClass: 'text-red-500',
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
      <div className="flex justify-between items-center border-b border-[#1a1f2e] pb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-wider font-mono text-white flex items-center gap-2">
            <Sparkles className="text-[#6366f1] w-6 h-6 animate-pulse" />
            SCOUT AI
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1">Pipeline Intelligence — Powered by AI</p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={handleRunAnalysis}
            disabled={runningScout || loading}
            className="bg-[#6366f1] hover:bg-[#5053e1] disabled:opacity-50 text-white font-mono text-xs py-2.5 px-4 rounded transition-all active:scale-[0.98] flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${runningScout ? 'animate-spin' : ''}`} />
            {runningScout ? 'RUNNING SCOUT ANALYSIS...' : 'RUN SCOUT ANALYSIS'}
          </button>
          {snapshot && (
            <span className="text-[9px] font-mono text-gray-500 uppercase">
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
            <div className="border-b border-[#1a1f2e] pb-1.5">
              <h2 className="text-xs font-bold font-mono tracking-wider text-indigo-400 uppercase">
                SECTION 1 — PIPELINE OVERVIEW
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Pressure Score Display */}
              {snapshot && pressureStatus ? (
                <div className={`border rounded-lg p-5 flex items-center justify-between gap-4 bg-[#0d1117]/25 ${pressureStatus.borderClass}`}>
                  <div>
                    <span className="text-[10px] font-mono text-gray-500 block uppercase tracking-wider">Pressure Score</span>
                    <span className="text-4xl font-extrabold font-mono text-white block mt-1">
                      {snapshot.pressure_score}
                    </span>
                  </div>
                  <div className="border-l border-[#1a1f2e] pl-6 flex-1">
                    <span className="text-[10px] font-mono text-gray-500 block uppercase tracking-wider">Status</span>
                    <span className={`text-xs font-mono font-bold block mt-1 uppercase ${pressureStatus.textClass}`}>
                      {pressureStatus.label}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border border-[#1a1f2e] bg-[#0d1117]/10 p-5 rounded-lg text-center text-xs font-mono text-gray-500">
                  No snapshot data available.
                </div>
              )}

              {/* Card 2: Scout Pipeline Diagnostics */}
              {snapshot ? (
                <div className="border border-[#1a1f2e] bg-[#0d1117]/20 rounded-lg p-5 flex flex-col justify-between gap-4">
                  <div className="flex justify-between items-center border-b border-[#1a1f2e]/60 pb-2">
                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Total Pipeline Value</span>
                    <span className="text-lg font-bold font-mono text-green-400">
                      {formatCurrency(snapshot.total_pipeline_value)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="border border-[#1a1f2e] bg-[#080B0F]/30 p-2.5 rounded-lg">
                      <span className="text-[9px] font-mono text-red-500 block uppercase font-bold">At Risk</span>
                      <span className="text-lg font-bold font-mono text-white block mt-0.5">
                        {snapshot.red_count}
                      </span>
                    </div>
                    <div className="border border-[#1a1f2e] bg-[#080B0F]/30 p-2.5 rounded-lg">
                      <span className="text-[9px] font-mono text-yellow-500 block uppercase font-bold">Warning</span>
                      <span className="text-lg font-bold font-mono text-white block mt-0.5">
                        {snapshot.amber_count}
                      </span>
                    </div>
                    <div className="border border-[#1a1f2e] bg-[#080B0F]/30 p-2.5 rounded-lg">
                      <span className="text-[9px] font-mono text-green-500 block uppercase font-bold">Healthy</span>
                      <span className="text-lg font-bold font-mono text-white block mt-0.5">
                        {snapshot.green_count}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-[#1a1f2e] bg-[#0d1117]/10 p-5 rounded-lg text-center text-xs font-mono text-gray-500">
                  No diagnostics available.
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2 — SCOUT INBOX (always expanded, not collapsible) */}
          <div className="space-y-3">
            <div className="border-b border-[#1a1f2e] pb-1.5">
              <h2 className="text-xs font-bold font-mono tracking-wider text-indigo-400 uppercase">
                SECTION 2 — SCOUT INBOX
              </h2>
            </div>
            
            <div className="border border-[#1a1f2e] border-l-4 border-l-amber-500 bg-[#0d1117]/40 rounded-lg p-4 font-mono text-xs space-y-2">
              <div className="flex items-center gap-2 text-white font-bold tracking-wider uppercase">
                <Zap className="text-amber-500 w-4 h-4 fill-amber-500/20" />
                SCOUT INBOX — TODAY
              </div>
              <div className="space-y-1.5 text-gray-400">
                {!hasRedDeals ? (
                  <p className="text-gray-500 italic">No urgent items today.</p>
                ) : (
                  displayInboxItems.map((item, idx) => (
                    <p key={idx} className="flex items-start gap-2">
                      <span className="text-amber-500/80">•</span>
                      <span>{item}</span>
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3 — DEAL ACCELERATION TRIGGERS (collapsible, default collapsed) */}
          <div className="border border-[#1a1f2e] bg-[#0d1117]/10 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('triggers')}
              className="w-full flex justify-between items-center p-4 bg-[#161b22]/30 hover:bg-[#161b22]/55 border-b border-[#1a1f2e] transition-colors select-none text-left"
            >
              <span className="font-mono text-xs font-bold tracking-wider text-white uppercase flex items-center gap-2">
                <Zap className="text-yellow-500 w-3.5 h-3.5" />
                SECTION 3 — DEAL ACCELERATION TRIGGERS
              </span>
              {collapsedSections.triggers ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              )}
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                collapsedSections.triggers ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
              }`}
            >
              <div className="p-5 space-y-4">
                {triggers.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-[#1a1f2e] rounded bg-[#080B0F]/30">
                    <p className="text-xs font-mono text-gray-500">No acceleration triggers in the last 24 hours.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {triggers.map((trigger, idx) => (
                      <div
                        key={idx}
                        className="border border-[#1a1f2e] bg-[#080B0F]/60 p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-yellow-900/50 transition-colors"
                      >
                        <div className="space-y-1 md:space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-white">{trigger.prospect_name}</span>
                            <span className="text-gray-600 font-mono text-xs">|</span>
                            <span className="font-mono text-xs text-gray-400">{trigger.company_name}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-gray-500">
                            <span>Stage: <span className="text-gray-300">{trigger.deal_stage}</span></span>
                            <span>Value: <span className="text-green-500">{formatCurrency(trigger.deal_value)}</span></span>
                            {trigger.last_visit_timestamp && (
                              <span>Visited: <span className="text-yellow-500">{new Date(trigger.last_visit_timestamp).toLocaleTimeString()}</span></span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => openNotifyModal(trigger)}
                          className="w-full md:w-auto bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-[10px] px-3.5 py-2 rounded transition-colors active:scale-[0.98] flex items-center justify-center gap-1.5"
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
          <div className="border border-[#1a1f2e] bg-[#0d1117]/10 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('pipelineHealth')}
              className="w-full flex justify-between items-center p-4 bg-[#161b22]/30 hover:bg-[#161b22]/55 border-b border-[#1a1f2e] transition-colors select-none text-left"
            >
              <span className="font-mono text-xs font-bold tracking-wider text-white uppercase flex items-center gap-2">
                <AlertTriangle className="text-red-500 w-3.5 h-3.5" />
                SECTION 4 — PIPELINE HEALTH
              </span>
              {collapsedSections.pipelineHealth ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              )}
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                collapsedSections.pipelineHealth ? 'max-h-0 opacity-0' : 'max-h-[5000px] opacity-100'
              }`}
            >
              <div className="p-5 space-y-4">
                {/* Tabs Header */}
                <div className="flex border-b border-[#1a1f2e] font-mono text-xs mb-4">
                  <button
                    onClick={() => setActiveTab('red')}
                    className={`flex-1 py-3 text-center border-b-2 font-bold transition-all uppercase ${
                      activeTab === 'red'
                        ? 'border-red-500 text-red-500 bg-red-950/10'
                        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#161b22]/20'
                    }`}
                  >
                    AT RISK ({redDeals.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('amber')}
                    className={`flex-1 py-3 text-center border-b-2 font-bold transition-all uppercase ${
                      activeTab === 'amber'
                        ? 'border-yellow-500 text-yellow-500 bg-yellow-950/10'
                        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#161b22]/20'
                    }`}
                  >
                    WARNING ({amberDeals.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('green')}
                    className={`flex-1 py-3 text-center border-b-2 font-bold transition-all uppercase ${
                      activeTab === 'green'
                        ? 'border-green-500 text-green-500 bg-green-950/10'
                        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#161b22]/20'
                    }`}
                  >
                    HEALTHY ({greenDeals.length})
                  </button>
                </div>

                {/* Tab content: AT RISK */}
                {activeTab === 'red' && (
                  <div className="space-y-4">
                    {redDeals.length === 0 ? (
                      <div className="py-8 text-center border border-[#1a1f2e] rounded bg-[#080B0F]/20">
                        <p className="text-xs font-mono text-gray-500">No red-scored deals in this snapshot.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {redDeals.map((deal) => {
                          const isExpanded = expandedDeals[deal.deal_id] !== false;
                          const isEmailOpen = expandedEmails[deal.deal_id] === true;
                          return (
                            <div
                              key={deal.deal_id}
                              className="border border-[#1a1f2e] bg-[#0d1117]/35 rounded-lg overflow-hidden border-l-4 border-l-red-600 transition-all"
                            >
                              <div
                                onClick={() => toggleCard(deal.deal_id)}
                                className="p-4 flex justify-between items-center cursor-pointer hover:bg-[#080B0F]/30 select-none"
                              >
                                <div className="space-y-1">
                                  <h3 className="font-mono text-sm font-bold text-white">{deal.deal_name}</h3>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-gray-500">
                                    <span>Rep: <span className="text-gray-300">{deal.rep_name}</span></span>
                                    <span>Value: <span className="text-green-500">{formatCurrency(deal.deal_value)}</span></span>
                                    <span>Stage: <span className="text-gray-300">{deal.stage}</span></span>
                                  </div>
                                </div>
                                <div>
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-gray-500" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                  )}
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="p-4 pt-0 border-t border-[#1a1f2e] space-y-4 bg-[#080B0F]/10">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-[#1a1f2e] py-3.5 text-[10px] font-mono">
                                    <div>
                                      <span className="text-gray-500 block uppercase">Days In Stage</span>
                                      <span className="text-white text-xs font-bold block mt-0.5">{deal.days_in_stage}d</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 block uppercase">Last Activity</span>
                                      <span className="text-white text-xs font-bold block mt-0.5">
                                        {deal.last_activity_days !== null ? `${deal.last_activity_days}d ago` : 'None logged'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 block uppercase">Contact Engagement</span>
                                      <span className="text-white text-xs font-bold block mt-0.5">{deal.contact_count} contacts</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 block uppercase">Recent Web Visits</span>
                                      <span className="text-white text-xs font-bold block mt-0.5">{deal.website_visits_7d} visits (7d)</span>
                                    </div>
                                  </div>

                                  <div className="space-y-1 text-xs">
                                    <span className="font-mono text-[9px] font-bold text-red-500 uppercase tracking-wider block">Primary Risk Factor</span>
                                    <p className="font-mono text-red-400/90 leading-relaxed">{deal.primary_risk}</p>
                                  </div>

                                  <div className="bg-red-950/10 border border-red-900/30 p-3 rounded-lg space-y-1 text-xs">
                                    <span className="font-mono text-[9px] font-bold text-red-400 uppercase tracking-wider block">Recommended Rep Action (Today)</span>
                                    <p className="font-mono text-gray-200">{deal.next_action}</p>
                                  </div>

                                  <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2">
                                    {deal.draft_email ? (
                                      <button
                                        onClick={() => toggleEmail(deal.deal_id)}
                                        className="border border-[#1a1f2e] hover:border-gray-500 text-gray-400 hover:text-white font-mono text-[10px] py-2 px-3 rounded transition-all flex items-center justify-center gap-1.5"
                                      >
                                        <Mail className="w-3.5 h-3.5" />
                                        {isEmailOpen ? 'HIDE DRAFT EMAIL' : 'VIEW DRAFT EMAIL'}
                                      </button>
                                    ) : (
                                      <div />
                                    )}

                                    <button
                                      onClick={() => openNudgeModal(deal)}
                                      className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2 px-4 rounded transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      NUDGE REP
                                    </button>
                                  </div>

                                  {isEmailOpen && deal.draft_email && (
                                    <div className="border border-[#1a1f2e] bg-[#080B0F]/80 p-4 rounded-lg space-y-3 relative">
                                      <span className="font-mono text-[9px] font-bold text-indigo-400 uppercase tracking-widest block">AI DRAFT EMAIL</span>
                                      <div className="font-mono text-xs text-gray-400 whitespace-pre-wrap bg-black/20 p-3 rounded select-text leading-relaxed border border-[#1a1f2e]">
                                        {deal.draft_email}
                                      </div>
                                      <div className="flex justify-end">
                                        <button
                                          onClick={() => copyToClipboard(deal.draft_email || '')}
                                          className="border border-[#1a1f2e] hover:border-gray-500 hover:bg-[#080B0F] text-gray-400 hover:text-white font-mono text-[9px] py-1.5 px-2.5 rounded transition-all flex items-center gap-1"
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
                      <div className="py-8 text-center border border-[#1a1f2e] rounded bg-[#080B0F]/10">
                        <p className="text-xs font-mono text-gray-500">No amber-scored deals in this snapshot.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {amberDeals.map((deal) => {
                          const isExpanded = expandedDeals[deal.deal_id] === true;
                          return (
                            <div
                              key={deal.deal_id}
                              className="border border-[#1a1f2e] bg-[#0d1117]/20 rounded-lg overflow-hidden border-l-4 border-l-yellow-500 transition-all"
                            >
                              <div
                                onClick={() => toggleCard(deal.deal_id)}
                                className="p-4 flex justify-between items-center cursor-pointer hover:bg-[#080B0F]/20 select-none"
                              >
                                <div className="space-y-1">
                                  <h3 className="font-mono text-sm font-bold text-white">{deal.deal_name}</h3>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-gray-500">
                                    <span>Rep: <span className="text-gray-300">{deal.rep_name}</span></span>
                                    <span>Value: <span className="text-green-500">{formatCurrency(deal.deal_value)}</span></span>
                                    <span>Stage: <span className="text-gray-300">{deal.stage}</span></span>
                                  </div>
                                </div>
                                <div>
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-gray-500" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                  )}
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="p-4 pt-0 border-t border-[#1a1f2e] space-y-4 bg-[#080B0F]/10">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-[#1a1f2e] py-3.5 text-[10px] font-mono">
                                    <div>
                                      <span className="text-gray-500 block uppercase">Days In Stage</span>
                                      <span className="text-white text-xs font-bold block mt-0.5">{deal.days_in_stage}d</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 block uppercase">Last Activity</span>
                                      <span className="text-white text-xs font-bold block mt-0.5">
                                        {deal.last_activity_days !== null ? `${deal.last_activity_days}d ago` : 'None logged'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 block uppercase">Contact Engagement</span>
                                      <span className="text-white text-xs font-bold block mt-0.5">{deal.contact_count} contacts</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 block uppercase">Recent Web Visits</span>
                                      <span className="text-white text-xs font-bold block mt-0.5">{deal.website_visits_7d} visits (7d)</span>
                                    </div>
                                  </div>

                                  <div className="space-y-1 text-xs">
                                    <span className="font-mono text-[9px] font-bold text-yellow-500 uppercase tracking-wider block">Primary Risk Factor</span>
                                    <p className="font-mono text-yellow-400/90 leading-relaxed">{deal.primary_risk}</p>
                                  </div>

                                  <div className="bg-yellow-950/10 border border-yellow-900/30 p-3 rounded-lg space-y-1 text-xs">
                                    <span className="font-mono text-[9px] font-bold text-yellow-400 uppercase tracking-wider block">Recommended Rep Action (Today)</span>
                                    <p className="font-mono text-gray-200">{deal.next_action}</p>
                                  </div>

                                  <div className="flex justify-end pt-2">
                                    <button
                                      onClick={() => openNudgeModal(deal)}
                                      className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2 px-4 rounded transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
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
                      <div className="py-8 text-center border border-[#1a1f2e] rounded bg-[#080B0F]/10">
                        <p className="text-xs font-mono text-gray-500">No green-scored deals in this snapshot.</p>
                      </div>
                    ) : (
                      <div className="border border-[#1a1f2e] bg-[#0d1117]/10 rounded-lg divide-y divide-[#1a1f2e] overflow-hidden">
                        {greenDeals.map((deal) => (
                          <div
                            key={deal.deal_id}
                            className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:bg-[#080B0F]/20 transition-colors border-l-4 border-l-green-600"
                          >
                            <div className="space-y-0.5">
                              <span className="font-mono text-sm font-bold text-white">{deal.deal_name}</span>
                              <div className="flex items-center gap-3 text-[10px] font-mono text-gray-500">
                                <span>Rep: <span className="text-gray-300">{deal.rep_name}</span></span>
                                <span>Stage: <span className="text-gray-300">{deal.stage}</span></span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 justify-between w-full sm:w-auto">
                              <span className="font-mono text-xs font-bold text-green-400">{formatCurrency(deal.deal_value)}</span>
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
          <div className="border border-[#1a1f2e] bg-[#0d1117]/10 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('repIntelligence')}
              className="w-full flex justify-between items-center p-4 bg-[#161b22]/30 hover:bg-[#161b22]/55 border-b border-[#1a1f2e] transition-colors select-none text-left"
            >
              <span className="font-mono text-xs font-bold tracking-wider text-white uppercase flex items-center gap-2">
                <Brain className="text-indigo-400 w-3.5 h-3.5" />
                SECTION 5 — REP INTELLIGENCE
              </span>
              {collapsedSections.repIntelligence ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              )}
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                collapsedSections.repIntelligence ? 'max-h-0 opacity-0' : 'max-h-[3000px] opacity-100'
              }`}
            >
              <div className="p-5 space-y-4">
                {blindSpots.length === 0 || blindSpots.reduce((acc, report) => acc + (report.blind_spots?.length || 0), 0) === 0 ? (
                  <div className="py-8 text-center border border-dashed border-[#1a1f2e] rounded bg-[#080B0F]/30">
                    <p className="text-xs font-mono text-gray-500">No blind spots detected across your team.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {blindSpots.map((report, idx) => {
                      const hasSpots = report.blind_spots && report.blind_spots.length > 0;
                      return (
                        <div
                          key={idx}
                          className="border border-[#1a1f2e] bg-[#080B0F]/60 p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-indigo-900/40 transition-colors"
                        >
                          <div className="space-y-1.5 w-full">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm font-bold text-white">{report.rep_name}</span>
                              <span className="font-mono text-[10px] text-gray-500 uppercase">
                                {report.deal_count} {report.deal_count === 1 ? 'DEAL' : 'DEALS'}
                              </span>
                            </div>

                            {!hasSpots ? (
                              <div className="text-[10px] font-mono text-green-500 uppercase tracking-wider flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                No blind spots detected
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {report.blind_spots.map((spot, sIdx) => {
                                  const isCritical = spot.severity === 'critical';
                                  const badgeColorClass = isCritical
                                    ? 'bg-red-950/40 text-red-400 border-red-900/50'
                                    : 'bg-amber-950/40 text-amber-500 border-amber-900/50';
                                  return (
                                    <div
                                      key={sIdx}
                                      className={`flex flex-col border p-2 rounded text-[11px] font-mono w-full sm:w-auto sm:max-w-xs ${badgeColorClass}`}
                                    >
                                      <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] mb-0.5">
                                        <span className={`w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-red-500' : 'bg-amber-500'}`} />
                                        {spot.type}
                                      </div>
                                      <div className="text-gray-400 text-[10px] leading-relaxed">
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
          <div className="border border-[#1a1f2e] bg-[#0d1117]/10 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('obituaries')}
              className="w-full flex justify-between items-center p-4 bg-[#161b22]/30 hover:bg-[#161b22]/55 border-b border-[#1a1f2e] transition-colors select-none text-left"
            >
              <span className="font-mono text-xs font-bold tracking-wider text-white uppercase flex items-center gap-2">
                <Skull className="text-red-500 w-3.5 h-3.5" />
                SECTION 6 — DEAL OBITUARIES
              </span>
              {collapsedSections.obituaries ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              )}
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                collapsedSections.obituaries ? 'max-h-0 opacity-0' : 'max-h-[3000px] opacity-100'
              }`}
            >
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                    Post-Mortem Deal Reviews
                  </div>
                  <button
                    onClick={handleGenerateObituaries}
                    disabled={generatingObits}
                    className="border border-red-900/60 bg-red-950/20 hover:bg-red-900/30 text-red-400 hover:text-red-300 font-mono text-[10px] font-bold py-1.5 px-3 rounded uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${generatingObits ? 'animate-spin' : ''}`} />
                    {generatingObits ? 'GENERATING...' : 'GENERATE OBITUARIES'}
                  </button>
                </div>

                {obituaries.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-[#1a1f2e] rounded bg-[#080B0F]/30">
                    <p className="text-xs font-mono text-gray-500 max-w-md mx-auto leading-relaxed">
                      No closed-lost deals found. Obituaries are generated automatically when deals are marked lost in HubSpot.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {obituaries.map((obit, idx) => (
                      <div
                        key={idx}
                        className="border border-[#1a1f2e] bg-[#080B0F]/60 p-4 rounded-lg flex flex-col justify-between gap-3 hover:border-red-900/40 transition-colors font-mono"
                      >
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <span className="text-sm font-bold text-white leading-snug">{obit.deal_name}</span>
                            <span className="text-xs font-bold text-red-400">{formatCurrency(obit.deal_value)}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500 uppercase">
                            <span>Died in: <strong className="text-gray-300">{obit.stage_died_in}</strong></span>
                            {obit.days_in_final_stage !== undefined && (
                              <span>Days in stage: <strong className="text-gray-300">{obit.days_in_final_stage}</strong></span>
                            )}
                            {obit.close_date && (
                              <span>Lost Date: <strong className="text-gray-300">{obit.close_date.split('T')[0]}</strong></span>
                            )}
                          </div>
                          
                          <p className="text-xs text-gray-300 leading-relaxed pt-1.5 border-t border-[#1a1f2e]/60">
                            {obit.full_obituary}
                          </p>
                        </div>

                        <div className="space-y-1.5 text-[10px] pt-1.5 border-t border-[#1a1f2e]/30">
                          <div>
                            <span className="text-red-500/80 font-bold uppercase tracking-wider">Likely Cause: </span>
                            <span className="text-gray-400">{obit.likely_cause}</span>
                          </div>
                          <div>
                            <span className="text-indigo-400 font-bold uppercase tracking-wider">Loss Pattern: </span>
                            <span className="text-gray-400">{obit.pattern_match}</span>
                          </div>
                          <div>
                            <span className="text-green-400 font-bold uppercase tracking-wider">Advice: </span>
                            <span className="text-gray-400">{obit.what_rep_could_do}</span>
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
            className="absolute inset-0 bg-[#080B0F]/90 backdrop-blur-sm cursor-pointer"
          />

          {/* Modal Container */}
          <div className="relative border border-[#1a1f2e] bg-[#0d1117] w-full max-w-lg rounded-xl overflow-hidden shadow-2xl p-6 space-y-4">
            
            {/* Title header */}
            <div className="border-b border-[#1a1f2e] pb-3">
              <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
                <Mail className="text-[#6366f1] w-4.5 h-4.5" />
                {modalData.type === 'nudge' ? 'NUDGE DEAL REPRESENTATIVE' : 'SEND ALERTS NOTIFICATION'}
              </h3>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 text-xs font-mono">
              <div className="space-y-1">
                <label className="text-gray-500 uppercase text-[9px] block">To Representative</label>
                <input
                  type="text"
                  readOnly
                  value={`${modalData.repName} <${modalData.repEmail}>`}
                  className="w-full bg-[#080B0F] border border-[#1a1f2e] p-2.5 rounded text-gray-300 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-gray-500 uppercase text-[9px] block">Subject</label>
                <input
                  type="text"
                  value={modalData.subject}
                  onChange={(e) => setModalData({ ...modalData, subject: e.target.value })}
                  className="w-full bg-[#080B0F] border border-[#1a1f2e] p-2.5 rounded text-gray-200 outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-gray-500 uppercase text-[9px] block">Email Body Message</label>
                <textarea
                  rows={8}
                  value={modalData.message}
                  onChange={(e) => setModalData({ ...modalData, message: e.target.value })}
                  className="w-full bg-[#080B0F] border border-[#1a1f2e] p-3 rounded text-gray-200 outline-none focus:border-indigo-500 transition-all resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                disabled={sendingNudge}
                className="border border-[#1a1f2e] hover:border-gray-500 text-gray-400 hover:text-white font-mono text-xs py-2 px-4 rounded transition-all"
              >
                CANCEL
              </button>
              <button
                onClick={handleSendNudge}
                disabled={sendingNudge}
                className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2 px-4.5 rounded transition-all active:scale-[0.98] flex items-center gap-1.5"
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
