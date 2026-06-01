'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Send,
  Copy,
  ChevronDown,
  ChevronUp,
  Zap,
  Mail,
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

export default function ScoutDashboard() {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [deals, setDeals] = useState<ScoutDealDetail[]>([]);
  const [triggers, setTriggers] = useState<AccelerationTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningScout, setRunningScout] = useState(false);
  const [expandedDeals, setExpandedDeals] = useState<Record<string, boolean>>({});
  const [expandedEmails, setExpandedEmails] = useState<Record<string, boolean>>({});

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

        // Initialize expanded states: RED expanded, AMBER/GREEN collapsed
        const initialExpanded: Record<string, boolean> = {};
        for (const deal of fetchedDeals) {
          initialExpanded[deal.deal_id] = deal.score === 'RED';
        }
        setExpandedDeals(initialExpanded);
      }
    } catch (err) {
      console.error('Failed to load Scout pipeline details:', err);
    } finally {
      setLoading(false);
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
    if (score <= 40) {
      return {
        borderClass: 'border-red-900/50 bg-red-950/10',
        textClass: 'text-red-500',
        label: 'Pipeline at risk',
      };
    } else if (score <= 70) {
      return {
        borderClass: 'border-yellow-900/50 bg-yellow-950/10',
        textClass: 'text-yellow-500',
        label: 'Pipeline needs attention',
      };
    } else {
      return {
        borderClass: 'border-green-900/50 bg-green-950/10',
        textClass: 'text-green-500',
        label: 'Pipeline healthy',
      };
    }
  };

  const pressureStatus = snapshot ? getPressureStatus(snapshot.pressure_score) : null;
  const redDeals = deals.filter((d) => d.score === 'RED');
  const amberDeals = deals.filter((d) => d.score === 'AMBER');
  const greenDeals = deals.filter((d) => d.score === 'GREEN');

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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-[#1a1f2e] pb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-wider font-mono text-white flex items-center gap-2">
            <Sparkles className="text-[#6366f1] w-6 h-6 animate-pulse" />
            SCOUT AI
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1">Pipeline Intelligence — Powered by AI</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          {/* Pressure Score Display */}
          {snapshot && pressureStatus && (
            <div className={`border rounded-lg p-3 px-5 flex items-center gap-4 ${pressureStatus.borderClass}`}>
              <div>
                <span className="text-[10px] font-mono text-gray-500 block uppercase tracking-wider">Pressure Score</span>
                <span className="text-3xl font-extrabold font-mono text-white block mt-0.5">
                  {snapshot.pressure_score}
                </span>
              </div>
              <div className="border-l border-[#1a1f2e] pl-4">
                <span className="text-[10px] font-mono text-gray-500 block uppercase tracking-wider">Status</span>
                <span className={`text-xs font-mono font-bold block mt-1 uppercase ${pressureStatus.textClass}`}>
                  {pressureStatus.label}
                </span>
              </div>
            </div>
          )}

          {/* Action Trigger Buttons */}
          <div className="flex flex-col items-end gap-1.5 ml-auto lg:ml-0">
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
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500 font-mono text-sm tracking-wider">
          RETRIEVING SCOUT PIPELINE INTEL...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: Acceleration triggers and Deal Lists */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 2. DEAL ACCELERATION TRIGGERS PANEL */}
            <div className="border border-[#1a1f2e] bg-[#0d1117]/20 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-[#1a1f2e] pb-3">
                <Zap className="text-yellow-500 w-4 h-4" />
                <h2 className="text-xs font-bold tracking-wider font-mono uppercase text-white">
                  DEAL ACCELERATION TRIGGERS (LAST 24 HOURS)
                </h2>
              </div>

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

            {/* 3. RED DEALS (EXPANDED BY DEFAULT) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#1a1f2e] pb-2">
                <h2 className="text-xs font-bold font-mono tracking-wider text-red-500 uppercase flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  RED DEALS ({redDeals.length})
                </h2>
              </div>

              {redDeals.length === 0 ? (
                <div className="py-6 text-center border border-[#1a1f2e] rounded bg-[#080B0F]/20">
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
                        {/* Summary Header Toggler */}
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

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="p-4 pt-0 border-t border-[#1a1f2e] space-y-4 bg-[#080B0F]/10">
                            {/* Key metrics grid */}
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

                            {/* Risk description */}
                            <div className="space-y-1 text-xs">
                              <span className="font-mono text-[9px] font-bold text-red-500 uppercase tracking-wider block">Primary Risk Factor</span>
                              <p className="font-mono text-red-400/90 leading-relaxed">{deal.primary_risk}</p>
                            </div>

                            {/* Next action highlighted box */}
                            <div className="bg-red-950/10 border border-red-900/30 p-3 rounded-lg space-y-1 text-xs">
                              <span className="font-mono text-[9px] font-bold text-red-400 uppercase tracking-wider block">Recommended Rep Action (Today)</span>
                              <p className="font-mono text-gray-200">{deal.next_action}</p>
                            </div>

                            {/* Actions block */}
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

                            {/* Collapsible Draft Email Section */}
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

            {/* 4. AMBER DEALS (COLLAPSED BY DEFAULT) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#1a1f2e] pb-2">
                <h2 className="text-xs font-bold font-mono tracking-wider text-yellow-500 uppercase flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  AMBER DEALS ({amberDeals.length})
                </h2>
              </div>

              {amberDeals.length === 0 ? (
                <div className="py-4 text-center border border-[#1a1f2e] rounded bg-[#080B0F]/10">
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
                        {/* Summary Header Toggler */}
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

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="p-4 pt-0 border-t border-[#1a1f2e] space-y-4 bg-[#080B0F]/10">
                            {/* Key metrics grid */}
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

                            {/* Risk description */}
                            <div className="space-y-1 text-xs">
                              <span className="font-mono text-[9px] font-bold text-yellow-500 uppercase tracking-wider block">Primary Risk Factor</span>
                              <p className="font-mono text-yellow-400/90 leading-relaxed">{deal.primary_risk}</p>
                            </div>

                            {/* Next action highlighted box */}
                            <div className="bg-yellow-950/10 border border-yellow-900/30 p-3 rounded-lg space-y-1 text-xs">
                              <span className="font-mono text-[9px] font-bold text-yellow-400 uppercase tracking-wider block">Recommended Rep Action (Today)</span>
                              <p className="font-mono text-gray-200">{deal.next_action}</p>
                            </div>

                            {/* Actions block */}
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

            {/* 5. GREEN DEALS (COMPACT COLLAPSED LIST) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[#1a1f2e] pb-2">
                <h2 className="text-xs font-bold font-mono tracking-wider text-green-500 uppercase flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  GREEN DEALS ({greenDeals.length})
                </h2>
              </div>

              {greenDeals.length === 0 ? (
                <div className="py-4 text-center border border-[#1a1f2e] rounded bg-[#080B0F]/10">
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

          </div>

          {/* RIGHT SIDEBAR: Snapshot Analytics Quick Panel */}
          <div className="space-y-6">
            <div className="border border-[#1a1f2e] bg-[#0d1117]/20 rounded-lg p-5 space-y-6">
              <div className="border-b border-[#1a1f2e] pb-3">
                <h2 className="text-xs font-bold tracking-wider font-mono text-[#6366f1] uppercase">
                  SCOUT PIPELINE DIAGNOSTICS
                </h2>
              </div>

              {snapshot ? (
                <div className="space-y-5">
                  {/* Pipeline Value card */}
                  <div className="border border-[#1a1f2e] bg-[#080B0F]/40 p-4 rounded-lg space-y-1">
                    <span className="text-[10px] font-mono text-gray-500 uppercase block">Total Pipeline Value</span>
                    <span className="text-2xl font-extrabold font-mono text-green-400">
                      {formatCurrency(snapshot.total_pipeline_value)}
                    </span>
                  </div>

                  {/* Summary Metric Counters */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="border border-[#1a1f2e] bg-[#080B0F]/30 p-3 rounded-lg">
                      <span className="text-[9px] font-mono text-red-500 block uppercase font-bold">At Risk</span>
                      <span className="text-xl font-bold font-mono text-white block mt-1">
                        {snapshot.red_count}
                      </span>
                    </div>
                    <div className="border border-[#1a1f2e] bg-[#080B0F]/30 p-3 rounded-lg">
                      <span className="text-[9px] font-mono text-yellow-500 block uppercase font-bold">Warning</span>
                      <span className="text-xl font-bold font-mono text-white block mt-1">
                        {snapshot.amber_count}
                      </span>
                    </div>
                    <div className="border border-[#1a1f2e] bg-[#080B0F]/30 p-3 rounded-lg">
                      <span className="text-[9px] font-mono text-green-500 block uppercase font-bold">Healthy</span>
                      <span className="text-xl font-bold font-mono text-white block mt-1">
                        {snapshot.green_count}
                      </span>
                    </div>
                  </div>

                  {/* Quick diagnostic message */}
                  <div className="text-xs font-mono border border-[#1a1f2e] p-3 rounded bg-indigo-950/5 border-indigo-900/10 leading-relaxed text-indigo-300">
                    Scout AI continuously monitors pipeline velocity. Deals flagged as RED are missing buying signals or have stalled and need immediate attention.
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs font-mono text-gray-500">
                  No snapshot data available. Please run analysis.
                </div>
              )}
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
