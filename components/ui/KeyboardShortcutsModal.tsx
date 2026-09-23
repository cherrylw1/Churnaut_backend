'use client';

import React, { useEffect } from 'react';
import { X, Keyboard, Sparkles, Command } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-gradient-to-b from-white to-slate-100 border border-slate-300/90 text-slate-800 font-mono text-[11px] font-bold shadow-[0_1px_2px_rgba(0,0,0,0.06)] leading-none select-none">
      {children}
    </kbd>
  );
}

interface ShortcutRowProps {
  label: string;
  keys: React.ReactNode[];
  isSequence?: boolean;
}

function ShortcutRow({ label, keys, isSequence }: ShortcutRowProps) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-white hover:border-slate-200/90 hover:shadow-2xs transition-all duration-150">
      <span className="text-xs font-semibold text-slate-700 font-sans">{label}</span>
      <div className="flex items-center gap-1.5">
        {keys.map((k, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <span className="text-[10px] font-mono text-slate-400 font-medium">
                {isSequence ? 'then' : '+'}
              </span>
            )}
            <Keycap>{k}</Keycap>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          {/* Backdrop click to dismiss */}
          <div 
            className="absolute inset-0" 
            onClick={onClose} 
            aria-hidden="true" 
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative w-full max-w-lg rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-2xl overflow-hidden font-sans text-slate-800 z-10"
            role="dialog"
            aria-modal="true"
            aria-labelledby="keyboard-shortcuts-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#165B40]/10 text-[#165B40] flex items-center justify-center border border-[#165B40]/20 flex-shrink-0 shadow-2xs">
                  <Keyboard className="w-5 h-5 text-[#165B40]" />
                </div>
                <div>
                  <p className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                    Workspace quick access
                  </p>
                  <h2 id="keyboard-shortcuts-title" className="text-base font-bold text-slate-900 tracking-tight font-sans">
                    Keyboard Shortcuts
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close keyboard shortcuts"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#165B40]/30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="py-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Navigation Column */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#165B40] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#165B40]" />
                      Navigation
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Sequential</span>
                  </div>

                  <div className="space-y-1.5">
                    <ShortcutRow label="Home" keys={['G', 'H']} isSequence />
                    <ShortcutRow label="Scout AI" keys={['G', 'S']} isSequence />
                    <ShortcutRow label="Tracked Links" keys={['G', 'L']} isSequence />
                    <ShortcutRow label="Routing Rules" keys={['G', 'R']} isSequence />
                    <ShortcutRow label="Analytics" keys={['G', 'A']} isSequence />
                    <ShortcutRow label="Playbooks" keys={['G', 'P']} isSequence />
                    <ShortcutRow label="ICP Builder" keys={['G', 'I']} isSequence />
                  </div>
                </div>

                {/* System & Global Column */}
                <div className="space-y-2.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        System & Search
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">Global</span>
                    </div>

                    <div className="space-y-1.5">
                      <ShortcutRow label="Search / Palette" keys={[<Command key="cmd" className="w-3 h-3 inline" />, 'K']} />
                      <ShortcutRow label="Shortcuts Legend" keys={['?']} />
                      <ShortcutRow label="Dismiss / Close" keys={['Esc']} />
                    </div>
                  </div>

                  {/* Info callout */}
                  <div className="p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/50 mt-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#165B40]">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Speed Navigation</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                      Press <strong className="text-slate-800">G</strong> followed by a section key within 500ms from anywhere in the app.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400">
                Press <Keycap>?</Keycap> anytime to toggle
              </span>

              <button
                type="button"
                onClick={onClose}
                className="dashboard-button-primary rounded-full !py-1.5 !px-5 text-xs font-semibold shadow-xs"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
