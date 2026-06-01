'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useKeyboardShortcuts(onOpenHelp: () => void) {
  const router = useRouter();

  useEffect(() => {
    let lastKey = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in form inputs
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        if (
          tagName === 'input' ||
          tagName === 'textarea' ||
          activeEl.getAttribute('contenteditable') === 'true' ||
          tagName === 'select'
        ) {
          return;
        }
      }

      const key = e.key.toLowerCase();
      const now = Date.now();

      // Help Modal
      if (e.key === '?') {
        e.preventDefault();
        onOpenHelp();
        return;
      }

      // Check "G" sequences
      if (lastKey === 'g' && now - lastKeyTime <= 500) {
        if (key === 'h') {
          e.preventDefault();
          router.push('/dashboard');
          lastKey = ''; // Reset
          return;
        } else if (key === 's') {
          e.preventDefault();
          router.push('/dashboard/scout');
          lastKey = '';
          return;
        } else if (key === 'l') {
          e.preventDefault();
          router.push('/dashboard/links');
          lastKey = '';
          return;
        } else if (key === 'r') {
          e.preventDefault();
          router.push('/dashboard/rules');
          lastKey = '';
          return;
        } else if (key === 'a') {
          e.preventDefault();
          router.push('/dashboard/analytics');
          lastKey = '';
          return;
        }
      }

      if (key === 'g') {
        lastKey = 'g';
        lastKeyTime = now;
      } else {
        lastKey = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [router, onOpenHelp]);
}
