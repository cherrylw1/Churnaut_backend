'use client';

type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.toasts);
    return () => {
      this.listeners.delete(listener);
    };
  }

  add(type: ToastType, message: string) {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = { id, type, message };
    this.toasts = [...this.toasts, newToast];
    this.notify();
    return id;
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.toasts));
  }
}

export const toastManager = new ToastManager();

export const toast = {
  success: (message: string) => toastManager.add('success', message),
  error: (message: string) => toastManager.add('error', message),
  warning: (message: string) => toastManager.add('warning', message),
  info: (message: string) => toastManager.add('info', message),
};

export function useToast() {
  return toast;
}
