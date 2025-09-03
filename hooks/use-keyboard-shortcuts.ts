import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: () => void;
  description?: string;
}

const globalShortcuts: ShortcutConfig[] = [
  {
    key: 'd',
    alt: true,
    action: () => window.location.href = '/dashboard',
    description: 'Go to Dashboard',
  },
  {
    key: 's',
    alt: true,
    action: () => window.location.href = '/dashboard/schedule',
    description: 'Go to Schedule',
  },
  {
    key: 'p',
    alt: true,
    action: () => window.location.href = '/dashboard/profile',
    description: 'Go to Profile',
  },
  {
    key: '/',
    ctrl: true,
    action: () => {
      const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
      }
    },
    description: 'Focus search',
  },
  {
    key: '?',
    shift: true,
    action: () => {
      // Show keyboard shortcuts help
      const event = new CustomEvent('showKeyboardHelp');
      window.dispatchEvent(event);
    },
    description: 'Show keyboard shortcuts',
  },
];

export function useKeyboardShortcuts(customShortcuts?: ShortcutConfig[]) {
  const router = useRouter();
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in input fields
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }
    
    const shortcuts = [...globalShortcuts, ...(customShortcuts || [])];
    
    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
      
      if (ctrlMatch && altMatch && shiftMatch && keyMatch) {
        e.preventDefault();
        shortcut.action();
        break;
      }
    }
  }, [customShortcuts]);
  
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
  
  return {
    shortcuts: [...globalShortcuts, ...(customShortcuts || [])],
  };
}

// Component-specific shortcuts for schedule page
export function useScheduleKeyboardShortcuts(
  onRefresh: () => void,
  onNextWeek?: () => void,
  onPrevWeek?: () => void,
  onToday?: () => void
) {
  const scheduleShortcuts: ShortcutConfig[] = [
    {
      key: 'r',
      action: onRefresh,
      description: 'Refresh schedule',
    },
    ...(onNextWeek ? [{
      key: 'ArrowRight',
      action: onNextWeek,
      description: 'Next week',
    }] : []),
    ...(onPrevWeek ? [{
      key: 'ArrowLeft',
      action: onPrevWeek,
      description: 'Previous week',
    }] : []),
    ...(onToday ? [{
      key: 't',
      action: onToday,
      description: 'Go to today',
    }] : []),
  ];
  
  return useKeyboardShortcuts(scheduleShortcuts);
}