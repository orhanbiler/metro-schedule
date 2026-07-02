'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, History, ShieldAlert, UserPlus, UserMinus, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import type { ScheduleAuditAction, ScheduleAuditEntry } from '@/lib/schedule-audit';

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

type AuditRow = ScheduleAuditEntry & { id: string };

const ACTION_META: Record<ScheduleAuditAction, { label: string; className: string; Icon: typeof UserPlus }> = {
  signup: { label: 'Signed Up', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', Icon: UserPlus },
  removal: { label: 'Removed', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', Icon: UserMinus },
  hours_change: { label: 'Hours Changed', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', Icon: Clock },
};

export default function ScheduleAuditPage() {
  const { user } = useAuth();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [officerFilter, setOfficerFilter] = useState('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/audit?month=${selectedMonth}&year=${selectedYear}`);
      if (response.ok) {
        setEntries(await response.json());
      } else {
        toast.error('Failed to load audit entries');
      }
    } catch {
      toast.error('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchEntries();
    }
  }, [user, fetchEntries]);

  const changeMonth = (delta: number) => {
    let month = selectedMonth + delta;
    let year = selectedYear;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  const formatTimestamp = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'numeric', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

  const formatShiftDate = (isoDay: string) => {
    const [year, month, day] = isoDay.split('-').map((n) => parseInt(n, 10));
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric',
    });
  };

  const filtered = officerFilter.trim()
    ? entries.filter((entry) =>
        entry.officerName.toLowerCase().includes(officerFilter.trim().toLowerCase()) ||
        entry.actorName.toLowerCase().includes(officerFilter.trim().toLowerCase())
      )
    : entries;

  if (user && user.role !== 'admin') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>Only administrators can view the schedule audit log.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Schedule Audit Log
              </CardTitle>
              <CardDescription>
                Time-stamped record of every sign-up, removal, and hours change. Entries marked
                &ldquo;Capacity Override&rdquo; exceeded the standard per-hour limit.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[150px] text-center font-semibold">
                {monthNames[selectedMonth]} {selectedYear}
              </span>
              <Button variant="outline" size="icon" onClick={() => changeMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="px-4 pb-4 sm:px-0 sm:pb-4">
            <Input
              placeholder="Filter by officer or admin name..."
              value={officerFilter}
              onChange={(e) => setOfficerFilter(e.target.value)}
              className="max-w-sm"
            />
          </div>
          {loading ? (
            <div className="space-y-2 px-4 sm:px-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px] rounded-lg border">
                <table className="w-full">
                  <thead>
                    <tr className="bg-navy-900 text-white">
                      <th className="text-left p-3 font-semibold whitespace-nowrap">When</th>
                      <th className="text-left p-3 font-semibold whitespace-nowrap">Action</th>
                      <th className="text-left p-3 font-semibold whitespace-nowrap">Officer</th>
                      <th className="text-left p-3 font-semibold whitespace-nowrap">Shift</th>
                      <th className="text-left p-3 font-semibold whitespace-nowrap">Hours</th>
                      <th className="text-left p-3 font-semibold whitespace-nowrap">Performed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-muted-foreground">
                          {entries.length === 0
                            ? 'No schedule changes recorded for this month yet. The audit log captures changes made after it was introduced.'
                            : 'No entries match the current filter.'}
                        </td>
                      </tr>
                    ) : (
                      filtered.map((entry, index) => {
                        const meta = ACTION_META[entry.action] ?? ACTION_META.signup;
                        return (
                          <tr key={entry.id} className={`border-t hover:bg-muted/50 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
                            <td className="p-3 whitespace-nowrap text-sm">{formatTimestamp(entry.timestamp)}</td>
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-1">
                                <Badge className={meta.className}>
                                  <meta.Icon className="mr-1 h-3 w-3" />
                                  {meta.label}
                                </Badge>
                                {entry.capacityOverride && (
                                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                    <ShieldAlert className="mr-1 h-3 w-3" />
                                    Capacity Override
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-3 whitespace-nowrap text-sm font-medium">{entry.officerName}</td>
                            <td className="p-3 whitespace-nowrap text-sm">
                              {formatShiftDate(entry.shiftDate)}
                              <span className="ml-1 text-muted-foreground">
                                ({entry.slotType === 'morning' ? 'Morning' : 'Afternoon'})
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap text-sm">
                              {entry.action === 'hours_change'
                                ? `${entry.hoursBefore || '—'} → ${entry.hoursAfter || '—'}`
                                : entry.hoursAfter || entry.hoursBefore || '—'}
                            </td>
                            <td className="p-3 whitespace-nowrap text-sm">
                              {entry.actorName}
                              {entry.actorIdNumber ? ` #${entry.actorIdNumber}` : ''}
                              <Badge variant="secondary" className="ml-2">
                                {entry.selfAction ? 'Self' : entry.actorRole === 'admin' ? 'Admin' : 'Other'}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
