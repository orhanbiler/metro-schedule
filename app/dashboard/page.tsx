'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarCheck2, AlertTriangle, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isFirestoreInitialized } from '@/lib/firebase-utils';
import { useAuth } from '@/lib/auth-context';
import { getShiftDateBounds, getShiftTimeOrDefault, getShiftStartHour, getMaxOfficersPerShift } from '@/lib/schedule-utils';

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
  // Skeleton shows on the first load only (default true, never reset to true),
  // so live snapshot refreshes don't flash placeholders.
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

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
      setStatsError(false);
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
          const morningStartHour = getShiftStartHour(date, 'morning');
          const afternoonStartHour = getShiftStartHour(date, 'afternoon');
          if (day === today) {
            // For today, only count shifts that haven't started yet
            if (currentHour < morningStartHour) {
              remainingSlots += 4; // Both morning and afternoon shifts
            } else if (currentHour < afternoonStartHour) {
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
        // A non-OK response is a real failure (auth/server), not an empty month.
        setStatsError(true);
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
          const morningStartHour = getShiftStartHour(slotDate, 'morning', day.morningSlot?.time);
          const afternoonStartHour = getShiftStartHour(slotDate, 'afternoon', day.afternoonSlot?.time);

          // For today, only count shifts that haven't started yet
          if (dayOfMonth === today) {
            if (currentHour < morningStartHour) {
              // Both shifts are in the future
              filledSlots += morningOfficers.length + afternoonOfficers.length;
            } else if (currentHour < afternoonStartHour) {
              // Only afternoon shift is in the future
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
            // Mondays and Fridays allow a third officer per shift.
            const capacity = slotData.maxOfficers ?? getMaxOfficersPerShift(slotDate);
            const spotsLeft = capacity - officers.length;
            const isOpen = spotsLeft > 0;
            const timeString = getShiftTimeOrDefault(
              slotDate,
              slotName === 'Morning' ? 'morning' : 'afternoon',
              slotData.time
            );
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
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  };

  const fillRate = useMemo(() => {
    if (scheduleStats.totalSlots === 0) {
      return 0;
    }
    return Math.round((scheduleStats.filledSlots / scheduleStats.totalSlots) * 100);
  }, [scheduleStats.filledSlots, scheduleStats.totalSlots]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
            {user?.name ? (
              `Welcome, ${user.name}`
            ) : (
              <span className="flex items-center gap-2">
                Welcome,
                <Skeleton className="inline-block h-7 w-32 align-middle" />
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Your Metro shifts and overtime, all in one place.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Button asChild className="gap-1.5 px-3 sm:gap-2 sm:px-4">
            <Link href="/dashboard/schedule">View schedule <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </Button>
          <Button asChild variant="outline" className="gap-1.5 px-3 sm:gap-2 sm:px-4">
            <Link href="/dashboard/ot-slips"><FileText className="h-4 w-4" aria-hidden="true" /> Create OT slip</Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="coverage-heading" className="space-y-4">
        <div>
          <h2 id="coverage-heading" className="text-base font-semibold">This month’s coverage</h2>
          <p className="mt-1 text-sm text-muted-foreground">Remaining shifts from today through the end of the month.</p>
        </div>
        {statsLoading ? (
          <Card>
            <CardContent className="grid grid-cols-3 gap-4 p-4 sm:p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-4 w-16 sm:w-24" />
                  <Skeleton className="h-9 w-12" />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : statsError ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 p-6 text-center sm:p-8">
              <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load coverage. Please try again.
              </p>
              <Button variant="outline" size="sm" onClick={() => calculateScheduleStats()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <dl className="grid grid-cols-3 divide-x px-1 py-5 sm:px-2 sm:py-6">
                  <div className="min-w-0 px-3 sm:px-5">
                    <dt className="text-xs text-muted-foreground sm:text-sm">Open slots</dt>
                    <dd className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-primary sm:text-4xl">{scheduleStats.availableSlots}</dd>
                  </div>
                  <div className="min-w-0 px-3 sm:px-5">
                    <dt className="text-xs text-muted-foreground sm:text-sm">Fill rate</dt>
                    <dd className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-4xl">{fillRate}%</dd>
                  </div>
                  <div className="min-w-0 px-3 sm:px-5">
                    <dt className="text-xs text-muted-foreground sm:text-sm">Officers</dt>
                    <dd className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-4xl">{scheduleStats.thisMonthUsers}</dd>
                  </div>
                </dl>
                <div className="space-y-2 border-t px-4 py-4 sm:px-6">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(fillRate, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {scheduleStats.filledSlots} of {scheduleStats.totalSlots} upcoming slots staffed
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex gap-3 p-4 sm:gap-4 sm:p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarCheck2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-muted-foreground">Next open shift</h3>
                  {scheduleStats.nextShift ? (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold tracking-tight">
                          {scheduleStats.nextShift.dayName}, {scheduleStats.nextShift.dateLabel}
                        </p>
                        {scheduleStats.nextShift.isToday && (
                          <Badge variant="secondary">Today</Badge>
                        )}
                        {scheduleStats.nextShift.status === 'ongoing' && (
                          <Badge variant="outline" className="border-primary/20 text-primary">In progress</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{scheduleStats.nextShift.slotLabel}</p>
                      <p className="text-sm">
                        <span className="font-medium">{scheduleStats.nextShift.openSpots} spots left</span>
                        <span className="text-muted-foreground"> · {scheduleStats.nextShift.assignedCount}/{scheduleStats.nextShift.capacity} filled</span>
                      </p>
                      {scheduleStats.nextShift.status === 'ongoing' && (
                        <p className="text-xs text-muted-foreground">
                          Currently on duty: {scheduleStats.nextShift.assignedCount}{' '}
                          {scheduleStats.nextShift.assignedCount === 1 ? 'officer' : 'officers'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No upcoming open shifts to show. Check the schedule for availability.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </section>
    </div>
  );
}
