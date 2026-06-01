'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
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
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-[#080b0f] border border-[var(--border-subtle)] rounded-lg shadow-2xl overflow-hidden flex flex-col font-sans text-xs text-gray-300"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-subtle)]">
              <h2 className="text-xs font-bold tracking-widest font-mono text-[#6366f1] uppercase">
                KEYBOARD SHORTCUTS
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors focus:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Navigation Column */}
                <div className="space-y-3.5">
                  <h3 className="text-indigo-400 font-bold uppercase tracking-wider text-[9px] border-b border-[var(--border-subtle)] pb-1.5 font-mono">
                    Navigation
                  </h3>
                  <div className="flex justify-between items-center font-mono">
                    <span className="text-gray-400">Go to Home</span>
                    <span className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 rounded text-white font-bold text-[10px]">
                      G + H
                    </span>
                  </div>
                  <div className="flex justify-between items-center font-mono">
                    <span className="text-gray-400">Go to Scout</span>
                    <span className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 rounded text-white font-bold text-[10px]">
                      G + S
                    </span>
                  </div>
                  <div className="flex justify-between items-center font-mono">
                    <span className="text-gray-400">Go to Links</span>
                    <span className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 rounded text-white font-bold text-[10px]">
                      G + L
                    </span>
                  </div>
                  <div className="flex justify-between items-center font-mono">
                    <span className="text-gray-400">Go to Rules</span>
                    <span className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 rounded text-white font-bold text-[10px]">
                      G + R
                    </span>
                  </div>
                  <div className="flex justify-between items-center font-mono">
                    <span className="text-gray-400">Go to Analytics</span>
                    <span className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 rounded text-white font-bold text-[10px]">
                      G + A
                    </span>
                  </div>
                </div>

                {/* System Column */}
                <div className="space-y-3.5">
                  <h3 className="text-indigo-400 font-bold uppercase tracking-wider text-[9px] border-b border-[var(--border-subtle)] pb-1.5 font-mono">
                    System
                  </h3>
                  <div className="flex justify-between items-center font-mono">
                    <span className="text-gray-400">Show Keys</span>
                    <span className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 rounded text-white font-bold text-[10px]">
                      ?
                    </span>
                  </div>
                  <div className="flex justify-between items-center font-mono">
                    <span className="text-gray-400">Close Modals</span>
                    <span className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 rounded text-white font-bold text-[10px]">
                      ESC
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
