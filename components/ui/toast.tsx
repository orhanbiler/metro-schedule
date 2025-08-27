import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastProps {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  onClose: () => void;
}

export function Toast({ type, message, onClose }: ToastProps) {
  const baseClasses = "fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg border flex items-center gap-3 min-w-[300px] max-w-md";
  
  const typeClasses = {
    success: "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800",
    error: "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
    info: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
    warning: "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800"
  };

  const icons = {
    success: "✓",
    error: "✗",
    info: "ℹ",
    warning: "⚠"
  };

  return (
    <div className={cn(baseClasses, typeClasses[type])}>
      <span className="font-semibold text-lg">{icons[type]}</span>
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="p-1 hover:bg-black/10 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export interface ToastManager {
  show: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
}

export function useToast(): ToastManager {
  const show = (type: 'success' | 'error' | 'info' | 'warning', message: string) => {
    // This would be better with a context provider, but for now we'll use the feedback state
    console.log(`Toast [${type.toUpperCase()}]: ${message}`);
  };

  return { show };
}