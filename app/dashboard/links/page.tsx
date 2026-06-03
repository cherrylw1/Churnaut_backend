'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { Session } from '@/types';
import { Link2 } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';

// Signal type options as requested
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

export default function LinksPage() {
  const [links, setLinks] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // Form states for single link generation
  const [prospectName, setProspectName] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [signalType, setSignalType] = useState('Cold Email');
  const [assignedRep, setAssignedRep] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('30');

  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Bulk upload states
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkResults, setBulkResults] = useState<Record<string, string>[] | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Fetch all sessions/links for the client
  const fetchLinks = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/links');
      if (res.ok) {
        const data = await res.json();
        setLinks(data.sessions || []);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to retrieve tracked links.');
      }
    } catch (err) {
      console.error('Failed to fetch tracked links:', err);
      setError('A network error occurred while loading tracked links.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('Link copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Submit single link form
  const handleSingleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!destinationUrl) return;

    setGenerating(true);
    setGeneratedUrl(null);

    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_name: prospectName,
          prospect_email: prospectEmail,
          company_name: companyName,
          job_title: jobTitle,
          signal_type: signalType,
          assigned_rep: assignedRep,
          destination_url: destinationUrl,
          expires_in_days: expiresInDays ? parseInt(expiresInDays, 10) : null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedUrl(data.trackedUrl);
        toast.success('Tracked link generated successfully');
        fetchLinks(); // Refresh table
        // Reset form
        setProspectName('');
        setProspectEmail('');
        setCompanyName('');
        setJobTitle('');
        setAssignedRep('');
        setDestinationUrl('');
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to generate tracked link');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred during link generation.');
    } finally {
      setGenerating(false);
    }
  };

  // CSV parsing logic helper
  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return [];
    
    // Split headers and clean quotes
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Split line values respecting quotes
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
      const values = matches.map(v => v.trim().replace(/^["']|["']$/g, ''));

      const obj: Record<string, string> = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      rows.push(obj);
    }
    return rows;
  };

  // Process bulk CSV upload
  const handleBulkUpload = async () => {
    if (!csvFile) return;

    setBulkProcessing(true);
    setBulkError(null);
    setBulkResults(null);

    try {
      const text = await csvFile.text();
      const parsedRows = parseCSV(text);

      if (parsedRows.length === 0) {
        setBulkError('The uploaded CSV file appears to be empty or formatted incorrectly.');
        setBulkProcessing(false);
        return;
      }

      // Check required headers
      const required = ['prospect_name', 'prospect_email', 'company_name', 'job_title', 'signal_type', 'assigned_rep', 'destination_url'];
      const headers = Object.keys(parsedRows[0]);
      const missing = required.filter(field => !headers.includes(field));

      if (missing.length > 0) {
        setBulkError(`Missing required columns in CSV: ${missing.join(', ')}`);
        setBulkProcessing(false);
        return;
      }

      const results = [];
      for (const row of parsedRows) {
        if (!row.destination_url) continue;

        try {
          const res = await fetch('/api/links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prospect_name: row.prospect_name,
              prospect_email: row.prospect_email,
              company_name: row.company_name,
              job_title: row.job_title,
              signal_type: row.signal_type || 'Other',
              assigned_rep: row.assigned_rep,
              destination_url: row.destination_url,
              expires_in_days: 30, // default expiry
            }),
          });

          if (res.ok) {
            const data = await res.json();
            results.push({
              ...row,
              tracked_url: data.trackedUrl,
              session_id: data.sessionId,
              status: 'Success',
            });
          } else {
            const data = await res.json();
            results.push({
              ...row,
              tracked_url: '',
              session_id: '',
              status: `Error: ${data.error || 'Server error'}`,
            });
          }
        } catch {
          results.push({
            ...row,
            tracked_url: '',
            session_id: '',
            status: 'Network Error',
          });
        }
      }

      setBulkResults(results);
      fetchLinks(); // Refresh link list
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'An error occurred during file parsing.';
      setBulkError(errMsg);
    } finally {
      setBulkProcessing(false);
    }
  };

  // Download results as a new CSV
  const downloadBulkResults = () => {
    if (!bulkResults) return;

    const headers = [
      'prospect_name',
      'prospect_email',
      'company_name',
      'job_title',
      'signal_type',
      'assigned_rep',
      'destination_url',
      'tracked_url',
      'session_id',
      'status',
    ];

    const csvContent = [
      headers.join(','),
      ...bulkResults.map(row =>
        headers
          .map(header => `"${(row[header] || '').toString().replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'churnaut_tracked_links.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatus = (expiresAt: string | undefined) => {
    if (!expiresAt) return 'Permanent';
    const isExpired = new Date(expiresAt).getTime() < Date.now();
    return isExpired ? 'Expired' : 'Active';
  };

  const buildBaseTrackedUrl = (sid: string) => {
    if (typeof window !== 'undefined') {
      // Formats URL to fit the window host name
      return `${window.location.origin}/?sid=${sid}`;
    }
    return `/?sid=${sid}`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-wider font-mono">TRACKED LINKS</h1>
          <p className="text-xs font-mono text-gray-400 mt-1">Generate personalized redirect URLs for outbound links</p>
        </div>
        <button
          onClick={() => {
            setGeneratedUrl(null);
            setBulkResults(null);
            setBulkError(null);
            setModalOpen(true);
          }}
          className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2 px-4 rounded transition-all active:scale-[0.98]"
        >
          + NEW LINK
        </button>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 font-mono text-sm">RETRIEVING LINKS...</div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchLinks} />
      ) : links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No tracked links yet"
          description="Create your first tracked link to start personalizing"
          ctaLabel="Create Link"
          onClick={() => {
            setGeneratedUrl(null);
            setBulkResults(null);
            setBulkError(null);
            setModalOpen(true);
          }}
        />
      ) : (
        <div className="border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs font-mono text-gray-400 uppercase">
                  <th className="py-3.5 px-4 font-normal">Prospect Name</th>
                  <th className="py-3.5 px-4 font-normal">Company</th>
                  <th className="py-3.5 px-4 font-normal">Signal Type</th>
                  <th className="py-3.5 px-4 font-normal">Assigned Rep</th>
                  <th className="py-3.5 px-4 font-normal text-center">Clicks</th>
                  <th className="py-3.5 px-4 font-normal text-center">Status</th>
                  <th className="py-3.5 px-4 font-normal">Created</th>
                  <th className="py-3.5 px-4 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                {links.map((link) => {
                  const status = getStatus(link.expires_at);
                  const displayUrl = buildBaseTrackedUrl(link.id);

                  return (
                    <tr key={link.id} className="hover:bg-[var(--border-subtle)]/10 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium">{link.prospect_name || '-'}</td>
                      <td className="py-3 px-4 text-gray-300 font-mono">{link.company_name || '-'}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs px-2 py-0.5 bg-[var(--border-subtle)] text-gray-300 rounded font-mono border border-[var(--border-subtle)]">
                          {link.signal_type || 'Other'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400 font-mono">{link.assigned_rep || '-'}</td>
                      <td className="py-3 px-4 text-center font-mono text-gray-200">{link.click_count}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${
                            status === 'Active'
                              ? 'bg-green-950/20 text-green-400 border-green-900/40'
                              : status === 'Permanent'
                              ? 'bg-indigo-950/20 text-indigo-400 border-indigo-900/40'
                              : 'bg-red-950/20 text-red-400 border-red-900/40'
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400 font-mono text-xs">
                        {new Date(link.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleCopy(displayUrl, link.id)}
                          className="border border-[var(--border-subtle)] hover:border-[#6366f1] hover:text-[#6366f1] text-xs font-mono py-1 px-2.5 rounded transition-all active:scale-[0.97]"
                        >
                          {copiedId === link.id ? 'COPIED!' : 'COPY'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Creation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl bg-[#080B0F] border border-[var(--border-subtle)] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-subtle)]">
              <h2 className="text-sm font-bold tracking-widest font-mono text-[#6366f1] uppercase">
                Generate Tracked Link
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors text-sm font-mono"
              >
                [ESC]
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <button
                onClick={() => {
                  setGeneratedUrl(null);
                  setActiveTab('single');
                }}
                className={`flex-1 py-3 font-mono text-xs tracking-wider uppercase border-b-2 text-center transition-all ${
                  activeTab === 'single'
                    ? 'border-[#6366f1] text-[#6366f1] bg-[#080B0F]'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Single Link
              </button>
              <button
                onClick={() => {
                  setBulkResults(null);
                  setBulkError(null);
                  setActiveTab('bulk');
                }}
                className={`flex-1 py-3 font-mono text-xs tracking-wider uppercase border-b-2 text-center transition-all ${
                  activeTab === 'bulk'
                    ? 'border-[#6366f1] text-[#6366f1] bg-[#080B0F]'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Bulk Upload (CSV)
              </button>
            </div>

            {/* Modal Content Scroll Area */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {activeTab === 'single' ? (
                /* SINGLE LINK TAB */
                <div>
                  {generatedUrl ? (
                    /* SUCCESS SCREEN */
                    <div className="space-y-4 border border-[var(--border-subtle)] p-6 rounded-lg bg-[var(--bg-elevated)]/50">
                      <div className="text-center py-2">
                        <span className="text-xs font-mono text-green-400 bg-green-950/20 px-3 py-1 border border-green-900/50 rounded-full">
                          LINK GENERATED SUCCESSFULLY
                        </span>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                          Tracked Link URL
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={generatedUrl}
                            className="flex-1 bg-[#080B0F] border border-[var(--border-subtle)] text-sm px-3 py-2 rounded text-white font-mono outline-none"
                          />
                          <button
                            onClick={() => handleCopy(generatedUrl, 'generated')}
                            className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs px-4 rounded transition-all active:scale-[0.98]"
                          >
                            {copiedId === 'generated' ? 'COPIED!' : 'COPY'}
                          </button>
                        </div>
                      </div>
                      <div className="pt-4 flex justify-end">
                        <button
                          onClick={() => setGeneratedUrl(null)}
                          className="border border-[var(--border-subtle)] hover:border-gray-500 text-xs font-mono py-2 px-4 rounded text-gray-300 transition-all"
                        >
                          Generate Another
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* FORM SCREEN */
                    <form onSubmit={handleSingleSubmit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                            Prospect Name
                          </label>
                          <input
                            type="text"
                            value={prospectName}
                            onChange={(e) => setProspectName(e.target.value)}
                            placeholder="John Doe"
                            className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                            Prospect Email
                          </label>
                          <input
                            type="email"
                            value={prospectEmail}
                            onChange={(e) => setProspectEmail(e.target.value)}
                            placeholder="john@example.com"
                            className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                            Company Name
                          </label>
                          <input
                            type="text"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="Acme Corp"
                            className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                            Job Title
                          </label>
                          <input
                            type="text"
                            value={jobTitle}
                            onChange={(e) => setJobTitle(e.target.value)}
                            placeholder="Head of Marketing"
                            className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                            Signal Type
                          </label>
                          <select
                            value={signalType}
                            onChange={(e) => setSignalType(e.target.value)}
                            className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
                          >
                            {SIGNAL_OPTIONS.map((opt) => (
                              <option key={opt} value={opt} className="bg-[#080B0F]">
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                            Assigned Rep
                          </label>
                          <input
                            type="text"
                            value={assignedRep}
                            onChange={(e) => setAssignedRep(e.target.value)}
                            placeholder="Sarah Jenkins"
                            className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 space-y-1.5">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                            Destination URL (Required)
                          </label>
                          <input
                            type="url"
                            required
                            value={destinationUrl}
                            onChange={(e) => setDestinationUrl(e.target.value)}
                            placeholder="https://yourwebsite.com/landing-page"
                            className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                            Expiry (Days)
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={expiresInDays}
                            onChange={(e) => setExpiresInDays(e.target.value)}
                            placeholder="30"
                            className="w-full bg-[#080B0F] border border-[var(--border-subtle)] focus:border-[#6366f1] outline-none text-xs px-3 py-2 rounded text-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="pt-4 flex justify-end">
                        <button
                          type="submit"
                          disabled={generating}
                          className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2 px-6 rounded transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                          {generating ? 'GENERATING...' : 'GENERATE TRACKED LINK'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                /* BULK CSV TAB */
                <div className="space-y-4">
                  <div className="border border-dashed border-[var(--border-subtle)] p-8 rounded-lg text-center bg-[var(--bg-elevated)]/30">
                    <p className="text-xs font-mono text-gray-400 mb-2">
                      Upload a CSV file containing your prospects. Required columns:
                    </p>
                    <p className="text-[10px] font-mono text-[#6366f1] bg-[var(--border-subtle)]/50 py-1.5 px-3 rounded inline-block">
                      prospect_name, prospect_email, company_name, job_title, signal_type, assigned_rep, destination_url
                    </p>
                    <div className="mt-6 flex justify-center">
                      <input
                        type="file"
                        accept=".csv"
                        id="csv-file-input"
                        onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <label
                        htmlFor="csv-file-input"
                        className="border border-[var(--border-subtle)] hover:border-gray-500 text-xs font-mono py-2 px-6 rounded cursor-pointer text-gray-300 hover:text-white transition-all inline-block"
                      >
                        {csvFile ? `Selected: ${csvFile.name}` : 'CHOOSE CSV FILE'}
                      </label>
                    </div>
                  </div>

                  {bulkError && (
                    <div className="p-4 bg-red-950/20 border border-red-900/40 text-red-400 text-xs font-mono rounded">
                      {bulkError}
                    </div>
                  )}

                  {bulkResults ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-green-950/20 border border-green-900/40 text-green-400 text-xs font-mono rounded text-center">
                        SUCCESSFULLY PROCESSED {bulkResults.filter(r => r.status === 'Success').length} / {bulkResults.length} LINKS
                      </div>
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => setBulkResults(null)}
                          className="border border-[var(--border-subtle)] text-xs font-mono py-2 px-4 rounded text-gray-400 hover:text-white transition-all"
                        >
                          Clear Results
                        </button>
                        <button
                          onClick={downloadBulkResults}
                          className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2 px-4 rounded transition-all active:scale-[0.98]"
                        >
                          DOWNLOAD TRACKED CSV
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <button
                        onClick={handleBulkUpload}
                        disabled={!csvFile || bulkProcessing}
                        className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2 px-6 rounded transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        {bulkProcessing ? 'PROCESSING BATCH...' : 'UPLOAD AND GENERATE'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
