'use client';

import React, { useState, useEffect } from 'react';

interface ClientProfile {
  id: string;
  company_name: string;
  domain: string;
  snippet_key: string;
  crm_type?: string;
  active: boolean;
}

interface WebhookMapping {
  id: string;
  external_field: string;
  internal_field: string;
}

interface WebhookLog {
  id: string;
  created_at: string;
  session_id?: string;
  metadata?: {
    webhook_action?: string;
    payload?: unknown;
    transformed?: unknown;
  };
}

const INTERNAL_FIELDS = [
  { key: 'session_id', label: 'Session ID', desc: 'Identifies the Churnaut link session to update (optional)' },
  { key: 'prospect_name', label: 'Prospect Name', desc: 'Full name of the contact' },
  { key: 'prospect_email', label: 'Prospect Email', desc: 'Main email address used for contact lookups' },
  { key: 'company_name', label: 'Company Name', desc: 'Name of the prospect\'s organization' },
  { key: 'job_title', label: 'Job Title', desc: 'Professional title/role (e.g. CEO, Sales Director)' },
  { key: 'assigned_rep', label: 'Assigned Rep', desc: 'Representative name for personalized scheduling' },
  { key: 'calendar_url', label: 'Calendar URL', desc: 'Meeting link for direct calendar booking embeds' },
  { key: 'crm_deal_id', label: 'CRM Deal ID', desc: 'External identifier reference for CRM integration' },
  { key: 'deal_stage', label: 'Deal Stage', desc: 'Current pipeline stage for personalize routing rules' },
  { key: 'visitor_type', label: 'Visitor Type', desc: 'Segment tag (e.g. Enterprise, Self-Serve)' },
  { key: 'converted', label: 'Converted', desc: 'Boolean status indicating converted accounts' },
];

export default function WebhooksSettingsPage() {
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [mappings, setMappings] = useState<WebhookMapping[]>([]);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Source fields for mapping UI
  const [sourceFields, setSourceFields] = useState<string[]>([
    'email',
    'first_name',
    'last_name',
    'company',
    'title',
    'deal_id',
    'stage',
    'rep_name',
    'rep_calendar',
    'is_converted',
  ]);
  const [newSourceField, setNewSourceField] = useState('');
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Fetch client details, mappings, and logs
  const fetchData = async () => {
    try {
      setLoading(true);
      
      const clientRes = await fetch('/api/client');
      if (clientRes.ok) {
        const clientData = await clientRes.json();
        setClient(clientData.client);
      }

      const mappingsRes = await fetch('/api/webhook/mappings');
      if (mappingsRes.ok) {
        const mappingsData = await mappingsRes.json();
        setMappings(mappingsData.mappings || []);
      }

      const logsRes = await fetch('/api/webhook/logs');
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.logs || []);
      }
    } catch (err) {
      console.error('Failed to load webhook settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  // Add a new source field name manually
  const handleAddSourceField = (e: React.FormEvent) => {
    e.preventDefault();
    const val = newSourceField.trim();
    if (!val) return;
    if (!sourceFields.includes(val)) {
      setSourceFields(prev => [...prev, val]);
    }
    setNewSourceField('');
  };

  // Drag and Drop Handlers
  const handleDragStart = (fieldName: string) => {
    setDraggedField(fieldName);
  };

  const handleDragOver = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    setHoveredTarget(targetKey);
  };

  const handleDragLeave = () => {
    setHoveredTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, internalField: string) => {
    e.preventDefault();
    setHoveredTarget(null);
    const externalField = draggedField;
    if (!externalField) return;

    try {
      const res = await fetch('/api/webhook/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_field: externalField,
          internal_field: internalField,
        }),
      });

      if (res.ok) {
        // Refresh mapping list
        const mappingsRes = await fetch('/api/webhook/mappings');
        if (mappingsRes.ok) {
          const mappingsData = await mappingsRes.json();
          setMappings(mappingsData.mappings || []);
        }
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to save webhook mapping');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while saving the mapping.');
    } finally {
      setDraggedField(null);
    }
  };

  // Remove a webhook mapping
  const handleRemoveMapping = async (mappingId: string) => {
    try {
      const res = await fetch(`/api/webhook/mappings?id=${mappingId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMappings(prev => prev.filter(m => m.id !== mappingId));
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to delete mapping.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during mapping deletion.');
    }
  };

  // Helper to find mapping for an internal field
  const getMappedField = (internalFieldKey: string) => {
    return mappings.find(m => m.internal_field === internalFieldKey);
  };

  const getWebhookUrl = () => {
    if (typeof window !== 'undefined' && client) {
      return `${window.location.origin}/api/webhook?client_key=${client.snippet_key}`;
    }
    return `/api/webhook?client_key=${client?.snippet_key || '...'}`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5">
        <h1 className="text-xl font-bold tracking-wider font-mono">WEBHOOK SETTINGS</h1>
        <p className="text-xs font-mono text-gray-400 mt-1">Configure field mappings and receive incoming events from Hubspot, Salesforce, or other CRMs</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 font-mono text-sm">RETRIEVING WEBHOOK SYSTEM STATUS...</div>
      ) : (
        <>
          {/* Endpoint Details Card */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-6 space-y-4">
            <h2 className="text-xs font-mono font-bold text-[#6366f1] tracking-widest uppercase">
              YOUR UNIVERSAL WEBHOOK CREDENTIALS
            </h2>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-mono text-gray-400 uppercase">Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getWebhookUrl()}
                    className="flex-1 bg-[#080B0F] border border-[var(--border-subtle)] text-xs px-3 py-2.5 rounded text-white font-mono outline-none"
                  />
                  <button
                    onClick={() => handleCopyUrl(getWebhookUrl())}
                    className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs px-4 rounded transition-all active:scale-[0.98]"
                  >
                    {copiedUrl ? 'COPIED!' : 'COPY'}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-mono text-gray-400 uppercase">Authorization Bearer Token (Alternative)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={client?.snippet_key || ''}
                    className="flex-1 bg-[#080B0F] border border-[var(--border-subtle)] text-xs px-3 py-2.5 rounded text-white font-mono outline-none"
                  />
                  <button
                    onClick={() => handleCopyToken(client?.snippet_key || '')}
                    className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs px-4 rounded transition-all active:scale-[0.98]"
                  >
                    {copiedToken ? 'COPIED!' : 'COPY'}
                  </button>
                </div>
                <span className="block text-[9px] font-mono text-gray-500 mt-1">
                  You can authenticate by placing this token in the header as: Authorization: Bearer &lt;token&gt;
                </span>
              </div>
            </div>
          </div>

          {/* Visual Field Mapper Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left Box: External Fields List */}
            <div className="lg:col-span-2 border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 flex flex-col space-y-4">
              <div>
                <h3 className="text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">
                  External Payload Fields
                </h3>
                <p className="text-[10px] font-mono text-gray-500 mt-1">
                  Drag these blocks into the drop-zones on the right.
                </p>
              </div>

              {/* Add Custom Source Field Form */}
              <form onSubmit={handleAddSourceField} className="flex gap-2">
                <input
                  type="text"
                  value={newSourceField}
                  onChange={(e) => setNewSourceField(e.target.value)}
                  placeholder="e.g. contact.stage_name"
                  className="flex-1 bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-2.5 py-1.5 rounded text-white font-mono"
                />
                <button
                  type="submit"
                  className="border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-[#6366f1] text-[10px] font-mono py-1 px-3 rounded transition-all"
                >
                  + ADD
                </button>
              </form>

              {/* Draggable Fields list */}
              <div className="flex flex-wrap gap-2 pt-2">
                {sourceFields.map((field) => (
                  <div
                    key={field}
                    draggable
                    onDragStart={() => handleDragStart(field)}
                    className="border border-[var(--border-subtle)] bg-[#080B0F] hover:border-gray-500 text-xs font-mono py-1.5 px-3 rounded cursor-grab active:cursor-grabbing text-gray-300 flex items-center gap-2 select-none"
                  >
                    <span className="text-gray-600">::</span>
                    {field}
                  </div>
                ))}
              </div>
            </div>

            {/* Right Box: Target Drops List */}
            <div className="lg:col-span-3 border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 space-y-4">
              <div>
                <h3 className="text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">
                  Churnaut Internal Fields
                </h3>
                <p className="text-[10px] font-mono text-gray-500 mt-1">
                  Target drop-zones representing Churnaut database mappings.
                </p>
              </div>

              <div className="space-y-3">
                {INTERNAL_FIELDS.map((field) => {
                  const activeMapping = getMappedField(field.key);
                  const isHovered = hoveredTarget === field.key;

                  return (
                    <div
                      key={field.key}
                      onDragOver={(e) => handleDragOver(e, field.key)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, field.key)}
                      className={`border p-3 rounded-lg flex items-center justify-between gap-4 transition-all ${
                        isHovered
                          ? 'border-[#6366f1] bg-[#6366f1]/5'
                          : activeMapping
                          ? 'border-[var(--border-subtle)]/90 bg-[var(--border-subtle)]/10'
                          : 'border-[var(--border-subtle)] bg-[#080B0F]/30'
                      }`}
                    >
                      <div className="space-y-0.5 max-w-[60%]">
                        <span className="block text-xs font-mono font-bold text-gray-300">
                          {field.label}
                        </span>
                        <span className="block text-[9px] font-mono text-gray-500 leading-normal">
                          {field.desc}
                        </span>
                      </div>

                      {/* Dropzone status or mapped value */}
                      <div className="flex-1 flex justify-end">
                        {activeMapping ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono px-2.5 py-1 bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[#6366f1] rounded-md">
                              {activeMapping.external_field}
                            </span>
                            <button
                              onClick={() => handleRemoveMapping(activeMapping.id)}
                              className="text-red-400 hover:text-red-300 font-mono text-[10px] px-2 py-1 transition-colors"
                            >
                              [X]
                            </button>
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono text-gray-600 border border-dashed border-[var(--border-subtle)] px-4 py-2 rounded">
                            DROP EXTERNAL FIELD HERE
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Webhook Ingestion Log */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg p-5 space-y-4">
            <div>
              <h3 className="text-xs font-mono font-bold text-gray-300 uppercase tracking-wider">
                Incoming Webhook Logs
              </h3>
              <p className="text-[10px] font-mono text-gray-500 mt-1">
                Real-time diagnostic records of recently completed webhook triggers.
              </p>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-8 text-gray-600 font-mono text-xs border border-[var(--border-subtle)] rounded bg-[#080B0F]/10">
                No webhook calls logged yet.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded bg-[#080B0F]/20 overflow-hidden">
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const logAction = log.metadata?.webhook_action || 'processed';
                  const dateStr = new Date(log.created_at).toLocaleString();

                  return (
                    <div key={log.id} className="transition-colors hover:bg-[var(--border-subtle)]/10">
                      {/* Log Header Row */}
                      <div
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="p-3.5 flex items-center justify-between text-xs font-mono cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] bg-green-950/20 text-green-400 border border-green-900/40 px-2 py-0.5 rounded uppercase">
                            POST
                          </span>
                          <span className="text-gray-300 font-semibold">{logAction}</span>
                          {log.session_id && (
                            <span className="text-gray-500">
                              SID: <span className="text-[#6366f1]">{log.session_id}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-gray-400">
                          <span>{dateStr}</span>
                          <span className="text-gray-600 font-bold">{isExpanded ? '[-]' : '[+]'}</span>
                        </div>
                      </div>

                      {/* Log Details JSON */}
                      {isExpanded && (
                        <div className="p-4 bg-[#080B0F] border-t border-[var(--border-subtle)] text-xs font-mono space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Raw payload */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] text-gray-500 uppercase block">Raw Payload</span>
                              <pre className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded text-gray-400 max-h-48 overflow-y-auto text-[11px] leading-relaxed">
                                {JSON.stringify(log.metadata?.payload || {}, null, 2)}
                              </pre>
                            </div>

                            {/* Transformed format */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] text-gray-500 uppercase block">Transformed Format</span>
                              <pre className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded text-[#6366f1] max-h-48 overflow-y-auto text-[11px] leading-relaxed">
                                {JSON.stringify(log.metadata?.transformed || {}, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
