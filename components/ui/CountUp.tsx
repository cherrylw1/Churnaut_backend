'use client';

import React, { useState, useEffect, useRef } from 'react';

interface CountUpProps {
  value: number;
  duration?: number; // in seconds
  prefix?: string;
  suffix?: string;
}

export default function CountUp({ value, duration = 1.2, prefix = '', suffix = '' }: CountUpProps) {
  const [displayVal, setDisplayVal] = useState(0);
  const countRef = useRef<number>(0);

  useEffect(() => {
    let startTime: number | null = null;
    const durationMs = duration * 1000;
    const startValue = 0;
    let animationFrameId: number;

    const animateCount = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);

      // Cubic ease-out: f(t) = 1 - (1 - t)^3
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentVal = startValue + easeProgress * (value - startValue);

      countRef.current = currentVal;
      setDisplayVal(currentVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animateCount);
      }
    };

    animationFrameId = requestAnimationFrame(animateCount);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [value, duration]);

  // Format the display value
  const formatNumber = (num: number) => {
    const isDecimal = value % 1 !== 0;
    if (isDecimal) {
      return num.toFixed(1);
    }
    return Math.round(num).toString();
  };

  return (
    <span>
      {prefix}
      {formatNumber(displayVal)}
      {suffix}
    </span>
  );
}
