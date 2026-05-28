import React from 'react';

export default function OnboardingPage() {
  return (
    <div className="space-y-6">
      <div className="border border-[#1a1f2e] bg-[#0d1117] rounded-lg p-8 font-mono">
        <h1 className="text-xl font-bold mb-4 text-[#6366f1]">&gt; INITIALIZING WORKSPACE ONBOARDING</h1>
        <p className="text-sm text-gray-300">Your Churnaut client account has been successfully initialized.</p>
        <p className="text-sm text-gray-300 mt-2">Next steps: configure your routing rules and copy the tracking snippet into your website header.</p>
      </div>
    </div>
  );
}
