'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck2, Clock3, Percent, Users } from 'lucide-react';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isFirestoreInitialized } from '@/lib/firebase-utils';
import { useAuth } from '@/lib/auth-context';
import { getShiftDateBounds } from '@/lib/schedule-utils';

interface NextShiftInfo {
  id: string;
  dayName: string;
  dateLabel: string;
  dateISO: string;
  slotLabel: string;
  isToday: boolean;
  assignedCount: number;
  capacity: number;
  openSpots: number;
  orderIndex: number;
  status: 'upcoming' | 'ongoing';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [scheduleStats, setScheduleStats] = useState({
    totalSlots: 0,
    filledSlots: 0,
    availableSlots: 0,
    thisMonthUsers: 0,
    nextShift: null as NextShiftInfo | null,
  });

  useEffect(() => {
    calculateScheduleStats();
    
    // Set up real-time listener for schedule changes only if Firestore is initialized
    if (isFirestoreInitialized(db)) {
      try {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth(); // 0-indexed for schedule ID
        const currentYear = currentDate.getFullYear();
        const scheduleId = `${currentYear}-${currentMonth}`;
        const scheduleRef = doc(db, 'schedules', scheduleId);
        
        const unsubscribe = onSnapshot(scheduleRef, () => {
          // Recalculate stats when schedule changes
          calculateScheduleStats();
        }, (error) => {
          console.error('Error listening to schedule changes:', error);
        });

        return () => {
          if (unsubscribe) {
            unsubscribe();
          }
        };
      } catch (error) {
        console.error('Error setting up real-time listener:', error);
      }
    } else {
      console.warn('Firebase/Firestore not properly initialized. Real-time updates disabled.');
    }
  }, []);

  const calculateScheduleStats = async () => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth(); // Keep 0-indexed for API consistency
      const currentYear = now.getFullYear();
      
      // Calculate remaining WEEKDAYS in the current month (from today onwards, excluding weekends)
      const today = now.getDate();
      const currentHour = now.getHours();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      
      let remainingSlots = 0;
      for (let day = today; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dayOfWeek = date.getDay();
        // Skip weekends (0 = Sunday, 6 = Saturday)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          if (day === today) {
            // For today, only count shifts that haven't started yet
            // Morning shift: 0500-1300 (5 AM - 1 PM)
            if (currentHour < 5) {
              remainingSlots += 4; // Both morning and afternoon shifts
            } else if (currentHour < 13) {
              remainingSlots += 2; // Only afternoon shifts (1300-2200)
            }
            // If current hour >= 13 (1 PM), no shifts remain for today
          } else {
            // Future days get all 4 slots
            remainingSlots += 4;
          }
        }
      }
      
      const maxPossibleSlots = remainingSlots;
      
      // Fetch current month's schedule
      const response = await fetch(`/api/schedule?month=${currentMonth}&year=${currentYear}`);
      if (!response.ok) {
        // If no schedule exists, show all slots as available
        setScheduleStats({
          totalSlots: maxPossibleSlots,
          filledSlots: 0,
          availableSlots: maxPossibleSlots,
          thisMonthUsers: 0,
          nextShift: null,
        });
        return;
      }
      
      const data = await response.json();
      const schedule = data.schedule || data || [];
      
      // Ensure schedule is an array and check if empty
      if (!Array.isArray(schedule) || schedule.length === 0) {
        setScheduleStats({
          totalSlots: maxPossibleSlots,
          filledSlots: 0,
          availableSlots: maxPossibleSlots,
          thisMonthUsers: 0,
          nextShift: null,
        });
        return;
      }
      
      // Calculate actual statistics from existing schedule (only from today onwards)
      let filledSlots = 0;
      const uniqueOfficers = new Set<string>();
      const todayDate = new Date(currentYear, currentMonth, today);
      let upcomingShift: NextShiftInfo | null = null;

      const toTimeLabel = (time?: string) => {
        if (!time) return '';
        if (time.includes(':') && time.includes('-')) return time;
        if (!time.includes('-')) return time;

        const [start, end] = time.split('-');

        const formatSegment = (segment: string) => {
          if (segment.includes(':')) return segment;
          const hours = Number(segment.slice(0, 2));
          const minutes = Number(segment.slice(2, 4));
          const date = new Date();
          date.setHours(hours, minutes, 0, 0);
          return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        };

        return `${formatSegment(start)} – ${formatSegment(end)}`;
      };

      const defaultShiftTimes: Record<'Morning' | 'Afternoon', string> = {
        Morning: '0500-1300',
        Afternoon: '1300-2200',
      };

      schedule.forEach((day: {
        id: string;
        date: Date | string;
        dayName?: string;
        morningSlot?: { officers?: { name: string }[]; maxOfficers?: number; time?: string };
        afternoonSlot?: { officers?: { name: string }[]; maxOfficers?: number; time?: string };
      }) => {
        // Only count days from today onwards
        let dayOfMonth;

        if (day.date instanceof Date) {
          dayOfMonth = day.date.getDate();
        } else if (typeof day.date === 'string') {
          dayOfMonth = new Date(day.date).getDate();
        } else {
          // Fallback: assume it's a day number or use day ID
          dayOfMonth = parseInt(day.id) || 1;
        }

        if (dayOfMonth >= today) {
          const slotDate = new Date(currentYear, currentMonth, dayOfMonth);
          const morningOfficers = day.morningSlot?.officers || [];
          const afternoonOfficers = day.afternoonSlot?.officers || [];

          // For today, only count shifts that haven't started yet
          if (dayOfMonth === today) {
            // Morning shift: 0500-1300
            if (currentHour < 5) {
              // Both shifts are in the future
              filledSlots += morningOfficers.length + afternoonOfficers.length;
            } else if (currentHour < 13) {
              // Only afternoon shift is in the future (1300-2200)
              filledSlots += afternoonOfficers.length;
            }
            // If current hour >= 13, don't count any slots for today
          } else {
            // Future days - count all filled slots
            filledSlots += morningOfficers.length + afternoonOfficers.length;
          }

          // Track unique officers (for all slots, regardless of time)
          [...morningOfficers, ...afternoonOfficers].forEach((officer: { name: string } | string) => {
            if (officer && typeof officer === 'object' && officer.name) {
              uniqueOfficers.add(officer.name);
            } else if (officer && typeof officer === 'string') {
              uniqueOfficers.add(officer);
            }
          });

          const considerShift = (
            slotName: 'Morning' | 'Afternoon',
            slotData?: { officers?: { name: string }[]; maxOfficers?: number; time?: string }
          ) => {
            if (!slotData) return;

            const officers = slotData.officers || [];
            const capacity = slotData.maxOfficers ?? 2;
            const spotsLeft = capacity - officers.length;
            const isOpen = spotsLeft > 0;
            const timeString = slotData.time || defaultShiftTimes[slotName];
            const { start, end } = getShiftDateBounds(slotDate, timeString);

            if (end && now >= end) {
              return; // Skip shifts that have completely finished
            }

            const isOngoing = Boolean(start && end && now >= start && now < end);
            const isUpcoming = start ? now < start : true;

            if (!isOngoing && !isUpcoming) {
              return;
            }

            const candidate: NextShiftInfo = {
              id: `${day.id}-${slotName.toLowerCase()}`,
              dayName: day.dayName ?? slotDate.toLocaleDateString(undefined, { weekday: 'long' }),
              dateLabel: slotDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
              dateISO: (start ?? slotDate).toISOString(),
              slotLabel: `${slotName} • ${toTimeLabel(timeString)}`.trim(),
              isToday: slotDate.toDateString() === todayDate.toDateString(),
              assignedCount: officers.length,
              capacity,
              openSpots: Math.max(spotsLeft, 0),
              orderIndex: slotName === 'Morning' ? 0 : 1,
              status: isOngoing ? 'ongoing' : 'upcoming',
            };

            const shouldReplace = () => {
              if (!upcomingShift) return true;

              const candidateDate = new Date(candidate.dateISO);
              const existingDate = new Date(upcomingShift.dateISO);

              const candidateOpen = candidate.openSpots > 0;
              const existingOpen = upcomingShift.openSpots > 0;

              if (candidateOpen && !existingOpen) return true;
              if (!candidateOpen && existingOpen) return false;

              if (candidateDate < existingDate) return true;
              if (candidateDate > existingDate) return false;

              if (candidate.status === 'ongoing' && upcomingShift.status === 'upcoming') return true;
              if (candidate.status === 'upcoming' && upcomingShift.status === 'ongoing') return false;

              return candidate.orderIndex < upcomingShift.orderIndex;
            };

            if (isOpen || !upcomingShift) {
              if (shouldReplace()) {
                upcomingShift = candidate;
              }
            }
          };

          considerShift('Morning', day.morningSlot);
          considerShift('Afternoon', day.afternoonSlot);
        }
      });
      
      const availableSlots = maxPossibleSlots - filledSlots;
      
      setScheduleStats({
        totalSlots: maxPossibleSlots,
        filledSlots,
        availableSlots,
        thisMonthUsers: uniqueOfficers.size,
        nextShift: upcomingShift,
      });
    } catch (error) {
      console.error('Error calculating schedule stats:', error);
      // Fallback: calculate based on remaining weekdays in current month
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();
      const today = currentDate.getDate();
      const currentHour = currentDate.getHours();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      
      let remainingSlots = 0;
      for (let day = today; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          if (day === today) {
            // For today, only count shifts that haven't started yet
            if (currentHour < 5) {
              remainingSlots += 4; // Both morning and afternoon shifts
            } else if (currentHour < 13) {
              remainingSlots += 2; // Only afternoon shifts
            }
          } else {
            remainingSlots += 4;
          }
        }
      }
      
      const maxPossibleSlots = remainingSlots;
      
      setScheduleStats({
        totalSlots: maxPossibleSlots,
        filledSlots: 0,
        availableSlots: maxPossibleSlots,
        thisMonthUsers: 0,
        nextShift: null,
      });
    }
  };

  const fillRate = useMemo(() => {
    if (scheduleStats.totalSlots === 0) {
      return 0;
    }
    return Math.round((scheduleStats.filledSlots / scheduleStats.totalSlots) * 100);
  }, [scheduleStats.filledSlots, scheduleStats.totalSlots]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            Welcome, {user?.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Welcome to the Cheverly Police Department Metro Schedule Management System.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base font-semibold">Metro Coverage Snapshot</CardTitle>
          <CardDescription>Live scheduling health for the rest of this month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Fill rate</span>
                <Percent className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-primary">{fillRate}%</p>
              <div className="mt-3 h-2 w-full rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(fillRate, 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {scheduleStats.filledSlots} of {scheduleStats.totalSlots} upcoming shifts staffed
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Open slots</span>
                <Clock3 className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-green-600">{scheduleStats.availableSlots}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Remaining overtime opportunities this month
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Officers participating</span>
                <Users className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold">{scheduleStats.thisMonthUsers}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Unique officers scheduled from today forward
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Next open shift</span>
                <CalendarCheck2 className="h-4 w-4" />
              </div>
              {scheduleStats.nextShift ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="text-lg font-semibold text-foreground">
                    {scheduleStats.nextShift.dayName}
                    <span className="ml-2 text-sm font-medium text-muted-foreground">
                      {scheduleStats.nextShift.dateLabel}
                    </span>
                  </p>
                  <p className="text-muted-foreground">{scheduleStats.nextShift.slotLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {scheduleStats.nextShift.openSpots} spots left • {scheduleStats.nextShift.assignedCount}/{scheduleStats.nextShift.capacity} filled
                  </p>
                  {scheduleStats.nextShift.status === 'ongoing' && (
                    <p className="text-xs text-muted-foreground">
                      Currently on duty: {scheduleStats.nextShift.assignedCount}{' '}
                      {scheduleStats.nextShift.assignedCount === 1 ? 'officer' : 'officers'}
                    </p>
                  )}
                  {(scheduleStats.nextShift.isToday || scheduleStats.nextShift.status === 'ongoing') && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {scheduleStats.nextShift.isToday && (
                        <Badge variant="outline" className="w-fit border-emerald-600 text-emerald-600">
                          Today
                        </Badge>
                      )}
                      {scheduleStats.nextShift.status === 'ongoing' && (
                        <Badge variant="outline" className="w-fit border-sky-500 text-sky-600">
                          In progress
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Every shift is staffed—check back as new overtime hits the board.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Link
              href="/dashboard/schedule"
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <div>
                <div className="font-medium">View Schedule</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Check available overtime opportunities
                </div>
              </div>
              <Badge variant="secondary">
                <Users className="h-3 w-3 mr-1" />
                Schedule
              </Badge>
            </Link>
            <Link
              href="/dashboard/profile"
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <div>
                <div className="font-medium">Update Profile</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Manage your account settings
                </div>
              </div>
              <Badge variant="outline">Profile</Badge>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
