'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface HoursDialogProps {
  children: React.ReactNode;
  originalTime: string;
  onConfirm: (customHours: string) => void;
  onCancel: () => void;
}

export function HoursDialog({ children, originalTime, onConfirm, onCancel }: HoursDialogProps) {
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [useCustomHours, setUseCustomHours] = useState(false);

  // Generate time options (15-minute intervals)
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeStr = `${hour.toString().padStart(2, '0')}${minute.toString().padStart(2, '0')}`;
        const displayTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        options.push({ value: timeStr, display: displayTime });
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();
  const [originalStart, originalEnd] = originalTime.split('-');

  const handleConfirm = () => {
    if (useCustomHours && startTime && endTime) {
      // Validate that start time is before end time
      if (parseInt(startTime) >= parseInt(endTime)) {
        alert('Start time must be before end time');
        return;
      }
      
      const customTime = `${startTime.slice(0, 2)}:${startTime.slice(2)}-${endTime.slice(0, 2)}:${endTime.slice(2)}`;
      onConfirm(customTime);
    } else {
      onConfirm(originalTime);
    }
    setOpen(false);
    setUseCustomHours(false);
    setStartTime('');
    setEndTime('');
  };

  const handleCancel = () => {
    setOpen(false);
    setUseCustomHours(false);
    setStartTime('');
    setEndTime('');
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Sign Up for Shift</DialogTitle>
          <DialogDescription>
            Choose your working hours for this shift. You can work the full scheduled time or customize your hours within the available window.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="rounded-lg border p-4 bg-muted/30">
              <Label className="text-sm font-medium">Available Shift Window</Label>
              <p className="text-lg font-semibold mt-1">
                {originalStart.slice(0, 2)}:{originalStart.slice(2)} - {originalEnd.slice(0, 2)}:{originalEnd.slice(2)}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="customHours"
                checked={useCustomHours}
                onChange={(e) => setUseCustomHours(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="customHours" className="text-sm font-medium">
                I want to work custom hours within this window
              </Label>
            </div>

            {useCustomHours && (
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border bg-background">
                <div className="space-y-2">
                  <Label htmlFor="startTime">Start Time</Label>
                  <Select value={startTime} onValueChange={setStartTime}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select start time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions
                        .filter(opt => opt.value >= originalStart && opt.value < originalEnd)
                        .map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.display}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endTime">End Time</Label>
                  <Select value={endTime} onValueChange={setEndTime}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select end time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions
                        .filter(opt => opt.value > originalStart && opt.value <= originalEnd)
                        .filter(opt => !startTime || opt.value > startTime)
                        .map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.display}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {useCustomHours && startTime && endTime && (
              <div className="rounded-lg border p-4 bg-primary/10">
                <Label className="text-sm font-medium">Your Selected Hours</Label>
                <p className="text-lg font-semibold mt-1">
                  {startTime.slice(0, 2)}:{startTime.slice(2)} - {endTime.slice(0, 2)}:{endTime.slice(2)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Total: {(parseInt(endTime) - parseInt(startTime)) / 100} hours
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={useCustomHours && (!startTime || !endTime)}
          >
            Sign Up for Shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}