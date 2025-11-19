'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus } from 'lucide-react';
import { formatOfficerName } from '@/lib/utils';
import { addMinutesToTimeString } from '@/lib/schedule-utils';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  rank?: string;
  idNumber?: string;
}

interface AdminAssignDialogProps {
  users: User[];
  originalTime: string;
  onConfirm: (officerName: string, customHours?: string) => void;
  disabled?: boolean;
  maxBlockMinutes?: number;
}

export function AdminAssignDialog({
  users,
  originalTime,
  onConfirm,
  disabled = false,
  maxBlockMinutes,
}: AdminAssignDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<string>('');
  const blockMinutes = maxBlockMinutes ?? null;
  const blockEnforced = blockMinutes !== null;
  const [useCustomHours, setUseCustomHours] = useState(blockEnforced);
  const [startTime, setStartTime] = useState(''); // HHMM
  const [endTime, setEndTime] = useState('');   // HHMM
  const MIN_BLOCK_MINUTES = 60;

  const timeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const value = `${hour.toString().padStart(2, '0')}${minute.toString().padStart(2, '0')}`;
        const label = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        options.push({ value, label });
      }
    }
    return options;
  }, []);

  const sanitizeTime = (value?: string) => (value ? value.replace(':', '') : '');
  const formatDisplayTime = (value?: string) => (value ? `${value.slice(0, 2)}:${value.slice(2)}` : '');

  const [originalStartRaw, originalEndRaw] = originalTime.split('-');
  const shiftStart = sanitizeTime(originalStartRaw);
  const shiftEnd = sanitizeTime(originalEndRaw);

  const compareTimes = (a?: string, b?: string) => {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    return Number(a) - Number(b);
  };

  const clampEndToWindow = (value?: string) => {
    if (!value) return value;
    if (!shiftEnd) return value;
    return compareTimes(value, shiftEnd) > 0 ? shiftEnd : value;
  };

  const computeMaxEndForStart = (startHHMM?: string) => {
    if (!startHHMM) return shiftEnd;
    if (!blockMinutes) return shiftEnd;
    const desired = addMinutesToTimeString(startHHMM, blockMinutes);
    return clampEndToWindow(desired);
  };

  const hasMinimumWindow = (startHHMM: string) => {
    if (!startHHMM || !shiftEnd) return false;
    const minCandidate = addMinutesToTimeString(startHHMM, MIN_BLOCK_MINUTES);
    return compareTimes(minCandidate, shiftEnd) <= 0;
  };

  const defaultBlockedEnd = useMemo(() => {
    if (!blockEnforced || !shiftStart) return '';
    if (!blockMinutes) return shiftEnd;
    const desired = addMinutesToTimeString(shiftStart, blockMinutes);
    return shiftEnd && compareTimes(desired, shiftEnd) > 0 ? shiftEnd : desired;
  }, [blockEnforced, blockMinutes, shiftStart, shiftEnd]);

  useEffect(() => {
    if (blockEnforced && shiftStart) {
      setUseCustomHours(true);
      const defaultEnd = defaultBlockedEnd || shiftEnd;
      setStartTime(shiftStart);
      setEndTime(defaultEnd || '');
    } else {
      setUseCustomHours(false);
      setStartTime('');
      setEndTime('');
    }
  }, [blockEnforced, defaultBlockedEnd, shiftStart, shiftEnd]);

  const resetFormState = () => {
    setSelectedOfficer('');
    if (blockEnforced && shiftStart) {
      setUseCustomHours(true);
      const defaultEnd = defaultBlockedEnd || shiftEnd;
      setStartTime(shiftStart);
      setEndTime(defaultEnd || '');
    } else {
      setUseCustomHours(false);
      setStartTime('');
      setEndTime('');
    }
  };

  const handleStartChange = (value: string) => {
    setStartTime(value);
    if (blockEnforced) {
      const maxEnd = computeMaxEndForStart(value) || shiftEnd;
      setEndTime((prev) => {
        if (!prev) return maxEnd || '';
        if (compareTimes(prev, value) <= 0) {
          return maxEnd || '';
        }
        if (maxEnd && compareTimes(prev, maxEnd) > 0) {
          return maxEnd;
        }
        return prev;
      });
    } else {
      setEndTime((prev) => {
        if (!prev) return prev;
        return compareTimes(prev, value) <= 0 ? '' : prev;
      });
    }
  };

  const handleEndChange = (value: string) => {
    if (!value) {
      setEndTime('');
      return;
    }
    if (blockEnforced) {
      const referenceStart = startTime || shiftStart;
      const maxAllowed = computeMaxEndForStart(referenceStart) || shiftEnd;
      if (maxAllowed && compareTimes(value, maxAllowed) > 0) {
        setEndTime(maxAllowed);
        return;
      }
    }
    setEndTime(value);
  };

  const getOfficerDisplayName = (user: User) => {
    if (user.rank && user.idNumber) {
      return formatOfficerName(user.name, user.rank, user.idNumber);
    }
    return user.name || user.email || 'Unknown Officer';
  };

  const handleConfirm = () => {
    if (!selectedOfficer) return;

    let customHours: string | undefined;
    if (useCustomHours && startTime && endTime) {
      const formatSegment = (value: string) => `${value.slice(0, 2)}:${value.slice(2)}`;
      customHours = `${formatSegment(startTime)}-${formatSegment(endTime)}`;
    }

    onConfirm(selectedOfficer, customHours);
    resetFormState();
    setOpen(false);
  };

  const handleReset = () => {
    resetFormState();
    setOpen(false);
  };

  const handleDialogChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      resetFormState();
    }
  };

  const shiftStartDisplay = formatDisplayTime(shiftStart);
  const shiftEndDisplay = formatDisplayTime(shiftEnd);
  const effectiveStart = startTime || (blockEnforced ? shiftStart : '');
  const maxSelectableEnd = blockEnforced ? computeMaxEndForStart(effectiveStart) || shiftEnd : shiftEnd;

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-6 w-6 sm:h-8 sm:w-8 p-0 sm:p-1"
          disabled={disabled}
          title="Manually assign officer"
        >
          <UserPlus className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Assign Officer to Shift</DialogTitle>
          <DialogDescription>
            Select an officer and choose drop-down hours within the shift window.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="officer">Select Officer</Label>
            <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
              <SelectTrigger id="officer">
                <SelectValue placeholder="Choose an officer" />
              </SelectTrigger>
              <SelectContent>
                {users.map(user => (
                  <SelectItem key={user.id} value={getOfficerDisplayName(user)}>
                    {getOfficerDisplayName(user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="custom-hours"
                checked={useCustomHours}
                disabled={blockEnforced}
                onChange={(e) => {
                  if (blockEnforced) return;
                  setUseCustomHours(e.target.checked);
                  if (!e.target.checked) {
                    setStartTime('');
                    setEndTime('');
                  } else {
                    setStartTime(shiftStart);
                    setEndTime(shiftEnd);
                  }
                }}
                className="rounded border-gray-300"
              />
              <Label htmlFor="custom-hours">Custom hours within this window</Label>
            </div>
            {blockEnforced && (
              <p className="text-2xs text-primary">
                Allows one continuous block up to {(blockMinutes || 0) / 60} hours between {shiftStartDisplay} and {shiftEndDisplay}.
              </p>
            )}

            {useCustomHours && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div className="space-y-2">
                  <Label className="text-xs">Start Time</Label>
                  <Select value={startTime} onValueChange={handleStartChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select start" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions
                        .filter(opt => {
                          const withinWindow = (!shiftStart || opt.value >= shiftStart) && (!shiftEnd || opt.value < shiftEnd);
                          if (!withinWindow) return false;
                          if (blockEnforced) {
                            return hasMinimumWindow(opt.value);
                          }
                          return true;
                        })
                        .map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">End Time</Label>
                  <Select value={endTime} onValueChange={handleEndChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={effectiveStart ? 'Select end' : 'Pick start first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions
                        .filter(opt => {
                          const startReference = effectiveStart;
                          if (!startReference) {
                            return !blockEnforced;
                          }
                          if (compareTimes(opt.value, startReference) <= 0) return false;
                          const withinShiftEnd = !shiftEnd || compareTimes(opt.value, shiftEnd) <= 0;
                          if (!withinShiftEnd) return false;
                          if (blockEnforced) {
                            return !maxSelectableEnd || compareTimes(opt.value, maxSelectableEnd) <= 0;
                          }
                          return true;
                        })
                        .map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleReset}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedOfficer || (useCustomHours && (!startTime || !endTime))}
          >
            Assign Officer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
