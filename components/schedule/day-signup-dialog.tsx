'use client';

import { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HoursDialog } from '@/components/schedule/hours-dialog';
import { cn } from '@/lib/utils';
import type { ShiftType } from '@/lib/schedule-utils';

export interface SignupShiftOption {
  type: ShiftType;
  label: string;
  time: string;
  available: number;
}

export function DaySignupDialog({ options, dayLabel, maxBlockMinutes, disabled, onConfirm }: {
  options: SignupShiftOption[];
  dayLabel: string;
  maxBlockMinutes?: number;
  disabled: boolean;
  onConfirm: (type: ShiftType, hours: string) => void;
}) {
  const fieldId = useId();
  const [selection, setSelection] = useState<SignupShiftOption | null>(null);
  // Preserve the officer's explicit choice if a live update fills that shift.
  // Never silently substitute a different shift at confirmation time.
  const selected = options.find(option => option.type === selection?.type) ?? selection ?? options[0];
  if (!selected) return null;
  const selectionAvailable = options.some(option => option.type === selected.type);

  return (
    <HoursDialog
      originalTime={selected.time}
      shiftLabel={dayLabel}
      maxBlockMinutes={maxBlockMinutes}
      onConfirm={hours => { if (selectionAvailable) onConfirm(selected.type, hours); }}
      onCancel={() => {}}
      confirmDisabled={disabled || !selectionAvailable}
      shiftSelector={
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Choose a shift</legend>
          <div className="grid grid-cols-2 gap-2">
            {options.map(option => (
              <label key={option.type} className={cn(
                'relative flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring',
                selected.type === option.type ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
              )}>
                <input
                  type="radio"
                  name={`${fieldId}-shift`}
                  value={option.type}
                  checked={selected.type === option.type}
                  onChange={() => setSelection(option)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 text-sm">
                  <span className="block font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{option.time.replace(/(\d{2})(\d{2})/g, '$1:$2')}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{option.available} open</span>
                </span>
              </label>
            ))}
          </div>
          {!selectionAvailable && <p role="alert" className="text-sm text-destructive">That shift is no longer available. Choose another shift to continue.</p>}
        </fieldset>
      }
    >
      <Button size="sm" disabled={disabled} onClick={() => setSelection(options[0])} className="w-full gap-2 sm:w-auto" aria-label={`Sign up for ${dayLabel}`}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Sign up
      </Button>
    </HoursDialog>
  );
}
