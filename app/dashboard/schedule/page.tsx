'use client';

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isFirestoreInitialized } from '@/lib/firebase-utils';
import { useAuth, type User } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { HoursDialog } from '@/components/schedule/hours-dialog';
import { AdminAssignDialog } from '@/components/schedule/admin-assign-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Download, Trash2, Plus, Calendar, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { formatOfficerName, formatOfficerNameForDisplay, extractRankFromOfficerName, calculateOfficerPayRate } from '@/lib/utils';
import { ScheduleSkeleton } from '@/components/schedule/schedule-skeleton';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { 
  parseTimeString, 
  getHourlyAvailability, 
  canAddOfficerShift, 
  getAvailableTimeSlots,
  type OfficerShift 
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
    // Removed maxOfficers - now checking hourly limits
  };
  afternoonSlot: {
    time: string;
    available: boolean;
    officers: Officer[];
    // Removed maxOfficers - now checking hourly limits
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
        slots.push({
          id: `${year}-${month}-${day}`,
          date: date,
          dayName: dayName,
          morningSlot: {
            time: '0500-1300',
            available: true,
            officers: [],
          },
          afternoonSlot: {
            time: '1300-2200',
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
          const scheduleWithDates = data.schedule.map((slot: TimeSlot) => ({
            ...migrateSlotData(slot),
            date: new Date(slot.date)
          }));
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
  }) => {
    // Migrate old data structure to new structure
    const migratedSlot = { ...slot };
    
    // Update old time values to new times
    const updateTime = (time: string) => {
      if (time === '0600-1200') return '0500-1300';
      if (time === '1400-2000') return '1300-2200';
      if (time === '1300-1900') return '1300-2200';
      return time;
    };
    
    // Handle morning slot migration
    if (slot.morningSlot) {
      const updatedTime = updateTime(slot.morningSlot.time);
      
      if (slot.morningSlot.officer && !slot.morningSlot.officers) {
        // Old structure: has officer field, migrate to officers array
        const officers = slot.morningSlot.officer ? [{
          name: slot.morningSlot.officer,
          customHours: slot.morningSlot.customHours
        }] : [];
        migratedSlot.morningSlot = {
          time: updatedTime,
          available: officers.length < 2,
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
          available: slot.morningSlot.officers.length < 2,
        };
      }
    }
    
    // Handle afternoon slot migration
    if (slot.afternoonSlot) {
      const updatedTime = updateTime(slot.afternoonSlot.time);
      
      if (slot.afternoonSlot.officer && !slot.afternoonSlot.officers) {
        // Old structure: has officer field, migrate to officers array
        const officers = slot.afternoonSlot.officer ? [{
          name: slot.afternoonSlot.officer,
          customHours: slot.afternoonSlot.customHours
        }] : [];
        migratedSlot.afternoonSlot = {
          time: updatedTime,
          available: officers.length < 2,
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
          available: slot.afternoonSlot.officers.length < 2,
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
          const scheduleWithDates = data.schedule.map((slot: TimeSlot) => ({
            ...migrateSlotData(slot),
            date: new Date(slot.date)
          }));
          
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
      
      // Check if officer is already signed up
      const alreadySignedUp = targetSlot.officers.some(officer => officer.name === currentOfficer);
      if (alreadySignedUp) {
        toast.error('You are already signed up for this shift');
        return;
      }

      // Parse the custom hours into time ranges
      const newTimeRanges = parseTimeString(customHours);
      if (newTimeRanges.length === 0) {
        toast.error('Invalid time format. Please use format like "0500-1300", "05:00-13:00", or "0500-1000,1100-1300" for split shifts.');
        return;
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
        targetSlot.time.split('-')[0], // shift start
        targetSlot.time.split('-')[1]  // shift end
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
      toast.error('Invalid time format. Please use format like "0500-1300" or "0500-1000,1100-1300" for split shifts.');
      return;
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
      targetSlot.time.split('-')[0], // shift start
      targetSlot.time.split('-')[1]  // shift end
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
  const getAvailabilityDisplay = (slot: TimeSlot, slotType: 'morning' | 'afternoon'): React.ReactElement => {
    const targetSlot = slotType === 'morning' ? slot.morningSlot : slot.afternoonSlot;
    
    // Convert officers to OfficerShift format
    const officerShifts: OfficerShift[] = targetSlot.officers.map(officer => ({
      name: officer.name,
      timeRanges: parseTimeString(officer.customHours || targetSlot.time)
    }));
    
    // Get available time slots
    const availableSlots = getAvailableTimeSlots(
      officerShifts,
      targetSlot.time.split('-')[0],
      targetSlot.time.split('-')[1]
    );
    
    if (availableSlots.length === 0) {
      return <span className="text-2xs sm:text-sm text-muted-foreground">No slots available</span>;
    }
    
    return (
      <div className="text-2xs sm:text-xs text-muted-foreground italic">
        Available: {availableSlots.join(', ')}
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
          
          // Prepare table data and calculate total hours and payments
          const tableData: Array<[string, string, string]> = [];
          let totalHoursWorked = 0;
          const officerHours: Record<string, number> = {};
          const officerPayments: Record<string, { hours: number; rate: number; payment: number }> = {};
          
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
                officerHours[officer.name] = (officerHours[officer.name] || 0) + hours;
                
                // Calculate payment
                const rank = extractRankFromOfficerName(officer.name);
                const rate = calculateOfficerPayRate(rank);
                if (!officerPayments[officer.name]) {
                  officerPayments[officer.name] = { hours: 0, rate, payment: 0 };
                }
                officerPayments[officer.name].hours += hours;
                officerPayments[officer.name].payment += hours * rate;
                
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
                officerHours[officer.name] = (officerHours[officer.name] || 0) + hours;
                
                // Calculate payment
                const rank = extractRankFromOfficerName(officer.name);
                const rate = calculateOfficerPayRate(rank);
                if (!officerPayments[officer.name]) {
                  officerPayments[officer.name] = { hours: 0, rate, payment: 0 };
                }
                officerPayments[officer.name].hours += hours;
                officerPayments[officer.name].payment += hours * rate;
                
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
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([officer, data]) => {
              paymentTableData.push([
                officer,
                `${data.hours}`,
                `$${data.rate.toFixed(2)}`,
                `$${data.payment.toFixed(2)}`,
                extractRankFromOfficerName(officer) || 'Unknown'
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
          
          // Prepare table data and calculate total hours and payments with service charge
          const tableData: Array<[string, string, string]> = [];
          let totalHoursWorked = 0;
          const officerHours: Record<string, number> = {};
          const officerPayments: Record<string, { hours: number; rate: number; payment: number; billableRate: number; billableAmount: number }> = {};
          
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
                officerHours[officer.name] = (officerHours[officer.name] || 0) + hours;
                
                // Calculate payment with service charge
                const rank = extractRankFromOfficerName(officer.name);
                const baseRate = calculateOfficerPayRate(rank);
                const billableRate = baseRate + 10; // Add $10/hour service charge
                
                if (!officerPayments[officer.name]) {
                  officerPayments[officer.name] = { 
                    hours: 0, 
                    rate: baseRate, 
                    payment: 0,
                    billableRate: billableRate,
                    billableAmount: 0 
                  };
                }
                officerPayments[officer.name].hours += hours;
                officerPayments[officer.name].payment += hours * baseRate;
                officerPayments[officer.name].billableAmount += hours * billableRate;
                
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
                officerHours[officer.name] = (officerHours[officer.name] || 0) + hours;
                
                // Calculate payment with service charge
                const rank = extractRankFromOfficerName(officer.name);
                const baseRate = calculateOfficerPayRate(rank);
                const billableRate = baseRate + 10; // Add $10/hour service charge
                
                if (!officerPayments[officer.name]) {
                  officerPayments[officer.name] = { 
                    hours: 0, 
                    rate: baseRate, 
                    payment: 0,
                    billableRate: billableRate,
                    billableAmount: 0 
                  };
                }
                officerPayments[officer.name].hours += hours;
                officerPayments[officer.name].payment += hours * baseRate;
                officerPayments[officer.name].billableAmount += hours * billableRate;
                
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
          let grandTotal = 0;
          let billableGrandTotal = 0;
          
          Object.entries(officerPayments)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([officer, data]) => {
              paymentTableData.push([
                officer,
                `${data.hours}`,
                `$${data.billableAmount.toFixed(2)}`
              ]);
              grandTotal += data.payment;
              billableGrandTotal += data.billableAmount;
            });
          
          // Calculate service charge total
          const serviceChargeTotal = totalHoursWorked * 10;
          
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

  const getMyShifts = () => {
    const myShifts: Array<{ date: string; time: string; dayName: string }> = [];
    const currentOfficerName = getCurrentOfficerFormatted();
    
    schedule.forEach(slot => {
      // Check morning slot
      const morningOfficer = slot.morningSlot.officers.find(officer => 
        officer.name === currentOfficerName || officer.name === user?.name
      );
      if (morningOfficer) {
        myShifts.push({
          date: formatDate(slot.date),
          time: morningOfficer.customHours || slot.morningSlot.time,
          dayName: slot.dayName
        });
      }
      
      // Check afternoon slot
      const afternoonOfficer = slot.afternoonSlot.officers.find(officer => 
        officer.name === currentOfficerName || officer.name === user?.name
      );
      if (afternoonOfficer) {
        myShifts.push({
          date: formatDate(slot.date),
          time: afternoonOfficer.customHours || slot.afternoonSlot.time,
          dayName: slot.dayName
        });
      }
    });
    return myShifts;
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
          <div className="flex gap-4 mb-6">
            <div className="flex gap-2">
              <Label className="self-center">Month:</Label>
              <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(Number(value))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((month, index) => (
                    <SelectItem key={month} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2">
              <Label className="self-center">Year:</Label>
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(Number(value))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {initialLoading ? (
            <ScheduleSkeleton />
          ) : (
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
                  schedule.map((slot) => (
                    <React.Fragment key={slot.id}>
                      <tr key={`${slot.id}-morning`} className="border-t hover:bg-muted/50">
                        <td className="p-1.5 sm:py-1.5 sm:px-2">
                          <div className="font-semibold text-foreground text-2xs sm:text-sm">
                            <div className="sm:hidden">
                              {new Date(slot.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                            </div>
                            <div className="hidden sm:inline">{slot.dayName} {formatDate(slot.date)}</div>
                          </div>
                          <div className="text-2xs sm:text-sm text-muted-foreground">
                            {displayTime(slot.morningSlot.time)}
                          </div>
                        </td>
                        <td className="p-1.5 sm:py-1.5 sm:px-2">
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
                              {getAvailabilityDisplay(slot, 'morning')}
                            </div>
                          ) : (
                            getAvailabilityDisplay(slot, 'morning')
                          )}
                        </td>
                        <td className="p-1.5 sm:py-1.5 sm:px-2 text-center">
                          {(() => {
                            const userSignedUp = hasUserSignedUpForSlot(slot.date, 'morning');
                            // Check if there are any available time slots
                            const officerShifts: OfficerShift[] = slot.morningSlot.officers.map(officer => ({
                              name: officer.name,
                              timeRanges: parseTimeString(officer.customHours || slot.morningSlot.time)
                            }));
                            const availableSlots = getAvailableTimeSlots(
                              officerShifts,
                              slot.morningSlot.time.split('-')[0],
                              slot.morningSlot.time.split('-')[1]
                            );
                            const slotsAvailable = availableSlots.length > 0;
                            const isAdmin = user?.role === 'admin';
                            const canModify = canUserModifySchedule();
                            
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
                                    onConfirm={(customHours) => handleSignUp(slot.id, 'morning', customHours)}
                                    onCancel={() => {}}
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
                                    onConfirm={(officerName, customHours) => handleAdminAssign(slot.id, 'morning', officerName, customHours)}
                                    disabled={loading}
                                  />
                                )}
                              </div>
                            );
                          })()}

                        </td>
                      </tr>
                      <tr key={`${slot.id}-afternoon`} className="border-t bg-muted/30 hover:bg-muted/50">
                        <td className="p-1.5 sm:py-1.5 sm:px-2">
                          <div className="text-2xs sm:text-sm text-muted-foreground ml-2 sm:ml-4">
                            <span className="sm:hidden">or</span>
                            <span className="hidden sm:inline">and/or</span> {displayTime(slot.afternoonSlot.time)}
                          </div>
                        </td>
                        <td className="p-1.5 sm:py-1.5 sm:px-2">
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
                              {getAvailabilityDisplay(slot, 'afternoon')}
                            </div>
                          ) : (
                            getAvailabilityDisplay(slot, 'afternoon')
                          )}
                        </td>
                        <td className="p-1.5 sm:py-1.5 sm:px-2 text-center">
                          {(() => {
                            const userSignedUp = hasUserSignedUpForSlot(slot.date, 'afternoon');
                            // Check if there are any available time slots
                            const officerShifts: OfficerShift[] = slot.afternoonSlot.officers.map(officer => ({
                              name: officer.name,
                              timeRanges: parseTimeString(officer.customHours || slot.afternoonSlot.time)
                            }));
                            const availableSlots = getAvailableTimeSlots(
                              officerShifts,
                              slot.afternoonSlot.time.split('-')[0],
                              slot.afternoonSlot.time.split('-')[1]
                            );
                            const slotsAvailable = availableSlots.length > 0;
                            const isAdmin = user?.role === 'admin';
                            const canModify = canUserModifySchedule();
                            
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
                                    onConfirm={(customHours) => handleSignUp(slot.id, 'afternoon', customHours)}
                                    onCancel={() => {}}
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
                  ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Scheduled Shifts - {monthNames[selectedMonth]} {selectedYear}</CardTitle>
          <CardDescription>Your overtime assignments for {monthNames[selectedMonth]} {selectedYear}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {getMyShifts().length > 0 ? (
              getMyShifts().map((shift, index) => (
                <div key={index} className="flex justify-between items-center p-3 border rounded-lg bg-muted/30">
                  <div>
                    <div className="font-semibold">
                      {shift.dayName}, {shift.date}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Time: {shift.time.includes(':') ? shift.time : displayTime(shift.time)}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-primary">
                    Confirmed
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No shifts scheduled for {monthNames[selectedMonth]} {selectedYear}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}