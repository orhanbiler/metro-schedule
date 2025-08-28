'use client';

import React, { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { UserPlus } from 'lucide-react';

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
}

export function AdminAssignDialog({
  users,
  originalTime,
  onConfirm,
  disabled = false
}: AdminAssignDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<string>('');
  const [useCustomHours, setUseCustomHours] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const formatOfficerName = (user: User) => {
    if (user.rank && user.idNumber) {
      return `${user.rank} ${user.name} #${user.idNumber}`;
    }
    return user.name;
  };

  const handleConfirm = () => {
    if (!selectedOfficer) return;
    
    let customHours: string | undefined;
    if (useCustomHours && startTime && endTime) {
      customHours = `${startTime}-${endTime}`;
    }
    
    onConfirm(selectedOfficer, customHours);
    handleReset();
  };

  const handleReset = () => {
    setSelectedOfficer('');
    setUseCustomHours(false);
    setStartTime('');
    setEndTime('');
    setOpen(false);
  };

  // Parse original time (e.g., "0600-1200" or "1400-2000")
  const parseOriginalTime = () => {
    if (originalTime.includes('-')) {
      const [start, end] = originalTime.split('-');
      const formatTime = (time: string) => {
        if (time.length === 4) {
          return `${time.slice(0, 2)}:${time.slice(2)}`;
        }
        return time;
      };
      return {
        defaultStart: formatTime(start),
        defaultEnd: formatTime(end)
      };
    }
    return { defaultStart: '', defaultEnd: '' };
  };

  const { defaultStart, defaultEnd } = parseOriginalTime();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="sm" 
          variant="outline"
          className="h-8 w-8 sm:w-8 sm:h-8 p-1"
          disabled={disabled}
          title="Manually assign officer"
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Officer to Shift</DialogTitle>
          <DialogDescription>
            Select an officer and optionally customize the hours for this shift.
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
                  <SelectItem key={user.id} value={formatOfficerName(user)}>
                    {formatOfficerName(user)}
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
                onChange={(e) => {
                  setUseCustomHours(e.target.checked);
                  if (!e.target.checked) {
                    setStartTime('');
                    setEndTime('');
                  } else {
                    setStartTime(defaultStart);
                    setEndTime(defaultEnd);
                  }
                }}
                className="rounded border-gray-300"
              />
              <Label htmlFor="custom-hours">Use custom hours</Label>
            </div>
            
            {useCustomHours && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <Label htmlFor="start-time" className="text-xs">Start Time</Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="end-time" className="text-xs">End Time</Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1"
                  />
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