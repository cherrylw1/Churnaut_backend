'use client';

import React, { useState, useEffect } from 'react';
import { toastManager, ToastItem } from '@/hooks/useToast';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toastManager.subscribe((newToasts) => {
      setToasts(newToasts);
    });
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none w-80 max-w-[calc(100vw-2rem)]">
      <AnimatePresence>
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      toastManager.remove(item.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [item.id]);

  const getIcon = () => {
    switch (item.type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />;
      case 'info':
      default:
        return <Info className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />;
    }
  };

  const getBorderClass = () => {
    switch (item.type) {
      case 'success':
        return 'border-l-4 border-l-green-500';
      case 'error':
        return 'border-l-4 border-l-red-500';
      case 'warning':
        return 'border-l-4 border-l-amber-500';
      case 'info':
      default:
        return 'border-l-4 border-l-purple-500';
    }
  };

  const getProgressBarClass = () => {
    switch (item.type) {
      case 'success':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'warning':
        return 'bg-amber-500';
      case 'info':
      default:
        return 'bg-purple-500';
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', damping: 25, stiffness: 250 }}
      className={`pointer-events-auto w-full bg-[#0d1117] border border-[var(--border-subtle)] ${getBorderClass()} rounded-r-md p-3 shadow-2xl relative overflow-hidden flex gap-3 items-start select-none`}
    >
      {getIcon()}
      <div className="flex-1 font-mono text-xs text-gray-200 pr-4 leading-normal break-words">
        {item.message}
      </div>
      <button
        onClick={() => toastManager.remove(item.id)}
        className="text-gray-500 hover:text-white transition-colors focus:outline-none"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {/* Progress Bar */}
      <motion.div
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: 3, ease: 'linear' }}
        className={`h-[2px] absolute bottom-0 left-0 ${getProgressBarClass()}`}
      />
    </motion.div>
  );
}
