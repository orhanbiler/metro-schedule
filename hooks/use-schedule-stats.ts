'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isFirestoreInitialized } from '@/lib/firebase-utils';
import { getShiftDateBounds, getShiftTimeOrDefault, getShiftStartHour } from '@/lib/schedule-utils';
import { calculateHoursFromTimeString } from '@/lib/utils';

export interface NextShiftInfo {
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

export interface ScheduleStats {
  /** Total officer-slots across the entire calendar month (admin use) */
  totalSlots: number;
  /** Filled officer-slots across the entire calendar month (admin use) */
  filledSlots: number;
  /** Unfilled officer-slots across the entire calendar month (admin use) */
  availableSlots: number;
  /** Total possible officer-slots from now to month end (dashboard use) */
  remainingTotal: number;
  /** Filled officer-slots from now to month end (dashboard use) */
  remainingFilled: number;
  /** Unfilled officer-slots from now to month end (dashboard/admin use) */
  remainingAvailable: number;
  /** Unique officers scheduled at any point this month */
  thisMonthUsers: number;
  /** Sum of all officer hours worked this month (admin use) */
  totalHoursWorked: number;
  /** Sum of uncovered officer-hours this month (admin use) */
  totalHoursUncovered: number;
  /** The next open shift from now (dashboard use) */
  nextShift: NextShiftInfo | null;
}

const INITIAL_STATS: ScheduleStats = {
  totalSlots: 0,
  filledSlots: 0,
  availableSlots: 0,
  remainingTotal: 0,
  remainingFilled: 0,
  remainingAvailable: 0,
  thisMonthUsers: 0,
  totalHoursWorked: 0,
  totalHoursUncovered: 0,
  nextShift: null,
};

const MAX_PER_SHIFT = 2;

function toTimeLabel(time?: string): string {
  if (!time) return '';
  if (time.includes(':') && time.includes('-')) return time;
  if (!time.includes('-')) return time;
  const [start, end] = time.split('-');
  const fmt = (seg: string) => {
    if (seg.includes(':')) return seg;
    const h = Number(seg.slice(0, 2));
    const m = Number(seg.slice(2, 4));
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

type ScheduleDay = {
  id: string;
  date: Date | string;
  dayName?: string;
  morningSlot?: {
    officers?: Array<{ name: string; customHours?: string }>;
    maxOfficers?: number;
    time?: string;
  };
  afternoonSlot?: {
    officers?: Array<{ name: string; customHours?: string }>;
    maxOfficers?: number;
    time?: string;
  };
};

function buildFallbackStats(now: Date): ScheduleStats {
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const today = now.getDate();
  const currentHour = now.getHours();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  let totalPossible = 0;
  let remainingPossible = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(currentYear, currentMonth, day);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    totalPossible += 4;
    if (day > today) {
      remainingPossible += 4;
    } else if (day === today) {
      const morningStart = getShiftStartHour(date, 'morning');
      const afternoonStart = getShiftStartHour(date, 'afternoon');
      if (currentHour < morningStart) remainingPossible += 4;
      else if (currentHour < afternoonStart) remainingPossible += 2;
    }
  }

  return {
    ...INITIAL_STATS,
    totalSlots: totalPossible,
    availableSlots: totalPossible,
    remainingTotal: remainingPossible,
    remainingAvailable: remainingPossible,
  };
}

async function fetchAndComputeStats(): Promise<ScheduleStats> {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const today = now.getDate();
  const currentHour = now.getHours();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const todayDate = new Date(currentYear, currentMonth, today);

  let totalPossible = 0;
  let remainingPossible = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(currentYear, currentMonth, day);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    totalPossible += 4;
    if (day > today) {
      remainingPossible += 4;
    } else if (day === today) {
      const morningStart = getShiftStartHour(date, 'morning');
      const afternoonStart = getShiftStartHour(date, 'afternoon');
      if (currentHour < morningStart) remainingPossible += 4;
      else if (currentHour < afternoonStart) remainingPossible += 2;
    }
  }

  const response = await fetch(`/api/schedule?month=${currentMonth}&year=${currentYear}`);
  if (!response.ok) {
    return {
      ...INITIAL_STATS,
      totalSlots: totalPossible,
      availableSlots: totalPossible,
      remainingTotal: remainingPossible,
      remainingAvailable: remainingPossible,
    };
  }

  const data = await response.json();
  const schedule: ScheduleDay[] = data.schedule || data || [];

  if (!Array.isArray(schedule) || schedule.length === 0) {
    return {
      ...INITIAL_STATS,
      totalSlots: totalPossible,
      availableSlots: totalPossible,
      remainingTotal: remainingPossible,
      remainingAvailable: remainingPossible,
    };
  }

  let totalFilled = 0;
  let remainingFilled = 0;
  let totalHoursWorked = 0;
  let totalHoursUncovered = 0;
  const uniqueOfficers = new Set<string>();
  let nextShift: NextShiftInfo | null = null;

  schedule.forEach((day) => {
    let dayDate: Date | null = null;
    if (day.date instanceof Date) {
      dayDate = day.date;
    } else if (typeof day.date === 'string') {
      dayDate = new Date(day.date);
    }
    if (!dayDate) return;

    const dow = dayDate.getDay();
    if (dow === 0 || dow === 6) return;

    const dayOfMonth = dayDate.getDate();
    const morningOfficers = day.morningSlot?.officers || [];
    const afternoonOfficers = day.afternoonSlot?.officers || [];
    const morningTime = getShiftTimeOrDefault(dayDate, 'morning', day.morningSlot?.time);
    const afternoonTime = getShiftTimeOrDefault(dayDate, 'afternoon', day.afternoonSlot?.time);

    // Full-month counts
    totalFilled += morningOfficers.length + afternoonOfficers.length;

    // Hours worked / uncovered
    morningOfficers.forEach((o) => {
      totalHoursWorked += calculateHoursFromTimeString(o.customHours || morningTime);
    });
    const uncoveredMorning = MAX_PER_SHIFT - morningOfficers.length;
    if (uncoveredMorning > 0) {
      totalHoursUncovered += uncoveredMorning * calculateHoursFromTimeString(morningTime);
    }
    afternoonOfficers.forEach((o) => {
      totalHoursWorked += calculateHoursFromTimeString(o.customHours || afternoonTime);
    });
    const uncoveredAfternoon = MAX_PER_SHIFT - afternoonOfficers.length;
    if (uncoveredAfternoon > 0) {
      totalHoursUncovered += uncoveredAfternoon * calculateHoursFromTimeString(afternoonTime);
    }

    // Unique officers
    [...morningOfficers, ...afternoonOfficers].forEach((o) => {
      if (o && typeof o === 'object' && o.name) uniqueOfficers.add(o.name);
    });

    // Remaining filled slots (from today forward)
    if (dayOfMonth > today) {
      remainingFilled += morningOfficers.length + afternoonOfficers.length;
    } else if (dayOfMonth === today) {
      const morningStart = getShiftStartHour(dayDate, 'morning', day.morningSlot?.time);
      const afternoonStart = getShiftStartHour(dayDate, 'afternoon', day.afternoonSlot?.time);
      if (currentHour < morningStart) {
        remainingFilled += morningOfficers.length + afternoonOfficers.length;
      } else if (currentHour < afternoonStart) {
        remainingFilled += afternoonOfficers.length;
      }
    }

    // Next open shift calculation
    const considerShift = (
      slotName: 'Morning' | 'Afternoon',
      slotData?: typeof day.morningSlot
    ) => {
      if (!slotData || !dayDate) return;
      const officers = slotData.officers || [];
      const capacity = slotData.maxOfficers ?? MAX_PER_SHIFT;
      const spotsLeft = capacity - officers.length;
      const timeString = getShiftTimeOrDefault(
        dayDate,
        slotName === 'Morning' ? 'morning' : 'afternoon',
        slotData.time
      );
      const { start, end } = getShiftDateBounds(dayDate, timeString);
      if (end && now >= end) return;
      const isOngoing = Boolean(start && end && now >= start && now < end);
      const isUpcoming = start ? now < start : true;
      if (!isOngoing && !isUpcoming) return;

      const candidate: NextShiftInfo = {
        id: `${day.id}-${slotName.toLowerCase()}`,
        dayName: day.dayName ?? dayDate.toLocaleDateString(undefined, { weekday: 'long' }),
        dateLabel: dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        dateISO: (start ?? dayDate).toISOString(),
        slotLabel: `${slotName} • ${toTimeLabel(timeString)}`.trim(),
        isToday: dayDate.toDateString() === todayDate.toDateString(),
        assignedCount: officers.length,
        capacity,
        openSpots: Math.max(spotsLeft, 0),
        orderIndex: slotName === 'Morning' ? 0 : 1,
        status: isOngoing ? 'ongoing' : 'upcoming',
      };

      const shouldReplace = (): boolean => {
        if (!nextShift) return true;
        const cDate = new Date(candidate.dateISO);
        const eDate = new Date(nextShift.dateISO);
        if (candidate.openSpots > 0 && nextShift.openSpots === 0) return true;
        if (candidate.openSpots === 0 && nextShift.openSpots > 0) return false;
        if (cDate < eDate) return true;
        if (cDate > eDate) return false;
        if (candidate.status === 'ongoing' && nextShift.status === 'upcoming') return true;
        if (candidate.status === 'upcoming' && nextShift.status === 'ongoing') return false;
        return candidate.orderIndex < nextShift.orderIndex;
      };

      if (spotsLeft > 0 || !nextShift) {
        if (shouldReplace()) nextShift = candidate;
      }
    };

    considerShift('Morning', day.morningSlot);
    considerShift('Afternoon', day.afternoonSlot);
  });

  return {
    totalSlots: totalPossible,
    filledSlots: totalFilled,
    availableSlots: totalPossible - totalFilled,
    remainingTotal: remainingPossible,
    remainingFilled,
    remainingAvailable: remainingPossible - remainingFilled,
    thisMonthUsers: uniqueOfficers.size,
    totalHoursWorked,
    totalHoursUncovered,
    nextShift,
  };
}

export function useScheduleStats(): ScheduleStats {
  const [stats, setStats] = useState<ScheduleStats>(INITIAL_STATS);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchAndComputeStats();
      setStats(result);
    } catch (err) {
      console.error('Error calculating schedule stats:', err);
      setStats(buildFallbackStats(new Date()));
    }
  }, []);

  useEffect(() => {
    refresh();

    if (!isFirestoreInitialized(db)) {
      console.warn('Firebase/Firestore not properly initialized. Real-time updates disabled.');
      return;
    }

    try {
      const now = new Date();
      const scheduleId = `${now.getFullYear()}-${now.getMonth()}`;
      const scheduleRef = doc(db, 'schedules', scheduleId);
      const unsubscribe = onSnapshot(scheduleRef, refresh, (err: unknown) => {
        console.error('Error listening to schedule changes:', err);
      });
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up schedule listener:', error);
    }
  }, [refresh]);

  return stats;
}
