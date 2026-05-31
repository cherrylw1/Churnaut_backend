'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { RoutingRule } from '@/types';

// Signal types list
const SIGNAL_OPTIONS = [
  'Cold Email',
  'LinkedIn Ad',
  'Google Ad',
  'QR Code',
  'G2 Referral',
  'Webinar Follow-up',
  'Partner Referral',
  'Conference QR Code',
  'Returning Visitor',
  'Other',
  'Any',
];

// Condition types dropdown options
const CONDITION_OPTIONS = [
  'Any visitor',
  'Job title contains',
  'Company name equals',
  'Deal stage equals',
  'Visitor type equals',
];

// Action types mapping
const ACTION_MAPPING = [
  { value: 'show_calendar', label: 'Show Calendar Embed' },
  { value: 'show_long_form', label: 'Show Long Form' },
  { value: 'show_short_form', label: 'Show Short Form' },
  { value: 'inject_copy', label: 'Inject Headline Copy' },
  { value: 'show_case_study', label: 'Show Case Study URL' },
  { value: 'redirect', label: 'Redirect to URL' },
  { value: 'show_phone', label: 'Show Phone Number' },
];

export default function RulesPage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRule, setSelectedRule] = useState<RoutingRule | null>(null);
  
  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [savingNewRule, setSavingNewRule] = useState(false);

  // New Rule Form States
  const [newSignalType, setNewSignalType] = useState('Cold Email');
  const [newConditionType, setNewConditionType] = useState('Any visitor');
  const [newConditionValue, setNewConditionValue] = useState('');
  const [newActionType, setNewActionType] = useState('show_calendar');
  const [newActionContent, setNewActionContent] = useState('');
  const [newTargetSelector, setNewTargetSelector] = useState('.sr-target');
  const [newVariantContent, setNewVariantContent] = useState('');

  // Edit Panel Form States (loaded when selecting a rule)
  const [editSignalType, setEditSignalType] = useState('Cold Email');
  const [editConditionType, setEditConditionType] = useState('Any visitor');
  const [editConditionValue, setEditConditionValue] = useState('');
  const [editActionType, setEditActionType] = useState('show_calendar');
  const [editActionContent, setEditActionContent] = useState('');
  const [editTargetSelector, setEditTargetSelector] = useState('.sr-target');
  const [editVariantContent, setEditVariantContent] = useState('');
  const [updatingRule, setUpdatingRule] = useState(false);

  // AI Copywriter states
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiSignalType, setAiSignalType] = useState('Cold Email');
  const [aiJobTitle, setAiJobTitle] = useState('');
  const [aiIndustry, setAiIndustry] = useState('');
  const [aiCompanySize, setAiCompanySize] = useState('200-500');
  const [aiTone, setAiTone] = useState('direct');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  // Drag and drop local state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Helper: Get human-readable action label
  const getActionLabel = (actionType: string) => {
    const matched = ACTION_MAPPING.find((a) => a.value === actionType);
    return matched ? matched.label : actionType;
  };

  // Helper: Display conditions in plain English
  const getConditionsText = (conditions: Record<string, string>) => {
    if (!conditions || Object.keys(conditions).length === 0) {
      return 'Any visitor';
    }
    const parts: string[] = [];
    if (conditions.job_title_contains) {
      parts.push(`Job title contains "${conditions.job_title_contains}"`);
    }
    if (conditions.company_name_equals) {
      parts.push(`Company name equals "${conditions.company_name_equals}"`);
    }
    if (conditions.deal_stage_equals) {
      parts.push(`Deal stage equals "${conditions.deal_stage_equals}"`);
    }
    if (conditions.visitor_type_equals) {
      parts.push(`Visitor type equals "${conditions.visitor_type_equals}"`);
    }
    return parts.length > 0 ? parts.join(' AND ') : 'Any visitor';
  };

  // Helper: Parse conditions out to standard Form values
  const parseConditions = (conditions: Record<string, string>) => {
    if (!conditions || Object.keys(conditions).length === 0) {
      return { type: 'Any visitor', value: '' };
    }
    if (conditions.job_title_contains) {
      return { type: 'Job title contains', value: conditions.job_title_contains };
    }
    if (conditions.company_name_equals) {
      return { type: 'Company name equals', value: conditions.company_name_equals };
    }
    if (conditions.deal_stage_equals) {
      return { type: 'Deal stage equals', value: conditions.deal_stage_equals };
    }
    if (conditions.visitor_type_equals) {
      return { type: 'Visitor type equals', value: conditions.visitor_type_equals };
    }
    return { type: 'Any visitor', value: '' };
  };

  // Helper: Map condition dropdown state back to PostgreSQL conditions object
  const buildConditionsPayload = (type: string, value: string) => {
    if (type === 'Job title contains') {
      return { job_title_contains: value };
    }
    if (type === 'Company name equals') {
      return { company_name_equals: value };
    }
    if (type === 'Deal stage equals') {
      return { deal_stage_equals: value };
    }
    if (type === 'Visitor type equals') {
      return { visitor_type_equals: value };
    }
    return {};
  };

  // Helper: Extract action payload content
  const extractActionContent = (rule: RoutingRule) => {
    if (!rule.action_payload) return '';
    return (
      rule.action_payload.content ||
      rule.action_payload.calendar_url ||
      rule.action_payload.variant_content ||
      rule.action_payload.url ||
      rule.action_payload.value ||
      ''
    );
  };

  // Helper: Build Action Payload object
  const buildActionPayload = (type: string, content: string) => {
    const payload: Record<string, unknown> = { content };
    if (type === 'show_calendar') {
      payload.calendar_url = content;
    } else if (type === 'inject_copy') {
      payload.variant_content = content;
    } else if (type === 'redirect') {
      payload.url = content;
    } else {
      payload.value = content;
    }
    return payload;
  };

  // Fetch Rules from DB
  const fetchRules = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/rules');
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  // Fetch rules whenever selectedRule changes (e.g. to load edit panel fields)
  useEffect(() => {
    if (selectedRule) {
      setEditSignalType(selectedRule.signal_type || 'Any');
      const { type, value } = parseConditions(selectedRule.conditions);
      setEditConditionType(type);
      setEditConditionValue(value);
      setEditActionType(selectedRule.action_type || 'show_calendar');
      setEditActionContent(extractActionContent(selectedRule));
      setEditTargetSelector(selectedRule.target_selector || '.sr-target');
      setEditVariantContent(selectedRule.variant_content || '');

      // Pre-fill AI copywriter states
      setAiSignalType(selectedRule.signal_type || 'Any');
      setAiSuggestions([]);
      setShowAiPanel(false);
    }
  }, [selectedRule]);

  // Handle Drag Start
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle Drag Over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Handle Drop
  const handleDrop = async (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const list = [...rules];
    const draggedItem = list[draggedIndex];
    list.splice(draggedIndex, 1);
    list.splice(index, 0, draggedItem);

    // Refresh priority sequences
    const reordered = list.map((rule, i) => ({
      ...rule,
      priority: i + 1,
    }));

    setRules(reordered);
    setDraggedIndex(null);

    // Save priorities to API database
    try {
      const res = await fetch('/api/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: reordered.map((r) => ({ id: r.id, priority: r.priority })),
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to update priorities');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to reorder rules.');
      fetchRules();
    }
  };

  // Toggle active/inactive status immediately
  const handleToggleActive = async (rule: RoutingRule) => {
    const updatedStatus = !rule.active;

    // Optimistic state update
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: updatedStatus } : r));
    if (selectedRule?.id === rule.id) {
      setSelectedRule(prev => prev ? { ...prev, active: updatedStatus } : null);
    }

    try {
      const res = await fetch('/api/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rule.id,
          active: updatedStatus,
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to toggle status');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to toggle rule active state.');
      fetchRules();
    }
  };

  // Create new rule submit handler
  const handleCreateRule = async (e: FormEvent) => {
    e.preventDefault();
    setSavingNewRule(true);

    try {
      const conditionsPayload = buildConditionsPayload(newConditionType, newConditionValue);
      const payload = buildActionPayload(newActionType, newActionContent);

      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: newSignalType === 'Any' ? null : newSignalType,
          conditions: conditionsPayload,
          action_type: newActionType,
          action_payload: payload,
          target_selector: newTargetSelector,
          variant_content: newVariantContent,
        }),
      });

      if (res.ok) {
        setCreateModalOpen(false);
        fetchRules();
        // Reset states
        setNewSignalType('Cold Email');
        setNewConditionType('Any visitor');
        setNewConditionValue('');
        setNewActionType('show_calendar');
        setNewActionContent('');
        setNewTargetSelector('.sr-target');
        setNewVariantContent('');
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to save new routing rule.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while creating rule.');
    } finally {
      setSavingNewRule(false);
    }
  };

  // Update existing rule submit handler
  const handleUpdateRule = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRule) return;

    setUpdatingRule(true);

    try {
      const conditionsPayload = buildConditionsPayload(editConditionType, editConditionValue);
      const payload = buildActionPayload(editActionType, editActionContent);

      const res = await fetch('/api/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRule.id,
          signal_type: editSignalType === 'Any' ? null : editSignalType,
          conditions: conditionsPayload,
          action_type: editActionType,
          action_payload: payload,
          target_selector: editTargetSelector,
          variant_content: editVariantContent,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedRule(updated.rule);
        fetchRules();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to update rule.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while updating rule.');
    } finally {
      setUpdatingRule(false);
    }
  };

  // Generate copy using AI Copywriter API
  const handleGenerateCopy = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const res = await fetch('/api/ai/copywriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: aiSignalType,
          job_title: aiJobTitle,
          industry: aiIndustry,
          company_size: aiCompanySize,
          desired_tone: aiTone,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiSuggestions(data.variants || []);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to generate copy.');
      }
    } catch (err) {
      console.error('Error generating AI variants:', err);
      alert('An error occurred during AI copy generation.');
    } finally {
      setAiLoading(false);
    }
  };

  // Delete rule handler
  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this routing rule?')) return;

    try {
      const res = await fetch(`/api/rules?id=${ruleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSelectedRule(null);
        fetchRules();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to delete rule.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during deletion.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center border-b border-[#1a1f2e] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-wider font-mono">ROUTING RULES</h1>
          <p className="text-xs font-mono text-gray-400 mt-1">Configure personalized web variants based on inbound context</p>
        </div>
      </div>

      <div className="flex flex-row gap-6 items-start w-full min-w-0">
        {/* Left Side: Rule Cards Drag Area */}
        <div className={`${selectedRule ? 'w-[calc(60%-12px)]' : 'w-full'} space-y-4 flex-shrink-0 min-w-0 transition-all duration-200`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#6366f1] tracking-widest uppercase bg-[#1a1f2e]/40 py-1 px-2.5 rounded border border-[#1a1f2e]">
              Priority List (Drag to Reorder)
            </span>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500 font-mono text-sm">RETRIEVING RULES...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-16 border border-[#1a1f2e] rounded-lg bg-[#0d1117]/30">
              <p className="text-sm font-mono text-gray-400">No active rules configured.</p>
              <p className="text-xs font-mono text-gray-500 mt-1">Personalized swaps rely on rules to trigger.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule, index) => {
                const isSelected = selectedRule?.id === rule.id;
                const conditionsText = getConditionsText(rule.conditions);

                return (
                  <div
                    key={rule.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={() => setDraggedIndex(null)}
                    onClick={() => setSelectedRule(rule)}
                    className={`border rounded-lg p-4 bg-[#0d1117]/40 flex items-start gap-4 transition-all cursor-pointer hover:border-gray-500 relative select-none ${
                      isSelected ? 'border-[#6366f1] bg-[#1a1f2e]/10' : 'border-[#1a1f2e]'
                    } ${!rule.active ? 'opacity-65' : ''}`}
                  >
                    {/* Drag Handle Indicator */}
                    <div className="flex flex-col justify-center items-center h-full text-gray-500 hover:text-white cursor-move pt-1">
                      <span className="text-sm tracking-widest font-mono">::</span>
                    </div>

                    {/* Content Section */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-gray-400">
                          #{rule.priority}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-[#1a1f2e] border border-[#1a1f2e] text-indigo-400 rounded">
                          {rule.signal_type || 'Any Signal'}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-green-950/20 border border-green-900/40 text-green-400 rounded">
                          {getActionLabel(rule.action_type)}
                        </span>
                      </div>

                      {/* Conditions */}
                      <p className="text-xs font-mono text-gray-300">
                        <span className="text-gray-500">IF:</span> {conditionsText}
                      </p>

                      {/* Variant Preview */}
                      {rule.variant_content && (
                        <div className="bg-[#080B0F] border border-[#1a1f2e] py-1.5 px-2.5 rounded text-xs font-mono text-gray-400 h-[30px] overflow-hidden flex items-center max-w-full min-w-0">
                          <div className="truncate w-full min-w-0">
                            {rule.variant_content}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Active/Inactive Switch */}
                    <div 
                      onClick={(e) => e.stopPropagation()} 
                      className="flex items-center h-full self-center"
                    >
                      <button
                        onClick={() => handleToggleActive(rule)}
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors focus:outline-none border ${
                          rule.active
                            ? 'bg-[#6366f1] border-[#6366f1] text-right'
                            : 'bg-[#1a1f2e] border-[#1a1f2e] text-left'
                        }`}
                      >
                        <span
                          className={`inline-block w-3.5 h-3.5 rounded-full bg-white transition-transform transform ${
                            rule.active ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Rule Button Trigger */}
          <div className="pt-2">
            <button
              onClick={() => setCreateModalOpen(true)}
              className="w-full bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-3 px-4 rounded transition-all active:scale-[0.99]"
            >
              + ADD ROUTING RULE
            </button>
          </div>
        </div>

        {/* Right Side: Edit Panel */}
        {selectedRule && (
          <div className="w-[calc(40%-12px)] flex-shrink-0 min-w-0">
            <div className="border border-[#1a1f2e] bg-[#0d1117]/20 rounded-lg p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-[#1a1f2e] pb-4">
                <h2 className="text-sm font-bold tracking-wider font-mono text-[#6366f1] uppercase">
                  Edit Rule #{selectedRule.priority}
                </h2>
                <button
                  onClick={() => setSelectedRule(null)}
                  className="text-gray-400 hover:text-white transition-colors text-xs font-mono"
                >
                  [CLOSE]
                </button>
              </div>

              <form onSubmit={handleUpdateRule} className="space-y-4">
                {/* Signal Type */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                    Signal Type
                  </label>
                  <select
                    value={editSignalType}
                    onChange={(e) => setEditSignalType(e.target.value)}
                    className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
                  >
                    {SIGNAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-[#080B0F]">
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Conditions Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                      Condition Type
                    </label>
                    <select
                      value={editConditionType}
                      onChange={(e) => setEditConditionType(e.target.value)}
                      className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
                    >
                      {CONDITION_OPTIONS.map((opt) => (
                        <option key={opt} value={opt} className="bg-[#080B0F]">
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                      Condition Value
                    </label>
                    <input
                      type="text"
                      disabled={editConditionType === 'Any visitor'}
                      value={editConditionValue}
                      onChange={(e) => setEditConditionValue(e.target.value)}
                      placeholder="e.g. CEO, Enterprise"
                      className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono disabled:opacity-40"
                    />
                  </div>
                </div>

                {/* Actions Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                      Action Type
                    </label>
                    <select
                      value={editActionType}
                      onChange={(e) => setEditActionType(e.target.value)}
                      className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
                    >
                      {ACTION_MAPPING.map((act) => (
                        <option key={act.value} value={act.value} className="bg-[#080B0F]">
                          {act.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                      Action Content URL/Val
                    </label>
                    <input
                      type="text"
                      value={editActionContent}
                      onChange={(e) => setEditActionContent(e.target.value)}
                      placeholder="e.g. https://calendly.com/x"
                      className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                    />
                  </div>
                </div>

                {/* Target Selector with Tooltip Info */}
                <div className="space-y-1.5 relative group">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                      Target CSS Selector
                    </label>
                    <span className="text-[10px] text-[#6366f1] font-mono cursor-help bg-[#1a1f2e] px-1.5 rounded">
                      [?]
                      {/* Tooltip Overlay */}
                      <span className="pointer-events-none absolute right-0 bottom-full mb-2 w-64 bg-[#0d1117] border border-[#1a1f2e] p-3 text-[10px] leading-relaxed text-gray-300 font-mono rounded shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        {"The CSS selector of the DOM element on your page where the swap should occur (e.g. '.sr-target' or '#headline')."}
                      </span>
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    value={editTargetSelector}
                    onChange={(e) => setEditTargetSelector(e.target.value)}
                    placeholder=".sr-target"
                    className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                  />
                </div>

                {/* Variant Content Copy Swaps */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                      Variant Content (HTML / Text Swap)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAiPanel(!showAiPanel)}
                      className="text-[10px] font-mono text-[#6366f1] hover:underline bg-[#1a1f2e]/60 px-2 py-0.5 rounded border border-[#1a1f2e] flex items-center gap-1 transition-colors"
                    >
                      ✨ AI Copywriter
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={editVariantContent}
                    onChange={(e) => setEditVariantContent(e.target.value)}
                    placeholder="Wrote personalized markup or templates. Supports {{ prospect_name }}, {{ company_name }} tokens."
                    className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                  />

                  {/* Inline AI Copywriter Panel */}
                  {showAiPanel && (
                    <div className="mt-3 p-4 bg-[#080B0F] border border-[#1a1f2e] rounded-lg space-y-3 font-mono text-xs">
                      <div className="flex justify-between items-center border-b border-[#1a1f2e] pb-2">
                        <span className="text-[10px] text-[#6366f1] font-bold uppercase tracking-wider">AI Copywriter</span>
                        <button
                          type="button"
                          onClick={() => setShowAiPanel(false)}
                          className="text-gray-400 hover:text-white"
                        >
                          [x]
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="block text-[9px] text-gray-400 uppercase">Signal Type</label>
                          <input
                            type="text"
                            value={aiSignalType}
                            onChange={(e) => setAiSignalType(e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#1a1f2e] focus:border-[#6366f1] outline-none px-2 py-1.5 rounded text-white text-[11px]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[9px] text-gray-400 uppercase">Job Title</label>
                          <input
                            type="text"
                            value={aiJobTitle}
                            onChange={(e) => setAiJobTitle(e.target.value)}
                            placeholder="e.g. VP of Marketing"
                            className="w-full bg-[#0d1117] border border-[#1a1f2e] focus:border-[#6366f1] outline-none px-2 py-1.5 rounded text-white text-[11px]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="block text-[9px] text-gray-400 uppercase">Industry</label>
                          <input
                            type="text"
                            value={aiIndustry}
                            onChange={(e) => setAiIndustry(e.target.value)}
                            placeholder="e.g. SaaS"
                            className="w-full bg-[#0d1117] border border-[#1a1f2e] focus:border-[#6366f1] outline-none px-2 py-1.5 rounded text-white text-[11px]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[9px] text-gray-400 uppercase">Size</label>
                          <select
                            value={aiCompanySize}
                            onChange={(e) => setAiCompanySize(e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#1a1f2e] focus:border-[#6366f1] outline-none px-1.5 py-1.5 rounded text-white text-[11px]"
                          >
                            <option value="1-50">1-50</option>
                            <option value="50-200">50-200</option>
                            <option value="200-500">200-500</option>
                            <option value="500-2000">500-2000</option>
                            <option value="2000+">2000+</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[9px] text-gray-400 uppercase">Tone</label>
                          <select
                            value={aiTone}
                            onChange={(e) => setAiTone(e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#1a1f2e] focus:border-[#6366f1] outline-none px-1.5 py-1.5 rounded text-white text-[11px]"
                          >
                            <option value="direct">direct</option>
                            <option value="warm">warm</option>
                            <option value="urgent">urgent</option>
                            <option value="consultative">consultative</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          disabled={aiLoading}
                          onClick={handleGenerateCopy}
                          className="w-full bg-[#6366f1] hover:bg-[#5053e1] disabled:opacity-50 text-white py-2 px-3 rounded text-[10px] font-bold tracking-wider"
                        >
                          {aiLoading ? 'GENERATING CTAs...' : 'GENERATE OPTIONS'}
                        </button>
                      </div>

                      {aiSuggestions.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-[#1a1f2e]">
                          <label className="block text-[9px] text-gray-400 uppercase tracking-widest font-bold">Select a Variant (Click to use):</label>
                          <div className="space-y-1.5">
                            {aiSuggestions.map((suggestion, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setEditVariantContent(suggestion);
                                  setShowAiPanel(false);
                                }}
                                className="w-full text-left bg-[#0d1117] hover:bg-[#1a1f2e]/40 border border-[#1a1f2e] hover:border-[#6366f1] p-2 rounded text-[11px] text-gray-300 hover:text-white transition-colors"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-4 flex justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(selectedRule.id)}
                    className="border border-red-900 hover:bg-red-950/20 text-red-400 font-mono text-xs py-2 px-4 rounded transition-all"
                  >
                    DELETE
                  </button>
                  <button
                    type="submit"
                    disabled={updatingRule}
                    className="flex-1 bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2 px-4 rounded transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {updatingRule ? 'SAVING...' : 'SAVE CHANGES'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* CREATE RULE MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xl bg-[#080B0F] border border-[#1a1f2e] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-[#1a1f2e]">
              <h2 className="text-sm font-bold tracking-widest font-mono text-[#6366f1] uppercase">
                Add New Routing Rule
              </h2>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors text-sm font-mono"
              >
                [ESC]
              </button>
            </div>

            {/* Modal Content Form */}
            <form onSubmit={handleCreateRule} className="p-6 space-y-4 overflow-y-auto">
              {/* Signal Type */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                  Signal Type
                </label>
                <select
                  value={newSignalType}
                  onChange={(e) => setNewSignalType(e.target.value)}
                  className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
                >
                  {SIGNAL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} className="bg-[#080B0F]">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conditions Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                    Condition Type
                  </label>
                  <select
                    value={newConditionType}
                    onChange={(e) => setNewConditionType(e.target.value)}
                    className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
                  >
                    {CONDITION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-[#080B0F]">
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                    Condition Value
                  </label>
                  <input
                    type="text"
                    disabled={newConditionType === 'Any visitor'}
                    value={newConditionValue}
                    onChange={(e) => setNewConditionValue(e.target.value)}
                    placeholder="e.g. Executive, Tech"
                    className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Actions Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                    Action Type
                  </label>
                  <select
                    value={newActionType}
                    onChange={(e) => setNewActionType(e.target.value)}
                    className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
                  >
                    {ACTION_MAPPING.map((act) => (
                      <option key={act.value} value={act.value} className="bg-[#080B0F]">
                        {act.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                    Action Content URL/Val
                  </label>
                  <input
                    type="text"
                    value={newActionContent}
                    onChange={(e) => setNewActionContent(e.target.value)}
                    placeholder="e.g. https://calendly.com/x"
                    className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                  />
                </div>
              </div>

              {/* Target Selector with Tooltip info */}
              <div className="space-y-1.5 relative group">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                    Target CSS Selector
                  </label>
                  <span className="text-[10px] text-[#6366f1] font-mono cursor-help bg-[#1a1f2e] px-1.5 rounded">
                    [?]
                    <span className="pointer-events-none absolute right-0 bottom-full mb-2 w-64 bg-[#0d1117] border border-[#1a1f2e] p-3 text-[10px] leading-relaxed text-gray-300 font-mono rounded shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      {"The CSS selector of the DOM element on your page where the swap should occur (e.g. '.sr-target' or '#headline')."}
                    </span>
                  </span>
                </div>
                <input
                  type="text"
                  required
                  value={newTargetSelector}
                  onChange={(e) => setNewTargetSelector(e.target.value)}
                  placeholder=".sr-target"
                  className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                />
              </div>

              {/* Variant Content Copy Swaps */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                  Variant Content (HTML / Text Swap)
                </label>
                <textarea
                  rows={4}
                  value={newVariantContent}
                  onChange={(e) => setNewVariantContent(e.target.value)}
                  placeholder="Personalized copy swap template. Supports {{ prospect_name }}, {{ company_name }} tokens."
                  className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="border border-[#1a1f2e] hover:border-gray-500 text-xs font-mono py-2 px-4 rounded text-gray-300 transition-all"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={savingNewRule}
                  className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2 px-6 rounded transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {savingNewRule ? 'CREATING...' : 'CREATE RULE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
