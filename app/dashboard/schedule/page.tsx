'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isFirestoreInitialized } from '@/lib/firebase-utils';
import { useAuth, type User } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { HoursDialog } from '@/components/schedule/hours-dialog';
import { AdminAssignDialog } from '@/components/schedule/admin-assign-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Download, Trash2, Plus, Calendar, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { formatOfficerName, formatOfficerNameForDisplay, extractRankFromOfficerName, calculateOfficerPayRate, cn } from '@/lib/utils';
import { ScheduleSkeleton } from '@/components/schedule/schedule-skeleton';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import {
  parseTimeString,
  getHourlyAvailability,
  canAddOfficerShift,
  getAvailableTimeSlots,
  getShiftDateBounds,
  getDefaultShiftWindow,
  getShiftMaxBlockMinutes,
  usesUpdatedShiftPolicy,
  getTimeRangeDurationMinutes,
  isRangeWithinShiftWindow,
  type OfficerShift,
} from '@/lib/schedule-utils';

interface Officer {
  name: string;
  customHours?: string;
}

interface TimeSlot {
  id: string;
  date: Date;
  dayName: string;
  morningSlot: {
    time: string;
    available: boolean;
    officers: Officer[];
    maxOfficers?: number;
  };
  afternoonSlot: {
    time: string;
    available: boolean;
    officers: Officer[];
    maxOfficers?: number;
  };
}

export default function SchedulePage() {
  const { user, firebaseUser } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [schedule, setSchedule] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Native-style pull-to-refresh functionality
  const { isRefreshing, pullDistance, isPulling, pullProgress } = usePullToRefresh({
    onRefresh: async () => {
      await loadSchedule();
      // Use native haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      toast.success('Schedule refreshed');
    },
    threshold: 60, // Reduced for more native feel
  });



  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, index) => currentYear - 1 + index);
  }, []);

  const today = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return base;
  }, []);

  const isSameDay = (date: Date) => {
    const compare = new Date(date);
    compare.setHours(0, 0, 0, 0);
    return compare.getTime() === today.getTime();
  };

  const formatSlotDateLabel = (date: Date) =>
    date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const toMinutes = (value: string) => {
    const hours = parseInt(value.slice(0, 2), 10);
    const minutes = parseInt(value.slice(2, 4), 10);
    return hours * 60 + minutes;
  };

  const minutesToHHMM = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}${mins.toString().padStart(2, '0')}`;
  };

  const getShiftAvailabilitySummary = (
    slot: TimeSlot,
    slotType: 'morning' | 'afternoon'
  ): {
    availableSlots: string[];
    maxRemaining: number;
    status: 'past' | 'ongoing' | 'upcoming';
  } => {
    const slotData = slotType === 'morning' ? slot.morningSlot : slot.afternoonSlot;
    const defaultWindow = getDefaultShiftWindow(slotType, slot.date);
    const timeString = slotData.time || defaultWindow;
    const ranges = parseTimeString(timeString);

    let shiftStart = ranges[0]?.start ?? defaultWindow.slice(0, 4);
    let shiftEnd = ranges[0]?.end ?? defaultWindow.slice(5, 9);

    for (const range of ranges) {
      if (range.start < shiftStart) {
        shiftStart = range.start;
      }
      if (range.end > shiftEnd) {
        shiftEnd = range.end;
      }
    }

    const { start, end } = getShiftDateBounds(slot.date, timeString);
    const now = new Date();
    let status: 'past' | 'ongoing' | 'upcoming' = 'upcoming';

    if (start && end) {
      if (now >= end) {
        status = 'past';
      } else if (now >= start) {
        status = 'ongoing';
      }
    } else if (end && now >= end) {
      status = 'past';
    } else if (start && now >= start) {
      status = 'ongoing';
    } else if (slot.date < now) {
      status = 'past';
    }

    if (status === 'past') {
      return { availableSlots: [], maxRemaining: 0, status };
    }

    const officerShifts: OfficerShift[] = slotData.officers.map((officer) => ({
      name: officer.name,
      timeRanges: parseTimeString(officer.customHours || timeString),
    }));

    const shiftEndMinutes = toMinutes(shiftEnd);
    const originalStartMinutes = toMinutes(shiftStart);

    let effectiveStartMinutes = originalStartMinutes;
    if (status === 'ongoing') {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const floored = Math.floor(currentMinutes / 60) * 60;
      effectiveStartMinutes = Math.min(Math.max(floored, originalStartMinutes), shiftEndMinutes);
    }

    if (effectiveStartMinutes >= shiftEndMinutes) {
      return { availableSlots: [], maxRemaining: 0, status };
    }

    const effectiveShiftStart = minutesToHHMM(effectiveStartMinutes);
    const hourlyAvailability = getHourlyAvailability(officerShifts, effectiveShiftStart, shiftEnd);
    const availableSlots = getAvailableTimeSlots(officerShifts, effectiveShiftStart, shiftEnd);

    const baseMax = hourlyAvailability.length > 0
      ? hourlyAvailability.reduce(
        (max, hour) => Math.max(max, Math.max(0, 2 - hour.officerCount)),
        0
      )
      : 2;

    return {
      availableSlots,
      maxRemaining: Math.min(2, baseMax),
      status,
    };
  };

  const renderMobileShift = (
    slot: TimeSlot,
    slotType: 'morning' | 'afternoon',
    summary: { availableSlots: string[]; maxRemaining: number; status: 'past' | 'ongoing' | 'upcoming' }
  ) => {
    const slotData = slotType === 'morning' ? slot.morningSlot : slot.afternoonSlot;
    const { availableSlots, maxRemaining, status } = summary;
    const hasAvailability = status !== 'past' && maxRemaining > 0 && availableSlots.length > 0;
    const userSignedUp = hasUserSignedUpForSlot(slot.date, slotType);
    const isAdmin = user?.role === 'admin';
    const canModify = canUserModifySchedule();
    const blockMinutes = getShiftMaxBlockMinutes(slot.date);

    return (
      <div key={`${slot.id}-${slotType}-card`} className="space-y-2 rounded-lg border border-dashed p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {slotType === 'morning' ? 'Morning Shift' : 'Afternoon Shift'}
            </p>
            <p className="text-xs text-muted-foreground">{displayTime(slotData.time)}</p>
          </div>
          <Badge
            className={cn(
              'text-2xs uppercase tracking-wide',
              status === 'past'
                ? 'bg-muted text-muted-foreground'
                : maxRemaining > 0
                  ? 'bg-emerald-500/20 text-emerald-700'
                  : 'bg-muted text-muted-foreground'
            )}
          >
            {status === 'past' ? 'Closed' : maxRemaining > 0 ? `${maxRemaining} open` : 'Full'}
          </Badge>
        </div>

        {slotData.officers.length > 0 ? (
          <div className="space-y-1">
            {slotData.officers.map((officer, index) => (
              <div
                key={`${slot.id}-${slotType}-officer-${index}`}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/40 p-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <span
                    className={cn(
                      'block truncate',
                      officer.name === getCurrentOfficerFormatted() || officer.name === user?.name
                        ? 'font-semibold text-primary'
                        : undefined
                    )}
                    title={officer.name}
                  >
                    {formatOfficerNameForDisplay(officer.name)}
                  </span>
                  {officer.customHours && (
                    <div className="text-2xs text-muted-foreground truncate">Custom: {officer.customHours}</div>
                  )}
                </div>
                {canUserRemoveFromShift(officer, slot.date) && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 w-8 p-0"
                        disabled={loading}
                        title={
                          isShiftWithinDays(slot.date, 2)
                            ? 'Cannot remove - shift is within 2 days'
                            : isShiftPastRemovalWindow(slot.date)
                              ? 'Cannot remove - more than 2 days have passed since shift'
                              : `Remove ${officer.name}`
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Officer</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to remove {formatOfficerNameForDisplay(officer.name)} from this shift?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleRemoveOfficer(slot.id, slotType, officer.name)}>
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        ) : status === 'past' ? (
          <div className="text-2xs text-muted-foreground italic">Shift closed</div>
        ) : (
          <div className="text-2xs text-muted-foreground italic">No officers yet</div>
        )}

        <div>{getAvailabilityDisplay(slot, slotType, summary)}</div>

        <div className="flex flex-wrap items-center gap-2">
          {userSignedUp ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span className="hidden sm:inline">
                {status === 'past' ? 'Shift completed' : 'Signed up'}
              </span>
              <span className="sm:hidden">
                {status === 'past' ? 'Completed' : 'Signed'}
              </span>
            </span>
          ) : hasAvailability && canModify ? (
            <HoursDialog
              originalTime={slotData.time}
              maxBlockMinutes={blockMinutes ?? undefined}
              onConfirm={(customHours) => handleSignUp(slot.id, slotType, customHours)}
              onCancel={() => { }}
            >
              <Button size="sm" disabled={loading} className="flex-1 sm:flex-none h-9 px-3 text-sm" title="Sign up for this shift">
                <Plus className="mr-2 h-4 w-4" /> Sign Up
              </Button>
            </HoursDialog>
          ) : status === 'past' ? (
            <span className="text-xs text-muted-foreground">Shift closed</span>
          ) : (
            !hasAvailability && <span className="text-xs text-muted-foreground">Fully staffed</span>
          )}
          {isAdmin && hasAvailability && (
            <AdminAssignDialog
              users={allUsers}
              originalTime={slotData.time}
              maxBlockMinutes={blockMinutes ?? undefined}
              onConfirm={(officerName, customHours) => handleAdminAssign(slot.id, slotType, officerName, customHours)}
              disabled={loading}
            />
          )}
        </div>
      </div>
    );
  };


  const getCurrentOfficerFormatted = (useAbbreviation: boolean = false) => {
    if (user?.rank && user?.idNumber) {
      if (useAbbreviation) {
        return formatOfficerName(user.name, user.rank, user.idNumber);
      }
      return `${user.rank} ${user.name} #${user.idNumber}`;
    }
    return user?.name || 'Current Officer';
  };

  const isShiftWithinDays = (shiftDate: Date, days: number): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to start of day
    const shift = new Date(shiftDate);
    shift.setHours(0, 0, 0, 0); // Reset to start of day
    const diffTime = shift.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= days;
  };

  const isShiftPastRemovalWindow = (shiftDate: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to start of day
    const shift = new Date(shiftDate);
    shift.setHours(0, 0, 0, 0); // Reset to start of day
    const diffTime = today.getTime() - shift.getTime(); // Note: reversed to check past dates
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    // If shift was more than 2 days ago, it's past the removal window
    return diffDays > 2;
  };

  const isPastMonth = (): boolean => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    // If selected year is before current year, it's in the past
    if (selectedYear < currentYear) return true;

    // If same year but selected month is before current month, it's in the past
    if (selectedYear === currentYear && selectedMonth < currentMonth) return true;

    return false;
  };

  const canUserModifySchedule = (): boolean => {
    // Admins can always modify any schedule
    if (user?.role === 'admin') return true;

    // Regular users cannot modify past months
    if (isPastMonth()) return false;

    return true;
  };

  const canUserRemoveFromShift = (officer: Officer, shiftDate: Date): boolean => {
    // Admin can always remove anyone
    if (user?.role === 'admin') return true;

    // Check if schedule can be modified
    if (!canUserModifySchedule()) return false;

    // Regular users can only remove themselves
    const isOwnShift = officer.name === getCurrentOfficerFormatted() || officer.name === user?.name;
    if (!isOwnShift) return false;

    // Cannot remove if shift is within 2 days (upcoming)
    if (isShiftWithinDays(shiftDate, 2)) return false;

    // Cannot remove if shift was more than 2 days ago (past)
    if (isShiftPastRemovalWindow(shiftDate)) return false;

    return true;
  };

  const hasUserSignedUpForSlot = (date: Date, slotType: 'morning' | 'afternoon') => {
    const currentOfficerName = getCurrentOfficerFormatted();
    const targetSlot = schedule.find(slot =>
      slot.date.toDateString() === date.toDateString()
    );

    if (!targetSlot) return false;

    if (slotType === 'morning') {
      return targetSlot.morningSlot.officers.some(officer =>
        officer.name === currentOfficerName || officer.name === user?.name
      );
    } else {
      return targetSlot.afternoonSlot.officers.some(officer =>
        officer.name === currentOfficerName || officer.name === user?.name
      );
    }
  };

  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    // Load initial schedule
    loadSchedule();

    // Set up real-time listener
    const unsubscribe = setupRealtimeListener();

    // Clean up listener on unmount or month/year change
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAllUsers();
    }
  }, [user]);

  const fetchAllUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      if (response.ok) {
        const users = await response.json();
        // Get all users for schedule assignment (including admins)
        setAllUsers(users);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };


  const generateSchedule = () => {
    const slots: TimeSlot[] = [];
    const year = selectedYear;
    const month = selectedMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayName = dayNames[date.getDay()];

      // Skip weekends for this example
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        const defaultMorning = getDefaultShiftWindow('morning', date);
        const defaultAfternoon = getDefaultShiftWindow('afternoon', date);
        slots.push({
          id: `${year}-${month}-${day}`,
          date: date,
          dayName: dayName,
          morningSlot: {
            time: defaultMorning,
            available: true,
            officers: [],
          },
          afternoonSlot: {
            time: defaultAfternoon,
            available: true,
            officers: [],
          }
        });
      }
    }

    return slots;
  };

  const loadSchedule = async () => {
    try {
      // Get fresh token if available
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/schedule?month=${selectedMonth}&year=${selectedYear}`, {
        headers
      });
      if (response.ok) {
        const data = await response.json();
        if (data.schedule && data.schedule.length > 0) {
          // Convert date strings back to Date objects and migrate data structure
          const scheduleWithDates = data.schedule.map((slot: TimeSlot) => {
            const slotDate = new Date(slot.date);
            return {
              ...migrateSlotData(slot, slotDate),
              date: slotDate
            };
          });
          setSchedule(scheduleWithDates);
        } else {
          // No saved schedule, generate new one
          const newSchedule = generateSchedule();
          setSchedule(newSchedule);
        }
      } else {
        // Fallback to generated schedule
        const newSchedule = generateSchedule();
        setSchedule(newSchedule);
      }
    } catch (error) {
      console.error('Error loading schedule:', error);
      // Fallback to generated schedule
      const newSchedule = generateSchedule();
      setSchedule(newSchedule);
    } finally {
      setInitialLoading(false);
    }
  };

  const migrateSlotData = (slot: TimeSlot & {
    morningSlot?: { officer?: string; customHours?: string };
    afternoonSlot?: { officer?: string; customHours?: string }
  }, slotDate: Date) => {
    // Migrate old data structure to new structure
    const migratedSlot = { ...slot };

    const shouldUseUpdatedRules = usesUpdatedShiftPolicy(slotDate);
    const ensureTime = (time: string | undefined, slotType: 'morning' | 'afternoon') => {
      if (shouldUseUpdatedRules) {
        return getDefaultShiftWindow(slotType, slotDate);
      }
      return time || getDefaultShiftWindow(slotType, slotDate);
    };

    // Handle morning slot migration
    if (slot.morningSlot) {
      const updatedTime = ensureTime(slot.morningSlot.time, 'morning');

      if (slot.morningSlot.officer && !slot.morningSlot.officers) {
        // Old structure: has officer field, migrate to officers array
        const officers = slot.morningSlot.officer ? [{
          name: slot.morningSlot.officer,
          customHours: slot.morningSlot.customHours
        }] : [];
        migratedSlot.morningSlot = {
          time: updatedTime,
          available: true,
          officers: officers
        };
      } else if (!slot.morningSlot.officers) {
        // No officers array, create empty one
        migratedSlot.morningSlot = {
          ...slot.morningSlot,
          time: updatedTime,
          officers: [],
          available: true
        };
      } else {
        // Already has officers array, fix availability if inconsistent
        migratedSlot.morningSlot = {
          ...slot.morningSlot,
          time: updatedTime,
          available: true,
        };
      }
    }

    // Handle afternoon slot migration
    if (slot.afternoonSlot) {
      const updatedTime = ensureTime(slot.afternoonSlot.time, 'afternoon');

      if (slot.afternoonSlot.officer && !slot.afternoonSlot.officers) {
        // Old structure: has officer field, migrate to officers array
        const officers = slot.afternoonSlot.officer ? [{
          name: slot.afternoonSlot.officer,
          customHours: slot.afternoonSlot.customHours
        }] : [];
        migratedSlot.afternoonSlot = {
          time: updatedTime,
          available: true,
          officers: officers
        };
      } else if (!slot.afternoonSlot.officers) {
        // No officers array, create empty one
        migratedSlot.afternoonSlot = {
          ...slot.afternoonSlot,
          time: updatedTime,
          officers: [],
          available: true
        };
      } else {
        // Already has officers array, fix availability if inconsistent
        migratedSlot.afternoonSlot = {
          ...slot.afternoonSlot,
          time: updatedTime,
          available: true,
        };
      }
    }

    return migratedSlot;
  };

  const setupRealtimeListener = () => {
    if (!isFirestoreInitialized(db)) {
      console.warn('Firebase/Firestore not properly initialized. Real-time updates disabled.');
      return null;
    }

    try {
      const scheduleId = `${selectedYear}-${selectedMonth}`;
      const scheduleRef = doc(db, 'schedules', scheduleId);

      const unsubscribe = onSnapshot(scheduleRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          if (data.schedule && data.schedule.length > 0) {
            // Convert date strings back to Date objects and migrate data structure
            const scheduleWithDates = data.schedule.map((slot: TimeSlot) => {
              const slotDate = new Date(slot.date);
              return {
                ...migrateSlotData(slot, slotDate),
                date: slotDate
              };
            });

            setSchedule(scheduleWithDates);
          }
        }
      }, (error) => {
        console.error('Error listening to schedule changes:', error);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up real-time listener:', error);
      return null;
    }
  };

  const saveSchedule = async (updatedSchedule: TimeSlot[]) => {
    try {
      // Get fresh token if available
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Saving schedule to API
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          schedule: updatedSchedule
        })
      });

      if (response.ok) {
        // Schedule saved successfully - update local state immediately
        setSchedule(updatedSchedule);
      } else {
        const errorData = await response.text();
        // API returned error response

        // Show user-friendly error message
        if (response.status === 403) {
          toast.error('Permission denied. Please check with your administrator.');
        } else if (response.status === 401) {
          toast.error('Authentication required. Please log in again.');
        } else {
          toast.error('Failed to save schedule. Please try again.');
        }

        throw new Error(`HTTP ${response.status}: ${errorData}`);
      }
    } catch (error) {
      console.error('Error saving schedule:', error);
      throw error;
    }
  };


  const handleSignUp = async (slotId: string, slotType: 'morning' | 'afternoon', customHours: string) => {
    // Check if user can modify schedule
    if (!canUserModifySchedule()) {
      toast.error('Cannot modify past months\' schedules. Only current and future months can be edited.');
      return;
    }

    if (!user?.name) {
      toast.error('User authentication failed. Please log in again.');
      return;
    }

    if (!customHours.trim()) {
      toast.error('Please specify custom hours for your shift.');
      return;
    }

    setLoading(true);

    try {
      const slot = schedule.find(s => s.id === slotId);
      if (!slot) {
        toast.error('Shift not found. Please refresh the page and try again.');
        return;
      }

      const currentOfficer = getCurrentOfficerFormatted();
      const targetSlot = slotType === 'morning' ? slot.morningSlot : slot.afternoonSlot;
      const blockMinutes = getShiftMaxBlockMinutes(slot.date);

      // Check if officer is already signed up
      const alreadySignedUp = targetSlot.officers.some(officer => officer.name === currentOfficer);
      if (alreadySignedUp) {
        toast.error('You are already signed up for this shift');
        return;
      }

      // Parse the custom hours into time ranges
      const newTimeRanges = parseTimeString(customHours);
      if (newTimeRanges.length === 0) {
        toast.error('Invalid time format. Please use HHMM-HHMM (e.g., "0600-1200") or HH:MM-HH:MM, with commas for split shifts.');
        return;
      }

      const shiftStart = targetSlot.time.split('-')[0];
      const shiftEnd = targetSlot.time.split('-')[1];

      const outsideWindow = newTimeRanges.some((range) => !isRangeWithinShiftWindow(range, shiftStart, shiftEnd));
      if (outsideWindow) {
        toast.error('Selected hours must stay within the scheduled shift window.');
        return;
      }

      if (blockMinutes) {
        if (newTimeRanges.length !== 1) {
          toast.error('This shift allows only one continuous block inside the window.');
          return;
        }
        const duration = getTimeRangeDurationMinutes(newTimeRanges[0]);
        if (duration > blockMinutes) {
          toast.error(`Please limit your signup to at most ${blockMinutes / 60} consecutive hours.`);
          return;
        }
      }

      // Convert existing officers to OfficerShift format
      const existingOfficerShifts: OfficerShift[] = targetSlot.officers.map(officer => ({
        name: officer.name,
        timeRanges: parseTimeString(officer.customHours || targetSlot.time)
      }));

      // Validate if the new shift can be added
      const validation = canAddOfficerShift(
        existingOfficerShifts,
        currentOfficer,
        newTimeRanges,
        shiftStart, // shift start
        shiftEnd  // shift end
      );

      if (!validation.valid) {
        toast.error(validation.conflicts.join('. '));
        return;
      }

      // Update the schedule
      const updatedSchedule = schedule.map(s => {
        if (s.id === slotId) {
          const newOfficer: Officer = {
            name: currentOfficer,
            customHours: customHours !== targetSlot.time ? customHours : undefined
          };

          if (slotType === 'morning') {
            const updatedOfficers = [...s.morningSlot.officers, newOfficer];
            return {
              ...s,
              morningSlot: {
                ...s.morningSlot,
                officers: updatedOfficers,
                available: true // Always true now since we check hourly availability
              }
            };
          } else {
            const updatedOfficers = [...s.afternoonSlot.officers, newOfficer];
            return {
              ...s,
              afternoonSlot: {
                ...s.afternoonSlot,
                officers: updatedOfficers,
                available: true // Always true now since we check hourly availability
              }
            };
          }
        }
        return s;
      });

      // Don't update local state - let real-time listener handle it
      await saveSchedule(updatedSchedule);
      toast.success(`Successfully signed up for ${customHours} shift`);
    } catch (error) {
      console.error('Signup error:', error);
      toast.error('Failed to sign up for shift. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveOfficer = async (slotId: string, slotType: 'morning' | 'afternoon', officerToRemove: string) => {
    if (!officerToRemove?.trim()) {
      toast.error('Invalid officer information. Cannot remove from shift.');
      return;
    }

    const slot = schedule.find(s => s.id === slotId);
    if (!slot) {
      toast.error('Shift not found. Please refresh the page and try again.');
      return;
    }

    // Check permissions
    const isAdmin = user?.role === 'admin';
    const isOwnShift = officerToRemove === getCurrentOfficerFormatted() || officerToRemove === user?.name;

    // Check if user can modify schedule (past month restriction)
    if (!isAdmin && isPastMonth()) {
      toast.error('Cannot modify past months\' schedules. Only current and future months can be edited.');
      return;
    }

    if (!isAdmin && !isOwnShift) {
      toast.error('You can only remove yourself from shifts.');
      return;
    }

    // Check 2-day restriction for non-admins (both future and past)
    if (!isAdmin) {
      if (isShiftWithinDays(slot.date, 2)) {
        toast.error('Cannot remove yourself from shifts within 2 days of the scheduled date.');
        return;
      }
      if (isShiftPastRemovalWindow(slot.date)) {
        toast.error('Cannot remove yourself from shifts more than 2 days after the scheduled date.');
        return;
      }
    }

    const targetSlot = slotType === 'morning' ? slot.morningSlot : slot.afternoonSlot;
    if (!targetSlot.officers.some(officer => officer.name === officerToRemove)) {
      toast.error('Officer not found in this shift.');
      return;
    }

    setLoading(true);

    try {
      const updatedSchedule = schedule.map(slot => {
        if (slot.id === slotId) {
          if (slotType === 'morning') {
            const updatedOfficers = slot.morningSlot.officers.filter(officer => officer.name !== officerToRemove);
            return {
              ...slot,
              morningSlot: {
                ...slot.morningSlot,
                officers: updatedOfficers,
                available: true // Always true now since we check hourly availability
              }
            };
          } else {
            const updatedOfficers = slot.afternoonSlot.officers.filter(officer => officer.name !== officerToRemove);
            return {
              ...slot,
              afternoonSlot: {
                ...slot.afternoonSlot,
                officers: updatedOfficers,
                available: true // Always true now since we check hourly availability
              }
            };
          }
        }
        return slot;
      });

      await saveSchedule(updatedSchedule);
      const successMessage = isAdmin
        ? `Successfully removed ${officerToRemove} from shift`
        : 'Successfully removed yourself from shift';
      toast.success(successMessage);
    } catch (error) {
      console.error('Remove officer error:', error);
      toast.error('Failed to remove officer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminAssign = async (slotId: string, slotType: 'morning' | 'afternoon', officerName: string, customHours?: string) => {
    if (!user?.role || user.role !== 'admin') {
      toast.error('Only administrators can assign officers to shifts.');
      return;
    }

    if (!officerName?.trim()) {
      toast.error('Please select an officer to assign to the shift.');
      return;
    }

    const slot = schedule.find(s => s.id === slotId);
    if (!slot) {
      toast.error('Shift not found. Please refresh the page and try again.');
      return;
    }

    const targetSlot = slotType === 'morning' ? slot.morningSlot : slot.afternoonSlot;
    const blockMinutes = getShiftMaxBlockMinutes(slot.date);

    // Check if officer is already assigned
    const alreadyAssigned = targetSlot.officers.some(officer => officer.name === officerName);
    if (alreadyAssigned) {
      toast.error('Officer is already assigned to this shift');
      return;
    }

    // If no custom hours provided, use default shift hours
    const hoursToAssign = customHours || targetSlot.time;

    // Parse the hours into time ranges
    const newTimeRanges = parseTimeString(hoursToAssign);
    if (newTimeRanges.length === 0) {
      toast.error('Invalid time format. Please use HHMM-HHMM (e.g., "1400-2000") or HH:MM-HH:MM for split shifts.');
      return;
    }

    const shiftStart = targetSlot.time.split('-')[0];
    const shiftEnd = targetSlot.time.split('-')[1];

    const outsideWindow = newTimeRanges.some((range) => !isRangeWithinShiftWindow(range, shiftStart, shiftEnd));
    if (outsideWindow) {
      toast.error('Assigned hours must remain within the scheduled shift window.');
      return;
    }

    if (blockMinutes) {
      if (newTimeRanges.length !== 1) {
        toast.error('Only one continuous block can be assigned per shift.');
        return;
      }
      const duration = getTimeRangeDurationMinutes(newTimeRanges[0]);
      if (duration > blockMinutes) {
        toast.error(`Assigned hours cannot exceed ${blockMinutes / 60} consecutive hours.`);
        return;
      }
    }

    // Convert existing officers to OfficerShift format
    const existingOfficerShifts: OfficerShift[] = targetSlot.officers.map(officer => ({
      name: officer.name,
      timeRanges: parseTimeString(officer.customHours || targetSlot.time)
    }));

    // Validate if the new shift can be added
    const validation = canAddOfficerShift(
      existingOfficerShifts,
      officerName,
      newTimeRanges,
      shiftStart,
      shiftEnd
    );

    if (!validation.valid) {
      toast.error(validation.conflicts.join('. '));
      return;
    }

    setLoading(true);

    try {
      const updatedSchedule = schedule.map(s => {
        if (s.id === slotId) {
          const newOfficer: Officer = {
            name: officerName,
            customHours: customHours || undefined
          };

          if (slotType === 'morning') {
            const updatedOfficers = [...s.morningSlot.officers, newOfficer];
            return {
              ...s,
              morningSlot: {
                ...s.morningSlot,
                officers: updatedOfficers,
                available: true // Always true now since we check hourly availability
              }
            };
          } else {
            const updatedOfficers = [...s.afternoonSlot.officers, newOfficer];
            return {
              ...s,
              afternoonSlot: {
                ...s.afternoonSlot,
                officers: updatedOfficers,
                available: true // Always true now since we check hourly availability
              }
            };
          }
        }
        return s;
      });

      await saveSchedule(updatedSchedule);
      toast.success(`Successfully assigned ${officerName} to shift`);
    } catch (error) {
      console.error('Admin assign error:', error);
      toast.error('Failed to assign officer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get display text for available time slots
  const getAvailabilityDisplay = (
    slot: TimeSlot,
    slotType: 'morning' | 'afternoon',
    summary?: { availableSlots: string[]; status: 'past' | 'ongoing' | 'upcoming' }
  ): React.ReactElement => {
    const computedSummary = summary ?? getShiftAvailabilitySummary(slot, slotType);

    if (computedSummary.status === 'past') {
      return <span className="text-2xs sm:text-sm text-muted-foreground">Shift closed</span>;
    }

    if (computedSummary.availableSlots.length === 0) {
      return <span className="text-2xs sm:text-sm text-muted-foreground">No slots available</span>;
    }

    return (
      <div className="text-2xs sm:text-xs text-muted-foreground italic">
        Available:{' '}
        {computedSummary.availableSlots
          .map((slotRange) => (slotRange.includes(':') ? slotRange : displayTime(slotRange)))
          .join(', ')}
      </div>
    );
  };

  // Helper function to calculate hours from time string (e.g., "6am-2pm" = 8 hours or "0500-1300" = 8 hours)
  const calculateHoursFromTimeString = (timeStr: string): number => {
    if (!timeStr) return 0;

    // Handle 24-hour format like "0500-1300" or "1300-2200"
    const militaryMatch = timeStr.match(/(\d{4})-(\d{4})/);
    if (militaryMatch) {
      const [, startStr, endStr] = militaryMatch;
      const startHour = parseInt(startStr.slice(0, 2));
      const startMin = parseInt(startStr.slice(2, 4));
      const endHour = parseInt(endStr.slice(0, 2));
      const endMin = parseInt(endStr.slice(2, 4));

      // Convert to total minutes
      const startMinutes = startHour * 60 + startMin;
      let endMinutes = endHour * 60 + endMin;

      // Handle overnight shifts
      if (endMinutes < startMinutes) {
        endMinutes += 24 * 60; // Add 24 hours
      }

      // Calculate hours (with decimal for partial hours)
      return (endMinutes - startMinutes) / 60;
    }

    // Handle 12-hour format like "6am-2pm", "10pm-6am", "12am-8am"
    const ampmMatch = timeStr.match(/(\d+)(am|pm)-(\d+)(am|pm)/i);
    if (ampmMatch) {
      const [, startHour, startPeriod, endHour, endPeriod] = ampmMatch;

      // Convert to 24-hour format
      let start = parseInt(startHour);
      let end = parseInt(endHour);

      // Handle 12am/12pm special cases
      if (start === 12 && startPeriod.toLowerCase() === 'am') start = 0;
      else if (start !== 12 && startPeriod.toLowerCase() === 'pm') start += 12;

      if (end === 12 && endPeriod.toLowerCase() === 'am') end = 0;
      else if (end !== 12 && endPeriod.toLowerCase() === 'pm') end += 12;

      // Calculate hours, handling overnight shifts
      let hours = end - start;
      if (hours < 0) hours += 24; // Overnight shift

      return hours;
    }

    // Handle time format like "05:00-13:00"
    const colonMatch = timeStr.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
    if (colonMatch) {
      const [, startHour, startMin, endHour, endMin] = colonMatch;
      const startMinutes = parseInt(startHour) * 60 + parseInt(startMin);
      let endMinutes = parseInt(endHour) * 60 + parseInt(endMin);

      // Handle overnight shifts
      if (endMinutes < startMinutes) {
        endMinutes += 24 * 60; // Add 24 hours
      }

      return (endMinutes - startMinutes) / 60;
    }

    return 0; // Couldn't parse the time format
  };

  const generatePDF = async () => {
    if (!schedule || schedule.length === 0) {
      toast.error('No schedule data available to export. Please wait for the schedule to load.');
      return;
    }

    const toastId = toast.loading('Generating PDF...');

    try {
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF();

      // Add logo
      const logoImg = new Image();
      logoImg.src = '/logo-cool.png';
      await new Promise((resolve) => {
        logoImg.onload = resolve;
      });

      // Add logo to PDF (positioned at top left)
      const logoWidth = 30;
      const logoHeight = 30;
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.addImage(logoImg, 'PNG', 20, 15, logoWidth, logoHeight);

      // Header (positioned to the right of logo)
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('CHEVERLY POLICE DEPARTMENT', 60, 25);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('Metro Overtime Schedule', 60, 35);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`${monthNames[selectedMonth]} ${selectedYear}`, 60, 45);

      // Helper function to normalize officer names for consistent grouping
      const normalizeOfficerName = (name: string): string => {
        // Extract the ID number and use it as part of the key
        const idMatch = name.match(/#(\d+)/);
        const id = idMatch ? idMatch[1] : '';

        // Normalize the rank prefix - treat "Officer" and "Ofc." as the same
        let normalizedName = name;
        if (name.startsWith('Officer ')) {
          // Replace "Officer " with "Ofc. " for consistency
          normalizedName = name.replace(/^Officer\s+/, 'Ofc. ');
        }

        // Extract the last name after normalizing the rank
        const nameMatch = normalizedName.match(/(?:Ofc\.|PFC\.|Cpl\.|Sgt\.|Lt\.|Capt\.|Chief)\.?\s+([A-Za-z]+)/i);
        const lastName = nameMatch ? nameMatch[1] : normalizedName;

        // Return a normalized key combining last name and ID
        return `${lastName.toUpperCase()}_${id}`;
      };

      // Helper function to standardize display names
      const standardizeDisplayName = (name: string): string => {
        // If the name starts with "Officer ", replace it with "Ofc. " for consistency
        if (name.startsWith('Officer ')) {
          return name.replace(/^Officer\s+/, 'Ofc. ');
        }
        return name;
      };

      // Prepare table data and calculate total hours and payments
      const tableData: Array<[string, string, string]> = [];
      let totalHoursWorked = 0;
      const officerHours: Record<string, number> = {};
      const officerPayments: Record<string, {
        displayName: string;
        hours: number;
        rate: number;
        payment: number
      }> = {};

      schedule.forEach(slot => {
        // Only process days that have at least one officer assigned
        const hasMorningOfficers = slot.morningSlot.officers.length > 0;
        const hasAfternoonOfficers = slot.afternoonSlot.officers.length > 0;

        // Skip this day entirely if no officers are assigned
        if (!hasMorningOfficers && !hasAfternoonOfficers) {
          return;
        }

        let dayShown = false;

        // Morning slot - only show if officers are assigned
        if (hasMorningOfficers) {
          slot.morningSlot.officers.forEach((officer) => {
            const displayTime = officer.customHours ||
              `${slot.morningSlot.time.slice(0, 2)}:${slot.morningSlot.time.slice(2, 4)}-${slot.morningSlot.time.slice(5, 7)}:${slot.morningSlot.time.slice(7, 9)}`;

            // Calculate hours for this shift
            const hours = calculateHoursFromTimeString(officer.customHours || slot.morningSlot.time);
            totalHoursWorked += hours;

            // Use normalized name for grouping
            const normalizedKey = normalizeOfficerName(officer.name);
            officerHours[normalizedKey] = (officerHours[normalizedKey] || 0) + hours;

            // Calculate payment
            const rank = extractRankFromOfficerName(officer.name);
            const rate = calculateOfficerPayRate(rank);

            if (!officerPayments[normalizedKey]) {
              officerPayments[normalizedKey] = {
                displayName: standardizeDisplayName(officer.name),
                hours: 0,
                rate,
                payment: 0
              };
            }
            officerPayments[normalizedKey].hours += hours;
            officerPayments[normalizedKey].payment += hours * rate;

            tableData.push([
              !dayShown ? `${slot.dayName} ${formatDate(slot.date)}` : '',
              displayTime,
              officer.name
            ]);
            dayShown = true;
          });
        }

        // Afternoon slot - only show if officers are assigned
        if (hasAfternoonOfficers) {
          slot.afternoonSlot.officers.forEach((officer) => {
            const displayTime = officer.customHours ||
              `${slot.afternoonSlot.time.slice(0, 2)}:${slot.afternoonSlot.time.slice(2, 4)}-${slot.afternoonSlot.time.slice(5, 7)}:${slot.afternoonSlot.time.slice(7, 9)}`;

            // Calculate hours for this shift
            const hours = calculateHoursFromTimeString(officer.customHours || slot.afternoonSlot.time);
            totalHoursWorked += hours;

            // Use normalized name for grouping
            const normalizedKey = normalizeOfficerName(officer.name);
            officerHours[normalizedKey] = (officerHours[normalizedKey] || 0) + hours;

            // Calculate payment
            const rank = extractRankFromOfficerName(officer.name);
            const rate = calculateOfficerPayRate(rank);

            if (!officerPayments[normalizedKey]) {
              officerPayments[normalizedKey] = {
                displayName: standardizeDisplayName(officer.name),
                hours: 0,
                rate,
                payment: 0
              };
            }
            officerPayments[normalizedKey].hours += hours;
            officerPayments[normalizedKey].payment += hours * rate;

            tableData.push([
              !dayShown ? `${slot.dayName} ${formatDate(slot.date)}` : '',
              hasAfternoonOfficers && hasMorningOfficers ? `and/or ${displayTime}` : displayTime,
              officer.name
            ]);
            dayShown = true;
          });
        }
      });

      // Add a line separator
      doc.setLineWidth(0.5);
      doc.line(20, 55, pageWidth - 20, 55);

      // Add table with more compact settings
      autoTable(doc, {
        head: [['DATE', 'TIME', 'OFFICER ASSIGNMENT']],
        body: tableData,
        startY: 60,
        margin: { left: 15, right: 15 },
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          minCellHeight: 6,
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
          font: 'helvetica',
          fillColor: [255, 255, 255], // Explicitly set white background
          textColor: [0, 0, 0], // Black text
        },
        headStyles: {
          fillColor: [25, 35, 120], // Professional navy blue
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          minCellHeight: 8,
          cellPadding: 2,
        },
        bodyStyles: {
          fillColor: [255, 255, 255], // Explicitly set white background for body cells
        },
        columnStyles: {
          0: { cellWidth: 45, halign: 'left', fontStyle: 'bold' }, // Date column
          1: { cellWidth: 35, halign: 'center' }, // Time column  
          2: { cellWidth: 'auto', halign: 'left' }, // Officer column
        },
        tableLineColor: [180, 180, 180],
        tableLineWidth: 0.15,
        rowPageBreak: 'avoid',
      });

      // Add Payment Summary section
      // @ts-expect-error jspdf-autotable adds lastAutoTable property
      const finalY = doc.lastAutoTable?.finalY || 180;
      const summaryY = finalY + 15;

      // Check if we need a new page for the summary
      let currentY: number;
      if (summaryY > 220) {
        doc.addPage();
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Summary', 20, 20);
        currentY = 35;
      } else {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Summary', 20, summaryY);
        currentY = summaryY + 15;
      }

      // Create payment summary table
      const paymentTableData: Array<[string, string, string, string, string]> = [];
      let grandTotal = 0;

      Object.entries(officerPayments)
        .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName))
        .forEach(([, data]) => {
          paymentTableData.push([
            data.displayName,
            `${data.hours}`,
            `$${data.rate.toFixed(2)}`,
            `$${data.payment.toFixed(2)}`,
            extractRankFromOfficerName(data.displayName) || 'Unknown'
          ]);
          grandTotal += data.payment;
        });

      // Add payment details table
      autoTable(doc, {
        head: [['OFFICER', 'HOURS', 'RATE/HR', 'TOTAL PAY', 'RANK']],
        body: paymentTableData,
        startY: currentY,
        margin: { left: 15, right: 15 },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          minCellHeight: 7,
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
          font: 'helvetica',
        },
        headStyles: {
          fillColor: [25, 35, 120],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 65, halign: 'left' }, // Officer name
          1: { cellWidth: 25, halign: 'center' }, // Hours
          2: { cellWidth: 25, halign: 'center' }, // Rate
          3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }, // Total Pay
          4: { cellWidth: 35, halign: 'center' }, // Rank
        },
        footStyles: {
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          fontSize: 10,
        },
        foot: [['GRAND TOTAL', `${totalHoursWorked}`, '', `$${grandTotal.toFixed(2)}`, '']],
      });

      // Add payment notes
      // @ts-expect-error jspdf-autotable adds lastAutoTable property
      const paymentTableY = doc.lastAutoTable?.finalY || 100;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text('Pay Rates: Sgt. and above = $65/hr | Below Sgt. = $60/hr', 20, paymentTableY + 10);

      // Reset text color
      doc.setTextColor(0, 0, 0);

      doc.save(`metro-schedule-${monthNames[selectedMonth].toLowerCase()}-${selectedYear}.pdf`);
      toast.dismiss(toastId);
      toast.success('PDF exported successfully!');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.dismiss(toastId);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  const generateBillablePDF = async () => {
    if (!schedule || schedule.length === 0) {
      toast.error('No schedule data available to export. Please wait for the schedule to load.');
      return;
    }

    const toastId = toast.loading('Generating billable PDF...');

    try {
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF();

      // Add logo
      const logoImg = new Image();
      logoImg.src = '/logo-cool.png';
      await new Promise((resolve) => {
        logoImg.onload = resolve;
      });

      // Add logo to PDF (positioned at top left)
      const logoWidth = 30;
      const logoHeight = 30;
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.addImage(logoImg, 'PNG', 20, 15, logoWidth, logoHeight);

      // Header (positioned to the right of logo)
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('CHEVERLY POLICE DEPARTMENT', 60, 25);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('Metro Overtime Schedule - Billable', 60, 35);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`${monthNames[selectedMonth]} ${selectedYear}`, 60, 45);

      // Helper function to normalize officer names for consistent grouping
      const normalizeOfficerName = (name: string): string => {
        // Extract the ID number and use it as part of the key
        const idMatch = name.match(/#(\d+)/);
        const id = idMatch ? idMatch[1] : '';

        // Normalize the rank prefix - treat "Officer" and "Ofc." as the same
        let normalizedName = name;
        if (name.startsWith('Officer ')) {
          // Replace "Officer " with "Ofc. " for consistency
          normalizedName = name.replace(/^Officer\s+/, 'Ofc. ');
        }

        // Extract the last name after normalizing the rank
        const nameMatch = normalizedName.match(/(?:Ofc\.|PFC\.|Cpl\.|Sgt\.|Lt\.|Capt\.|Chief)\.?\s+([A-Za-z]+)/i);
        const lastName = nameMatch ? nameMatch[1] : normalizedName;

        // Return a normalized key combining last name and ID
        return `${lastName.toUpperCase()}_${id}`;
      };

      // Helper function to standardize display names
      const standardizeDisplayName = (name: string): string => {
        // If the name starts with "Officer ", replace it with "Ofc. " for consistency
        if (name.startsWith('Officer ')) {
          return name.replace(/^Officer\s+/, 'Ofc. ');
        }
        return name;
      };

      // Prepare table data and calculate total hours and payments with service charge
      const tableData: Array<[string, string, string]> = [];
      let totalHoursWorked = 0;
      const officerHours: Record<string, number> = {};
      const officerPayments: Record<string, {
        displayName: string; // Store the display name
        hours: number;
        rate: number;
        payment: number;
        billableRate: number;
        billableAmount: number
      }> = {};

      schedule.forEach(slot => {
        // Only process days that have at least one officer assigned
        const hasMorningOfficers = slot.morningSlot.officers.length > 0;
        const hasAfternoonOfficers = slot.afternoonSlot.officers.length > 0;

        // Skip this day entirely if no officers are assigned
        if (!hasMorningOfficers && !hasAfternoonOfficers) {
          return;
        }

        let dayShown = false;

        // Morning slot - only show if officers are assigned
        if (hasMorningOfficers) {
          slot.morningSlot.officers.forEach((officer) => {
            const displayTime = officer.customHours ||
              `${slot.morningSlot.time.slice(0, 2)}:${slot.morningSlot.time.slice(2, 4)}-${slot.morningSlot.time.slice(5, 7)}:${slot.morningSlot.time.slice(7, 9)}`;

            // Calculate hours for this shift
            const hours = calculateHoursFromTimeString(officer.customHours || slot.morningSlot.time);
            totalHoursWorked += hours;

            // Use normalized name for grouping
            const normalizedKey = normalizeOfficerName(officer.name);
            officerHours[normalizedKey] = (officerHours[normalizedKey] || 0) + hours;

            // Calculate payment with service charge
            const rank = extractRankFromOfficerName(officer.name);
            const baseRate = calculateOfficerPayRate(rank);
            const billableRate = baseRate + 10; // Add $10/hour service charge

            if (!officerPayments[normalizedKey]) {
              officerPayments[normalizedKey] = {
                displayName: standardizeDisplayName(officer.name), // Store standardized name for display
                hours: 0,
                rate: baseRate,
                payment: 0,
                billableRate: billableRate,
                billableAmount: 0
              };
            }
            officerPayments[normalizedKey].hours += hours;
            officerPayments[normalizedKey].payment += hours * baseRate;
            officerPayments[normalizedKey].billableAmount += hours * billableRate;

            tableData.push([
              !dayShown ? `${slot.dayName} ${formatDate(slot.date)}` : '',
              displayTime,
              officer.name
            ]);
            dayShown = true;
          });
        }

        // Afternoon slot - only show if officers are assigned
        if (hasAfternoonOfficers) {
          slot.afternoonSlot.officers.forEach((officer) => {
            const displayTime = officer.customHours ||
              `${slot.afternoonSlot.time.slice(0, 2)}:${slot.afternoonSlot.time.slice(2, 4)}-${slot.afternoonSlot.time.slice(5, 7)}:${slot.afternoonSlot.time.slice(7, 9)}`;

            // Calculate hours for this shift
            const hours = calculateHoursFromTimeString(officer.customHours || slot.afternoonSlot.time);
            totalHoursWorked += hours;

            // Use normalized name for grouping
            const normalizedKey = normalizeOfficerName(officer.name);
            officerHours[normalizedKey] = (officerHours[normalizedKey] || 0) + hours;

            // Calculate payment with service charge
            const rank = extractRankFromOfficerName(officer.name);
            const baseRate = calculateOfficerPayRate(rank);
            const billableRate = baseRate + 10; // Add $10/hour service charge

            if (!officerPayments[normalizedKey]) {
              officerPayments[normalizedKey] = {
                displayName: standardizeDisplayName(officer.name), // Store standardized name for display
                hours: 0,
                rate: baseRate,
                payment: 0,
                billableRate: billableRate,
                billableAmount: 0
              };
            }
            officerPayments[normalizedKey].hours += hours;
            officerPayments[normalizedKey].payment += hours * baseRate;
            officerPayments[normalizedKey].billableAmount += hours * billableRate;

            tableData.push([
              !dayShown ? `${slot.dayName} ${formatDate(slot.date)}` : '',
              hasAfternoonOfficers && hasMorningOfficers ? `and/or ${displayTime}` : displayTime,
              officer.name
            ]);
            dayShown = true;
          });
        }
      });

      // Add a line separator
      doc.setLineWidth(0.5);
      doc.line(20, 55, pageWidth - 20, 55);

      // Add table with more compact settings
      autoTable(doc, {
        head: [['DATE', 'TIME', 'OFFICER ASSIGNMENT']],
        body: tableData,
        startY: 60,
        margin: { left: 15, right: 15 },
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          minCellHeight: 6,
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
          font: 'helvetica',
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
        },
        headStyles: {
          fillColor: [25, 35, 120],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          minCellHeight: 8,
          cellPadding: 2,
        },
        bodyStyles: {
          fillColor: [255, 255, 255],
        },
        columnStyles: {
          0: { cellWidth: 45, halign: 'left', fontStyle: 'bold' },
          1: { cellWidth: 35, halign: 'center' },
          2: { cellWidth: 'auto', halign: 'left' },
        },
        tableLineColor: [180, 180, 180],
        tableLineWidth: 0.15,
        rowPageBreak: 'avoid',
      });

      // Add Billable Payment Summary section
      // @ts-expect-error jspdf-autotable adds lastAutoTable property
      const finalY = doc.lastAutoTable?.finalY || 180;
      const summaryY = finalY + 15;

      // Check if we need a new page for the summary
      let currentY: number;
      if (summaryY > 220) {
        doc.addPage();
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Billable Payment Summary', 20, 20);
        currentY = 35;
      } else {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Billable Payment Summary', 20, summaryY);
        currentY = summaryY + 15;
      }

      // Create billable payment summary table
      const paymentTableData: Array<[string, string, string]> = [];
      let billableGrandTotal = 0;

      Object.entries(officerPayments)
        .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName))
        .forEach(([, data]) => {
          paymentTableData.push([
            data.displayName, // Use the display name instead of the normalized key
            `${data.hours}`,
            `$${data.billableAmount.toFixed(2)}`
          ]);
          billableGrandTotal += data.billableAmount;
        });

      // Add payment details table
      autoTable(doc, {
        head: [['OFFICER', 'HOURS', 'BILLABLE AMOUNT']],
        body: paymentTableData,
        startY: currentY,
        margin: { left: 15, right: 15 },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          minCellHeight: 7,
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
          font: 'helvetica',
        },
        headStyles: {
          fillColor: [25, 35, 120],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 90, halign: 'left' },
          1: { cellWidth: 40, halign: 'center' },
          2: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
        },
        footStyles: {
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          fontSize: 10,
        },
        foot: [['BILLABLE TOTAL', `${totalHoursWorked}`, `$${billableGrandTotal.toFixed(2)}`]],
      });

      // Add billing total
      // @ts-expect-error jspdf-autotable adds lastAutoTable property
      const paymentTableY = doc.lastAutoTable?.finalY || 100;

      // Total Billable Amount Box
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`TOTAL BILLABLE AMOUNT: $${billableGrandTotal.toFixed(2)}`, 20, paymentTableY + 15);

      doc.save(`metro-schedule-billable-${monthNames[selectedMonth].toLowerCase()}-${selectedYear}.pdf`);
      toast.dismiss(toastId);
      toast.success('Billable PDF exported successfully!');
    } catch (error) {
      console.error('Billable PDF generation error:', error);
      toast.dismiss(toastId);
      toast.error('Failed to generate billable PDF. Please try again.');
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const formatDate = (date: Date) => {
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
  };

  const displayTime = (time: string) => {
    if (time.includes('-') && time.includes(':')) {
      return time; // Already formatted (custom hours)
    }
    return `${time.slice(0, 2)}:${time.slice(2, 4)}-${time.slice(5, 7)}:${time.slice(7, 9)}`;
  };

  return (
    <div className="space-y-6 relative" style={{ overscrollBehavior: 'contain' }}>
      {/* iOS-style pull-to-refresh indicator */}
      {(isPulling || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-end justify-center transition-all duration-200 ease-out"
          style={{
            height: isPulling ? `${Math.min(pullDistance, 60)}px` : isRefreshing ? '60px' : '0px',
            paddingTop: 'env(safe-area-inset-top)',
          }}
        >
          <div
            className="flex items-center justify-center pb-2"
            style={{
              opacity: Math.min(pullProgress / 80, 1),
              transform: `scale(${Math.min(pullProgress / 100 + 0.3, 1)})`,
            }}
          >
            {isRefreshing ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300 rounded-full animate-spin"></div>
            ) : (
              <div
                className="text-gray-600 dark:text-gray-400 text-xs font-medium"
                style={{
                  transform: `translateY(${pullProgress >= 100 ? '0px' : '10px'})`,
                  opacity: pullProgress / 100
                }}
              >
                {pullProgress >= 100 ? '↓' : '⬇'}
              </div>
            )}
          </div>
        </div>
      )}

      <Card className="sm:mx-0 -mx-2">
        <CardHeader className="px-3 py-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div className="flex-1">
              <CardTitle className="text-xl sm:text-2xl font-bold">
                Metro Sign Up Schedule - {monthNames[selectedMonth]} {selectedYear}
                {isPastMonth() && user?.role !== 'admin' && (
                  <span className="ml-3 text-sm font-normal text-orange-600">(Read-only - Past Month)</span>
                )}
              </CardTitle>
              <CardDescription>
                {isPastMonth() && user?.role !== 'admin' ? (
                  <span className="text-orange-600">This is a past month&apos;s schedule. Modifications are not allowed.</span>
                ) : (
                  'Sign up for available overtime shifts at Cheverly Metro Station'
                )}
              </CardDescription>
            </div>
            {user?.role === 'admin' && (
              <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:mt-0">
                <Button
                  onClick={generatePDF}
                  variant="outline"
                  size="sm"
                  className="flex items-center justify-center gap-2 text-xs sm:text-sm"
                  disabled={loading}
                >
                  <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Export PDF</span>
                </Button>
                <Button
                  onClick={generateBillablePDF}
                  variant="outline"
                  size="sm"
                  className="flex items-center justify-center gap-2 text-xs sm:text-sm"
                  disabled={loading}
                >
                  <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Billable PDF</span>
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 sm:p-6 pt-0 sm:pt-0">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <Label className="text-xs sm:text-sm">Month:</Label>
              <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(Number(value))}>
                <SelectTrigger className="w-full sm:w-40 h-9 text-sm">
                  <SelectValue placeholder={monthNames[selectedMonth]} />
                </SelectTrigger>
                <SelectContent 
                  side="bottom" 
                  align="start"
                  className="max-h-[50vh] sm:max-h-96"
                >
                  {monthNames.map((month, index) => (
                    <SelectItem key={month} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <Label className="text-xs sm:text-sm">Year:</Label>
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(Number(value))}>
                <SelectTrigger className="w-full sm:w-28 h-9 text-sm">
                  <SelectValue placeholder={selectedYear.toString()} />
                </SelectTrigger>
                <SelectContent 
                  side="bottom" 
                  align="start"
                  className="max-h-[50vh] sm:max-h-96"
                >
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {initialLoading ? (
            <ScheduleSkeleton />
          ) : (
            <div className="space-y-6">
              <div className="border rounded-md overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-navy-900 text-white">
                      <th className="text-left p-1.5 sm:p-2 font-semibold text-xs sm:text-sm">Date/Time</th>
                      <th className="text-left p-1.5 sm:p-2 font-semibold text-xs sm:text-sm">Officer Name</th>
                      <th className="text-center p-2 sm:p-2 font-semibold text-xs sm:text-sm">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center p-4 sm:p-8 text-xs sm:text-sm text-muted-foreground">
                          No shifts available for this month
                        </td>
                      </tr>
                    ) : (
                      schedule.map((slot) => {
                        const slotDate = new Date(slot.date);
                        const isToday = isSameDay(slotDate);
                        const morningSummary = getShiftAvailabilitySummary(slot, 'morning');
                        const afternoonSummary = getShiftAvailabilitySummary(slot, 'afternoon');
                        const morningAvailableSlots = morningSummary.availableSlots;
                        const afternoonAvailableSlots = afternoonSummary.availableSlots;
                        const morningRemainingCapacity = morningSummary.maxRemaining;
                        const afternoonRemainingCapacity = afternoonSummary.maxRemaining;

                        return (
                          <React.Fragment key={slot.id}>
                            <tr key={`${slot.id}-morning`} className={cn('border-t hover:bg-muted/50', isToday && 'bg-primary/5')}>
                              <td className="p-1.5 sm:py-1.5 sm:px-2">
                                {isToday && (
                                  <Badge variant="outline" className="mb-1 hidden sm:inline-flex border-emerald-500 text-emerald-600">
                                    Today
                                  </Badge>
                                )}
                                <div className="font-semibold text-foreground text-2xs sm:text-sm">
                                  <div className="sm:hidden flex items-center gap-2">
                                    {isToday && (
                                      <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                                        Today
                                      </span>
                                    )}
                                    {new Date(slot.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                                  </div>
                                  <div className="hidden sm:inline">{slot.dayName} {formatDate(slot.date)}</div>
                                </div>
                                <div className="text-2xs sm:text-sm text-muted-foreground">
                                  {displayTime(slot.morningSlot.time)}
                                </div>
                              </td>
                              <td className="p-1.5 sm:py-1.5 sm:px-2">
                                <div className="mb-1 flex items-center gap-2 text-2xs sm:text-xs uppercase tracking-wide text-muted-foreground">
                                  Morning
                                  <Badge
                                    className={cn(
                                      'text-2xs',
                                      morningSummary.status === 'past'
                                        ? 'bg-muted text-muted-foreground'
                                        : morningRemainingCapacity > 0
                                          ? 'bg-emerald-500/20 text-emerald-700'
                                          : 'bg-muted text-muted-foreground'
                                    )}
                                  >
                                    {morningSummary.status === 'past'
                                      ? 'Closed'
                                      : morningRemainingCapacity > 0
                                        ? `${morningRemainingCapacity} open`
                                        : 'Full'}
                                  </Badge>
                                </div>
                                {slot.morningSlot.officers.length > 0 ? (
                                  <div className="space-y-1">
                                    {slot.morningSlot.officers.map((officer, index) => (
                                      <div key={index} className="text-2xs sm:text-sm flex items-center justify-between gap-1 sm:gap-2 bg-muted/30 p-1 sm:p-1.5 rounded-md">
                                        <div className="flex-1 min-w-0">
                                          <span
                                            className={`${officer.name === getCurrentOfficerFormatted() || officer.name === user?.name ? 'font-semibold text-primary' : ''} block text-2xs sm:text-sm truncate`}
                                            title={officer.name}
                                          >
                                            {formatOfficerNameForDisplay(officer.name)}
                                          </span>
                                          {officer.customHours && (
                                            <div className="text-2xs sm:text-xs text-muted-foreground truncate">Custom: {officer.customHours}</div>
                                          )}
                                        </div>
                                        {canUserRemoveFromShift(officer, slot.date) && (
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="destructive"
                                                className="h-6 w-6 sm:h-7 sm:w-7 p-0 ml-1 sm:ml-2 flex-shrink-0 rounded-md"
                                                disabled={loading}
                                                title={
                                                  isShiftWithinDays(slot.date, 2)
                                                    ? 'Cannot remove - shift is within 2 days'
                                                    : isShiftPastRemovalWindow(slot.date)
                                                      ? 'Cannot remove - more than 2 days have passed since shift'
                                                      : `Remove ${officer.name}`
                                                }
                                              >
                                                <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>Remove {user?.role === 'admin' ? 'Officer' : 'Yourself'} from Shift</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  Are you sure you want to remove <strong>{officer.name}</strong> from this shift on {slot.dayName} {formatDate(slot.date)}?
                                                  <br /><br />
                                                  {user?.role !== 'admin' && (
                                                    <>Note: You cannot remove yourself from shifts within 2 days before or after the scheduled date.<br /><br /></>
                                                  )}
                                                  This action cannot be undone and will make the slot available for other officers to sign up.
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogAction
                                                  onClick={() => handleRemoveOfficer(slot.id, 'morning', officer.name)}
                                                  disabled={loading}
                                                  className="bg-red-600 hover:bg-red-700"
                                                >
                                                  {user?.role === 'admin' ? 'Remove Officer' : 'Remove Me'}
                                                </AlertDialogAction>
                                                <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        )}
                                      </div>
                                    ))}
                                    {getAvailabilityDisplay(slot, 'morning', morningSummary)}
                                  </div>
                                ) : (
                                  getAvailabilityDisplay(slot, 'morning', morningSummary)
                                )}
                              </td>
                              <td className="p-1.5 sm:py-1.5 sm:px-2 text-center">
                                {(() => {
                                  const userSignedUp = hasUserSignedUpForSlot(slot.date, 'morning');
                                  const slotsAvailable =
                                    morningSummary.status !== 'past' &&
                                    morningAvailableSlots.length > 0 &&
                                    morningRemainingCapacity > 0;
                                  const isAdmin = user?.role === 'admin';
                                  const canModify = canUserModifySchedule();
                                  const blockMinutes = getShiftMaxBlockMinutes(slot.date);

                                  if (morningSummary.status === 'past') {
                                    if (userSignedUp) {
                                      return (
                                        <span className="text-xs sm:text-sm text-muted-foreground flex items-center">
                                          <Calendar className="h-3 w-3 sm:mr-1" />
                                          <span className="hidden sm:inline">Shift completed</span>
                                          <span className="sm:hidden">Completed</span>
                                        </span>
                                      );
                                    }
                                    return <span className="text-xs sm:text-sm text-muted-foreground">Shift closed</span>;
                                  }

                                  if (!slotsAvailable && !userSignedUp) {
                                    return <span className="text-xs sm:text-sm text-muted-foreground">Full</span>;
                                  }

                                  // Show message for past months for regular users
                                  if (!isAdmin && !canModify && slotsAvailable && !userSignedUp) {
                                    return <span className="text-xs sm:text-sm text-muted-foreground italic">Past month</span>;
                                  }

                                  return (
                                    <div className="flex gap-1 sm:gap-2 justify-center">
                                      {userSignedUp ? (
                                        <span className="text-xs sm:text-sm text-muted-foreground flex items-center">
                                          <Calendar className="h-3 w-3 sm:mr-1" />
                                          <span className="hidden sm:inline">Signed up</span>
                                        </span>
                                      ) : slotsAvailable && canModify ? (
                                        <HoursDialog
                                          originalTime={slot.morningSlot.time}
                                          maxBlockMinutes={blockMinutes ?? undefined}
                                          onConfirm={(customHours) => handleSignUp(slot.id, 'morning', customHours)}
                                          onCancel={() => { }}
                                        >
                                          <Button size="sm" disabled={loading} className="h-6 w-6 sm:h-9 sm:w-auto sm:px-3 p-0 sm:p-2" title="Sign up for this shift">
                                            <Plus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                            <span className="hidden sm:inline text-xs sm:text-sm">Sign Up</span>
                                          </Button>
                                        </HoursDialog>
                                      ) : null}
                                      {isAdmin && slotsAvailable && (
                                        <AdminAssignDialog
                                          users={allUsers}
                                          originalTime={slot.morningSlot.time}
                                          maxBlockMinutes={blockMinutes ?? undefined}
                                          onConfirm={(officerName, customHours) => handleAdminAssign(slot.id, 'morning', officerName, customHours)}
                                          disabled={loading}
                                        />
                                      )}
                                    </div>
                                  );
                                })()}

                              </td>
                            </tr>
                            <tr key={`${slot.id}-afternoon`} className={cn('border-t bg-muted/30 hover:bg-muted/50', isToday && 'bg-primary/10')}>
                              <td className="p-1.5 sm:py-1.5 sm:px-2">
                                <div className="text-2xs sm:text-sm text-muted-foreground ml-2 sm:ml-4">
                                  <span className="sm:hidden">or</span>
                                  <span className="hidden sm:inline">and/or</span> {displayTime(slot.afternoonSlot.time)}
                                </div>
                              </td>
                              <td className="p-1.5 sm:py-1.5 sm:px-2">
                                <div className="mb-1 flex items-center gap-2 text-2xs sm:text-xs uppercase tracking-wide text-muted-foreground">
                                  Afternoon
                                  <Badge
                                    className={cn(
                                      'text-2xs',
                                      afternoonSummary.status === 'past'
                                        ? 'bg-muted text-muted-foreground'
                                        : afternoonRemainingCapacity > 0
                                          ? 'bg-emerald-500/20 text-emerald-700'
                                          : 'bg-muted text-muted-foreground'
                                    )}
                                  >
                                    {afternoonSummary.status === 'past'
                                      ? 'Closed'
                                      : afternoonRemainingCapacity > 0
                                        ? `${afternoonRemainingCapacity} open`
                                        : 'Full'}
                                  </Badge>
                                </div>
                                {slot.afternoonSlot.officers.length > 0 ? (
                                  <div className="space-y-1">
                                    {slot.afternoonSlot.officers.map((officer, index) => (
                                      <div key={index} className="text-2xs sm:text-sm flex items-center justify-between gap-1 sm:gap-2 bg-muted/30 p-1 sm:p-1.5 rounded-md">
                                        <div className="flex-1 min-w-0">
                                          <span
                                            className={`${officer.name === getCurrentOfficerFormatted() || officer.name === user?.name ? 'font-semibold text-primary' : ''} block text-2xs sm:text-sm truncate`}
                                            title={officer.name}
                                          >
                                            {formatOfficerNameForDisplay(officer.name)}
                                          </span>
                                          {officer.customHours && (
                                            <div className="text-2xs sm:text-xs text-muted-foreground truncate">Custom: {officer.customHours}</div>
                                          )}
                                        </div>
                                        {canUserRemoveFromShift(officer, slot.date) && (
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="destructive"
                                                className="h-6 w-6 sm:h-7 sm:w-7 p-0 ml-1 sm:ml-2 flex-shrink-0 rounded-md"
                                                disabled={loading}
                                                title={
                                                  isShiftWithinDays(slot.date, 2)
                                                    ? 'Cannot remove - shift is within 2 days'
                                                    : isShiftPastRemovalWindow(slot.date)
                                                      ? 'Cannot remove - more than 2 days have passed since shift'
                                                      : `Remove ${officer.name}`
                                                }
                                              >
                                                <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>Remove {user?.role === 'admin' ? 'Officer' : 'Yourself'} from Shift</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  Are you sure you want to remove <strong>{officer.name}</strong> from this afternoon shift on {slot.dayName} {formatDate(slot.date)}?
                                                  <br /><br />
                                                  {user?.role !== 'admin' && (
                                                    <>Note: You cannot remove yourself from shifts within 2 days before or after the scheduled date.<br /><br /></>
                                                  )}
                                                  This action cannot be undone and will make the slot available for other officers to sign up.
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogAction
                                                  onClick={() => handleRemoveOfficer(slot.id, 'afternoon', officer.name)}
                                                  disabled={loading}
                                                  className="bg-red-600 hover:bg-red-700"
                                                >
                                                  {user?.role === 'admin' ? 'Remove Officer' : 'Remove Me'}
                                                </AlertDialogAction>
                                                <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        )}
                                      </div>
                                    ))}
                                    {getAvailabilityDisplay(slot, 'afternoon', afternoonSummary)}
                                  </div>
                                ) : (
                                  getAvailabilityDisplay(slot, 'afternoon', afternoonSummary)
                                )}
                              </td>
                              <td className="p-1.5 sm:py-1.5 sm:px-2 text-center">
                                {(() => {
                                  const userSignedUp = hasUserSignedUpForSlot(slot.date, 'afternoon');
                                  const slotsAvailable =
                                    afternoonSummary.status !== 'past' &&
                                    afternoonAvailableSlots.length > 0 &&
                                    afternoonRemainingCapacity > 0;
                                  const isAdmin = user?.role === 'admin';
                                  const canModify = canUserModifySchedule();
                                  const blockMinutes = getShiftMaxBlockMinutes(slot.date);

                                  if (afternoonSummary.status === 'past') {
                                    if (userSignedUp) {
                                      return (
                                        <span className="text-xs sm:text-sm text-muted-foreground flex items-center">
                                          <Calendar className="h-3 w-3 sm:mr-1" />
                                          <span className="hidden sm:inline">Shift completed</span>
                                          <span className="sm:hidden">Completed</span>
                                        </span>
                                      );
                                    }
                                    return <span className="text-xs sm:text-sm text-muted-foreground">Shift closed</span>;
                                  }

                                  if (!slotsAvailable && !userSignedUp) {
                                    return <span className="text-xs sm:text-sm text-muted-foreground">Full</span>;
                                  }

                                  // Show message for past months for regular users
                                  if (!isAdmin && !canModify && slotsAvailable && !userSignedUp) {
                                    return <span className="text-xs sm:text-sm text-muted-foreground italic">Past month</span>;
                                  }

                                  return (
                                    <div className="flex gap-1 sm:gap-2 justify-center">
                                      {userSignedUp ? (
                                        <span className="text-xs sm:text-sm text-muted-foreground flex items-center">
                                          <Calendar className="h-3 w-3 sm:mr-1" />
                                          <span className="hidden sm:inline">Signed up</span>
                                        </span>
                                      ) : slotsAvailable && canModify ? (
                                        <HoursDialog
                                          originalTime={slot.afternoonSlot.time}
                                          maxBlockMinutes={blockMinutes ?? undefined}
                                          onConfirm={(customHours) => handleSignUp(slot.id, 'afternoon', customHours)}
                                          onCancel={() => { }}
                                        >
                                          <Button size="sm" disabled={loading} className="h-6 w-6 sm:h-9 sm:w-auto sm:px-3 p-0 sm:p-2" title="Sign up for this shift">
                                            <Plus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                                            <span className="hidden sm:inline text-xs sm:text-sm">Sign Up</span>
                                          </Button>
                                        </HoursDialog>
                                      ) : null}
                                      {isAdmin && slotsAvailable && (
                                        <AdminAssignDialog
                                          users={allUsers}
                                          originalTime={slot.afternoonSlot.time}
                                          maxBlockMinutes={blockMinutes ?? undefined}
                                          onConfirm={(officerName, customHours) => handleAdminAssign(slot.id, 'afternoon', officerName, customHours)}
                                          disabled={loading}
                                        />
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 md:hidden">
                {schedule.map((slot) => {
                  const slotDate = new Date(slot.date);
                  const isToday = isSameDay(slotDate);
                  const morningSummaryMobile = getShiftAvailabilitySummary(slot, 'morning');
                  const afternoonSummaryMobile = getShiftAvailabilitySummary(slot, 'afternoon');
                  const totalOpen = morningSummaryMobile.maxRemaining + afternoonSummaryMobile.maxRemaining;
                  const hasUpcomingShift =
                    morningSummaryMobile.status !== 'past' || afternoonSummaryMobile.status !== 'past';

                  return (
                    <div
                      key={`${slot.id}-mobile`}
                      className={cn(
                        'rounded-xl border p-4 shadow-sm transition-colors',
                        isToday && 'border-primary/60 bg-primary/5 shadow-primary/10'
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold text-foreground">
                            {slot.dayName}, {formatSlotDateLabel(slotDate)}
                          </p>
                          <p className="text-xs text-muted-foreground">Morning • {displayTime(slot.morningSlot.time)}</p>
                          <p className="text-xs text-muted-foreground">Afternoon • {displayTime(slot.afternoonSlot.time)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-right">
                          {isToday && (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                              Today
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {hasUpcomingShift
                              ? totalOpen > 0
                                ? `${totalOpen} open slot${totalOpen === 1 ? '' : 's'}`
                                : 'Fully staffed'
                              : 'Shift closed'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 space-y-4">
                        {renderMobileShift(slot, 'morning', morningSummaryMobile)}
                        {renderMobileShift(slot, 'afternoon', afternoonSummaryMobile)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
