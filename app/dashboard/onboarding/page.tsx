'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Form States
  const [crm, setCrm] = useState('HubSpot');
  const [idealCustomer, setIdealCustomer] = useState('');
  const [companySize, setCompanySize] = useState('50-200');
  const [channels, setChannels] = useState<string[]>(['Cold Email']);
  const [problem, setProblem] = useState('High-intent buyers not getting fast response');

  // Multi-select handler for outbound channels
  const handleChannelToggle = (channelName: string) => {
    setChannels((prev) =>
      prev.includes(channelName)
        ? prev.filter((c) => c !== channelName)
        : [...prev, channelName]
    );
  };

  // Submit collected onboarding setup data to AI route
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          crm,
          ideal_customer: idealCustomer,
          company_size: companySize,
          channels,
          problem,
        }),
      });

      if (res.ok) {
        setCompleted(true);
        // Explicit redirect to /dashboard/rules
        router.push('/dashboard/rules');
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to complete onboarding setups.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during onboarding rules generation.');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step < 5) {
      setStep((prev) => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep((prev) => prev - 1);
    }
  };

  // Predefined options as requested
  const CRM_OPTIONS = ['HubSpot', 'Zoho', 'Salesforce', 'Pipedrive', 'None'];
  const SIZE_OPTIONS = ['1-50', '50-200', '200-500', '500-2000', '2000+'];
  const CHANNEL_OPTIONS = [
    'Cold Email',
    'LinkedIn Outreach',
    'Google Ads',
    'LinkedIn Ads',
    'Events and Conferences',
    'Partner Referrals',
  ];
  const PROBLEM_OPTIONS = [
    'Too many junk leads',
    'High-intent buyers not getting fast response',
    'Hard to know who is on our website',
    'Reps waste time on bad demos',
  ];

  return (
    <div className="max-w-2xl mx-auto my-8">
      {/* Outer Card Container */}
      <div className="border border-[#1a1f2e] bg-[#0d1117]/30 rounded-lg overflow-hidden shadow-2xl flex flex-col min-h-[450px]">
        {/* Card Header & Progress Bar */}
        <div className="px-8 py-5 border-b border-[#1a1f2e] bg-[#0d1117]/60 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono text-[#6366f1] tracking-widest uppercase">
              AI Setup Assistant
            </span>
            <h1 className="text-sm font-bold font-mono text-white mt-0.5">
              INITIALIZE WORKSPACE PERSONALIZATION
            </h1>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-gray-400">
              {completed ? 'Complete' : `Step ${step} of 5`}
            </span>
          </div>
        </div>

        {/* Dynamic Progress Indicator bar */}
        <div className="w-full bg-[#1a1f2e] h-1">
          <div
            className="bg-[#6366f1] h-full transition-all duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>

        {/* Card Body - Content scroll */}
        <div className="p-8 flex-1 flex flex-col justify-between space-y-6">
          {completed ? (
            /* CONFIRMATION SCREEN */
            <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-8">
              <div className="w-12 h-12 rounded-full border border-green-500 bg-green-950/20 flex items-center justify-center text-[#10b981] text-xl font-bold font-mono">
                ✓
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                  WORKSPACE INITIALIZED
                </h2>
                <p className="text-xs font-mono text-gray-400 max-w-sm mx-auto leading-relaxed">
                  Your AI-generated rules have been compiled and saved. Redirecting to your Routing Rules board...
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/dashboard/rules')}
                className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2.5 px-6 rounded transition-all active:scale-[0.98] uppercase tracking-wide"
              >
                Go to Dashboard
              </button>
            </div>
          ) : loading ? (
            /* LOADING SCREEN */
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 py-12">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-mono text-indigo-400 animate-pulse tracking-wide uppercase">
                Generating personalized routing rules...
              </p>
              <p className="text-[10px] font-mono text-gray-500 max-w-xs text-center leading-relaxed">
                Churnaut AI is evaluating your customer profile to compile custom web variation templates.
              </p>
            </div>
          ) : (
            /* STEP CONTENT SCREEN */
            <div className="space-y-4 flex-1">
              {/* STEP 1: CRM CHOICE */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-mono text-gray-300 uppercase tracking-wide">
                      1. What CRM system do you use?
                    </h2>
                    <p className="text-[10px] font-mono text-gray-500 mt-1">
                      We sync deal stages and rep reassignments to personalize layouts.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CRM_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setCrm(opt)}
                        className={`border rounded p-3 text-left font-mono text-xs transition-all ${
                          crm === opt
                            ? 'border-[#6366f1] bg-[#6366f1]/5 text-white'
                            : 'border-[#1a1f2e] bg-[#080B0F]/30 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 2: ICP DESCRIPTION */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-mono text-gray-300 uppercase tracking-wide">
                      2. Describe your ideal customer in one sentence.
                    </h2>
                    <p className="text-[10px] font-mono text-gray-500 mt-1">
                      Helps the AI draft tailored headline copies.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                      Ideal Customer Profile
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={idealCustomer}
                      onChange={(e) => setIdealCustomer(e.target.value)}
                      placeholder="e.g. B2B software companies with 100+ employees seeking marketing automation tools."
                      className="w-full bg-[#080B0F] border border-[#1a1f2e] focus:border-[#6366f1] outline-none text-xs px-3 py-2.5 rounded text-white font-mono"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: TARGET SIZE */}
              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-mono text-gray-300 uppercase tracking-wide">
                      3. How big are the companies you sell to?
                    </h2>
                    <p className="text-[10px] font-mono text-gray-500 mt-1">
                      Sets up variations matching firmographic segments.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SIZE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setCompanySize(opt)}
                        className={`border rounded p-3 text-left font-mono text-xs transition-all ${
                          companySize === opt
                            ? 'border-[#6366f1] bg-[#6366f1]/5 text-white'
                            : 'border-[#1a1f2e] bg-[#080B0F]/30 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {opt} employees
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 4: OUTBOUND CHANNELS */}
              {step === 4 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-mono text-gray-300 uppercase tracking-wide">
                      4. What channels does your team use?
                    </h2>
                    <p className="text-[10px] font-mono text-gray-500 mt-1">
                      Select all that apply. We create matching inbound signal handlers.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CHANNEL_OPTIONS.map((opt) => {
                      const isChecked = channels.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleChannelToggle(opt)}
                          className={`border rounded p-3 text-left font-mono text-xs transition-all flex justify-between items-center ${
                            isChecked
                              ? 'border-[#6366f1] bg-[#6366f1]/5 text-white'
                              : 'border-[#1a1f2e] bg-[#080B0F]/30 text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          <span>{opt}</span>
                          <span
                            className={`w-3.5 h-3.5 border rounded flex items-center justify-center text-[9px] ${
                              isChecked
                                ? 'border-[#6366f1] bg-[#6366f1] text-white'
                                : 'border-[#1a1f2e]'
                            }`}
                          >
                            {isChecked && '✓'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 5: KEY PROBLEM */}
              {step === 5 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-mono text-gray-300 uppercase tracking-wide">
                      5. What is your biggest problem with inbound leads?
                    </h2>
                    <p className="text-[10px] font-mono text-gray-500 mt-1">
                      Calibrates routing priorities and scheduling variants.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {PROBLEM_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setProblem(opt)}
                        className={`border rounded p-3 text-left font-mono text-xs transition-all ${
                          problem === opt
                            ? 'border-[#6366f1] bg-[#6366f1]/5 text-white'
                            : 'border-[#1a1f2e] bg-[#080B0F]/30 text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation Controls */}
          {!loading && !completed && (
            <div className="flex justify-between items-center pt-5 border-t border-[#1a1f2e]">
              <button
                type="button"
                disabled={step === 1}
                onClick={handlePrev}
                className="border border-[#1a1f2e] hover:border-gray-500 text-xs font-mono py-2 px-6 rounded text-gray-400 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                BACK
              </button>

              <button
                type="button"
                disabled={step === 2 && !idealCustomer.trim()}
                onClick={handleNext}
                className="bg-[#6366f1] hover:bg-[#5053e1] text-white font-mono text-xs py-2 px-6 rounded transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step === 5 ? 'COMPLETE SETUP' : 'NEXT'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
