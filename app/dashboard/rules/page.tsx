'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { RoutingRule } from '@/types';
import { Sliders } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';

// Signal types list
const SIGNAL_OPTIONS = [
  'Cold Email',
  'LinkedIn Ad',
  'Google Ad',
  'TikTok Ad',
  'Meta Ad',
  'LinkedIn Lead Gen Form',
  'G2 Referral',
  'Partner Referral',
  'Returning Visitor',
  'Any',
];

// Condition types dropdown options
const CONDITION_OPTIONS = [
  'Any visitor',
  'Job title contains',
  'Company name equals',
  'Deal stage equals',
  'UTM campaign contains',
  'UTM source equals',
  'UTM content contains',
];

// Action types mapping
const ACTION_MAPPING = [
  { value: 'show_calendar', label: 'Show Rep Calendar' },
  { value: 'show_short_form', label: 'Show Demo Request Form' },
  { value: 'inject_copy', label: 'Change Page Text' },
  { value: 'show_case_study', label: 'Show Case Study' },
  { value: 'redirect', label: 'Send to Different Page' },
];

export default function RulesPage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Edit Panel Form States (loaded when selecting a rule)
  const [editSignalType, setEditSignalType] = useState('Cold Email');
  const [editConditionType, setEditConditionType] = useState('Any visitor');
  const [editConditionValue, setEditConditionValue] = useState('');
  const [editActionType, setEditActionType] = useState('show_calendar');
  const [editActionContent, setEditActionContent] = useState('');
  const [updatingRule, setUpdatingRule] = useState(false);

  // Multiple Swaps state
  const [editSwaps, setEditSwaps] = useState<{ selector: string; content: string }[]>([
    { selector: '.sr-target', content: '' }
  ]);
  const [newSwaps, setNewSwaps] = useState<{ selector: string; content: string }[]>([
    { selector: '.sr-target', content: '' }
  ]);
  const [aiSwapIndex, setAiSwapIndex] = useState<number>(0);

  const handleAddEditSwap = () => {
    setEditSwaps([...editSwaps, { selector: '.sr-target', content: '' }]);
  };

  const handleRemoveEditSwap = (index: number) => {
    if (editSwaps.length <= 1) return;
    const updated = [...editSwaps];
    updated.splice(index, 1);
    setEditSwaps(updated);
  };

  const handleEditSwapChange = (index: number, field: 'selector' | 'content', value: string) => {
    const updated = [...editSwaps];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setEditSwaps(updated);
  };

  const handleAddNewSwap = () => {
    setNewSwaps([...newSwaps, { selector: '.sr-target', content: '' }]);
  };

  const handleRemoveNewSwap = (index: number) => {
    if (newSwaps.length <= 1) return;
    const updated = [...newSwaps];
    updated.splice(index, 1);
    setNewSwaps(updated);
  };

  const handleNewSwapChange = (index: number, field: 'selector' | 'content', value: string) => {
    const updated = [...newSwaps];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setNewSwaps(updated);
  };

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
    if (conditions.utm_campaign_contains) {
      parts.push(`UTM campaign contains "${conditions.utm_campaign_contains}"`);
    }
    if (conditions.utm_source_equals) {
      parts.push(`UTM source equals "${conditions.utm_source_equals}"`);
    }
    if (conditions.utm_content_contains) {
      parts.push(`UTM content contains "${conditions.utm_content_contains}"`);
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
    if (conditions.utm_campaign_contains) {
      return { type: 'UTM campaign contains', value: conditions.utm_campaign_contains };
    }
    if (conditions.utm_source_equals) {
      return { type: 'UTM source equals', value: conditions.utm_source_equals };
    }
    if (conditions.utm_content_contains) {
      return { type: 'UTM content contains', value: conditions.utm_content_contains };
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
    if (type === 'UTM campaign contains') {
      return { utm_campaign_contains: value };
    }
    if (type === 'UTM source equals') {
      return { utm_source_equals: value };
    }
    if (type === 'UTM content contains') {
      return { utm_content_contains: value };
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
      setError(null);
      const res = await fetch('/api/rules');
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to retrieve routing rules.');
      }
    } catch (err) {
      console.error('Failed to load rules:', err);
      setError('A network error occurred while loading routing rules.');
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

      const existingSwaps = selectedRule.action_payload?.swaps;
      if (Array.isArray(existingSwaps) && existingSwaps.length > 0) {
        setEditSwaps(existingSwaps.map((s) => {
          const swapRecord = s as Record<string, unknown>;
          return {
            selector: (swapRecord.selector as string) || '',
            content: (swapRecord.content as string) || '',
          };
        }));
      } else {
        setEditSwaps([
          {
            selector: selectedRule.target_selector || '.sr-target',
            content: selectedRule.variant_content || '',
          }
        ]);
      }

      // Pre-fill AI copywriter states
      setAiSignalType(selectedRule.signal_type || 'Any');
      setAiSuggestions([]);
      setShowAiPanel(false);
      setAiSwapIndex(0);
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
      toast.success('Rules priority reordered successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to reorder rules.');
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
      toast.success(updatedStatus ? 'Rule activated successfully' : 'Rule deactivated successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to toggle rule active state.');
      fetchRules();
    }
  };

  // Create new rule submit handler
  const handleCreateRule = async (e: FormEvent) => {
    e.preventDefault();
    setSavingNewRule(true);

    try {
      const conditionsPayload = buildConditionsPayload(newConditionType, newConditionValue);
      const basePayload = buildActionPayload(newActionType, newActionContent);
      const actionPayload = {
        ...basePayload,
        swaps: newSwaps,
      };

      const firstSwap = newSwaps[0] || { selector: '.sr-target', content: '' };

      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: newSignalType === 'Any' ? null : newSignalType,
          conditions: conditionsPayload,
          action_type: newActionType,
          action_payload: actionPayload,
          target_selector: firstSwap.selector,
          variant_content: firstSwap.content,
        }),
      });

      if (res.ok) {
        setCreateModalOpen(false);
        toast.success('Routing rule created successfully');
        fetchRules();
        // Reset states
        setNewSignalType('Cold Email');
        setNewConditionType('Any visitor');
        setNewConditionValue('');
        setNewActionType('show_calendar');
        setNewActionContent('');
        setNewSwaps([{ selector: '.sr-target', content: '' }]);
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || 'Failed to save new routing rule.');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred while creating rule.');
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
      const basePayload = buildActionPayload(editActionType, editActionContent);
      const actionPayload = {
        ...basePayload,
        swaps: editSwaps,
      };

      const firstSwap = editSwaps[0] || { selector: '.sr-target', content: '' };

      const res = await fetch('/api/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedRule.id,
          signal_type: editSignalType === 'Any' ? null : editSignalType,
          conditions: conditionsPayload,
          action_type: editActionType,
          action_payload: actionPayload,
          target_selector: firstSwap.selector,
          variant_content: firstSwap.content,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedRule(updated.rule);
        toast.success('Routing rule updated successfully');
        fetchRules();
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || 'Failed to update rule.');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred while updating rule.');
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
        toast.success('AI copywriting variants generated');
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to generate copy.');
      }
    } catch (err) {
      console.error('Error generating AI variants:', err);
      toast.error('An error occurred during AI copy generation.');
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
        toast.success('Routing rule deleted successfully');
        fetchRules();
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || 'Failed to delete rule.');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred during deletion.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-wider font-mono">ROUTING RULES</h1>
          <p className="text-xs font-mono text-gray-400 mt-1">Configure personalized web variants based on inbound context</p>
        </div>
      </div>

      <div className="flex flex-row gap-6 items-start w-full min-w-0">
        {/* Left Side: Rule Cards Drag Area */}
        <div className={`${selectedRule ? 'w-[calc(60%-12px)]' : 'w-full'} space-y-4 flex-shrink-0 min-w-0 transition-all duration-200`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#6366f1] tracking-widest uppercase bg-[var(--border-subtle)]/40 py-1 px-2.5 rounded border border-[var(--border-subtle)]">
              Priority List (Drag to Reorder)
            </span>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500 font-mono text-sm">RETRIEVING RULES...</div>
          ) : error ? (
            <ErrorState message={error} onRetry={fetchRules} />
          ) : rules.length === 0 ? (
            <EmptyState
              icon={Sliders}
              title="No routing rules yet"
              description="Add your first rule to start personalizing visitor experiences"
              ctaLabel="Add Rule"
              onClick={() => setCreateModalOpen(true)}
            />
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
                    className={`border rounded-lg p-4 bg-[var(--bg-elevated)] flex items-start gap-4 transition-all cursor-pointer hover:border-gray-500 relative select-none ${
                      isSelected ? 'border-[#6366f1] bg-[var(--border-subtle)]/10' : 'border-[var(--border-subtle)]'
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
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-indigo-400 rounded">
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
                        <div className="bg-[#080B0F] border border-[var(--border-subtle)] py-1.5 px-2.5 rounded text-xs font-mono text-gray-400 h-[30px] overflow-hidden flex items-center max-w-full min-w-0">
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
                            : 'bg-[var(--border-subtle)] border-[var(--border-subtle)] text-left'
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
            <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-4">
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
                    className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
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
                      className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
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
                      className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono disabled:opacity-40"
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
                      className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
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
                      className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                    />
                  </div>
                </div>

                {/* Dynamic Swaps List */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2">
                    <div className="flex justify-between items-center">
                      <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider font-bold">
                        Page Element Swaps
                      </label>
                      <span className="text-[10px] text-[#6366f1] font-mono cursor-help bg-[var(--border-subtle)] px-1.5 rounded relative group">
                        [?]
                        <span className="pointer-events-none absolute right-0 bottom-full mb-2 w-64 bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 text-[10px] leading-relaxed text-gray-300 font-mono rounded shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          {"Specify CSS selectors (e.g. '#headline' or '.cta-button') and the variant HTML/Text content to inject."}
                        </span>
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-gray-500">
                      Add multiple page elements to swap. Each rule can personalize multiple parts of the page simultaneously.
                    </p>
                  </div>

                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {editSwaps.map((swap, index) => (
                      <div key={index} className="space-y-2.5 p-3 border border-[var(--border-subtle)] bg-[#080B0F]/50 rounded-lg relative">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold">Swap #{index + 1}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setAiSwapIndex(index);
                                setAiSignalType(editSignalType);
                                setAiSuggestions([]);
                                setShowAiPanel(true);
                              }}
                              className="text-[9px] font-mono text-[#6366f1] hover:underline bg-[var(--border-subtle)]/60 px-2 py-0.5 rounded border border-[var(--border-subtle)] flex items-center gap-1 transition-colors"
                            >
                              ✨ AI Copy
                            </button>
                            {editSwaps.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveEditSwap(index)}
                                className="text-[9px] font-mono text-red-400 hover:text-red-300 hover:underline bg-red-950/20 px-2 py-0.5 rounded border border-red-900 transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="space-y-1">
                            <label className="block text-[9px] font-mono text-gray-500 uppercase tracking-wider">Target CSS Selector</label>
                            <input
                              type="text"
                              required
                              value={swap.selector}
                              onChange={(e) => handleEditSwapChange(index, 'selector', e.target.value)}
                              placeholder="e.g. #headline or .sr-target"
                              className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-2.5 py-1.5 rounded text-white font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[9px] font-mono text-gray-500 uppercase tracking-wider">Variant Content</label>
                            <textarea
                              rows={3}
                              value={swap.content}
                              onChange={(e) => handleEditSwapChange(index, 'content', e.target.value)}
                              placeholder="Use {{prospect_name}}, {{company_name}}, {{rep_name}}, {{job_title}}, {{deal_stage}} as dynamic variables."
                              className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-2.5 py-1.5 rounded text-white font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddEditSwap}
                    className="w-full border border-dashed border-[var(--border-subtle)] hover:border-[#6366f1] text-[#6366f1] hover:text-[#5053e1] font-mono text-[10px] py-2 rounded transition-colors"
                  >
                    + ADD ELEMENT SWAP
                  </button>

                  <p className="text-[9px] font-mono text-gray-500 mt-1">
                    Use {"{{prospect_name}}"}, {"{{company_name}}"}, {"{{rep_name}}"}, {"{{job_title}}"}, {"{{deal_stage}}"} as dynamic variables — they will be replaced with real prospect data automatically.
                  </p>

                  {/* Inline AI Copywriter Panel */}
                  {showAiPanel && (
                    <div className="mt-3 p-4 bg-[#080B0F] border border-[var(--border-subtle)] rounded-lg space-y-3 font-mono text-xs">
                      <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2">
                        <span className="text-[10px] text-[#6366f1] font-bold uppercase tracking-wider">
                          AI Copywriter (generating for Swap #{aiSwapIndex + 1})
                        </span>
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
                            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none px-2 py-1.5 rounded text-white text-[11px]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[9px] text-gray-400 uppercase">Job Title</label>
                          <input
                            type="text"
                            value={aiJobTitle}
                            onChange={(e) => setAiJobTitle(e.target.value)}
                            placeholder="e.g. VP of Marketing"
                            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none px-2 py-1.5 rounded text-white text-[11px]"
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
                            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none px-2 py-1.5 rounded text-white text-[11px]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[9px] text-gray-400 uppercase">Size</label>
                          <select
                            value={aiCompanySize}
                            onChange={(e) => setAiCompanySize(e.target.value)}
                            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none px-1.5 py-1.5 rounded text-white text-[11px]"
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
                            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none px-1.5 py-1.5 rounded text-white text-[11px]"
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
                        <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                          <label className="block text-[9px] text-gray-400 uppercase tracking-widest font-bold">Select a Variant (Click to use):</label>
                          <div className="space-y-1.5">
                            {aiSuggestions.map((suggestion, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  handleEditSwapChange(aiSwapIndex, 'content', suggestion);
                                  setShowAiPanel(false);
                                }}
                                className="w-full text-left bg-[var(--bg-surface)] hover:bg-[var(--border-subtle)]/40 border border-[var(--border-subtle)] hover:border-[#6366f1] p-2 rounded text-[11px] text-gray-300 hover:text-white transition-colors"
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
          <div className="w-full max-w-xl bg-[#080B0F] border border-[var(--border-subtle)] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-subtle)]">
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
                  className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
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
                    className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
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
                    className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono disabled:opacity-40"
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
                    className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
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
                    className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                  />
                </div>
              </div>

              {/* Dynamic Swaps List */}
              <div className="space-y-4">
                <div className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider font-bold">
                      Page Element Swaps
                    </label>
                    <span className="text-[10px] text-[#6366f1] font-mono cursor-help bg-[var(--border-subtle)] px-1.5 rounded relative group">
                      [?]
                      <span className="pointer-events-none absolute right-0 bottom-full mb-2 w-64 bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 text-[10px] leading-relaxed text-gray-300 font-mono rounded shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity z-10 font-normal">
                        {"Specify CSS selectors (e.g. '#headline' or '.cta-button') and the variant HTML/Text content to inject."}
                      </span>
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-gray-500">
                    Add multiple page elements to swap. Each rule can personalize multiple parts of the page simultaneously.
                  </p>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {newSwaps.map((swap, index) => (
                    <div key={index} className="space-y-2.5 p-3 border border-[var(--border-subtle)] bg-[#080B0F]/50 rounded-lg relative">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold">Swap #{index + 1}</span>
                        {newSwaps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveNewSwap(index)}
                            className="text-[9px] font-mono text-red-400 hover:text-red-300 hover:underline bg-red-950/20 px-2 py-0.5 rounded border border-red-900 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="block text-[9px] font-mono text-gray-500 uppercase tracking-wider">Target CSS Selector</label>
                          <input
                            type="text"
                            required
                            value={swap.selector}
                            onChange={(e) => handleNewSwapChange(index, 'selector', e.target.value)}
                            placeholder="e.g. #headline or .sr-target"
                            className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-2.5 py-1.5 rounded text-white font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[9px] font-mono text-gray-500 uppercase tracking-wider">Variant Content</label>
                          <textarea
                            rows={3}
                            value={swap.content}
                            onChange={(e) => handleNewSwapChange(index, 'content', e.target.value)}
                            placeholder="Use {{prospect_name}}, {{company_name}}, {{rep_name}}, {{job_title}}, {{deal_stage}} as dynamic variables."
                            className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-2.5 py-1.5 rounded text-white font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleAddNewSwap}
                  className="w-full border border-dashed border-[var(--border-subtle)] hover:border-[#6366f1] text-[#6366f1] hover:text-[#5053e1] font-mono text-[10px] py-2 rounded transition-colors"
                >
                  + ADD ELEMENT SWAP
                </button>

                <p className="text-[9px] font-mono text-gray-500 mt-1">
                  Use {"{{prospect_name}}"}, {"{{company_name}}"}, {"{{rep_name}}"}, {"{{job_title}}"}, {"{{deal_stage}}"} as dynamic variables — they will be replaced with real prospect data automatically.
                </p>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="border border-[var(--border-subtle)] hover:border-gray-500 text-xs font-mono py-2 px-4 rounded text-gray-300 transition-all"
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
