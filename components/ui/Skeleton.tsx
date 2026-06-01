'use client';

import React from 'react';

interface SkeletonProps {
  variant?: 'line' | 'card' | 'circle';
  height?: string | number;
  width?: string | number;
  className?: string;
}

export default function Skeleton({ variant = 'line', height, width, className = '' }: SkeletonProps) {
  // Base classes with shimmer gradient
  const baseClass = "animate-shimmer bg-gradient-to-r from-[var(--bg-elevated)] via-[var(--border-default)] to-[var(--bg-elevated)] bg-[length:200%_100%] rounded-md";

  if (variant === 'line') {
    return (
      <div 
        className={`${baseClass} w-full ${className}`}
        style={{ height: height || '16px', width }}
      />
    );
  }

  if (variant === 'circle') {
    const size = height || width || '40px';
    return (
      <div 
        className={`${baseClass} rounded-full ${className}`}
        style={{ height: size, width: size }}
      />
    );
  }

  // Variant card
  return (
    <div 
      className={`${baseClass} w-full ${className}`}
      style={{ height: height || '100px', width }}
    />
  );
}
