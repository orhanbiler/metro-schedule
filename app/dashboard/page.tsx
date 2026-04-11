'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck2, Clock3, Percent, Users } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useScheduleStats } from '@/hooks/use-schedule-stats';

export default function DashboardPage() {
  const { user } = useAuth();
  const {
    remainingTotal,
    remainingFilled,
    remainingAvailable,
    thisMonthUsers,
    nextShift,
  } = useScheduleStats();

  const fillRate = useMemo(() => {
    if (remainingTotal === 0) return 0;
    return Math.round((remainingFilled / remainingTotal) * 100);
  }, [remainingFilled, remainingTotal]);

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
                {remainingFilled} of {remainingTotal} upcoming shifts staffed
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Open slots</span>
                <Clock3 className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-green-600">{remainingAvailable}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Remaining overtime opportunities this month
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Officers participating</span>
                <Users className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold">{thisMonthUsers}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Unique officers scheduled from today forward
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Next open shift</span>
                <CalendarCheck2 className="h-4 w-4" />
              </div>
              {nextShift ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="text-lg font-semibold text-foreground">
                    {nextShift.dayName}
                    <span className="ml-2 text-sm font-medium text-muted-foreground">
                      {nextShift.dateLabel}
                    </span>
                  </p>
                  <p className="text-muted-foreground">{nextShift.slotLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {nextShift.openSpots} spots left • {nextShift.assignedCount}/{nextShift.capacity} filled
                  </p>
                  {nextShift.status === 'ongoing' && (
                    <p className="text-xs text-muted-foreground">
                      Currently on duty: {nextShift.assignedCount}{' '}
                      {nextShift.assignedCount === 1 ? 'officer' : 'officers'}
                    </p>
                  )}
                  {(nextShift.isToday || nextShift.status === 'ongoing') && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {nextShift.isToday && (
                        <Badge variant="outline" className="w-fit border-emerald-600 text-emerald-600">
                          Today
                        </Badge>
                      )}
                      {nextShift.status === 'ongoing' && (
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
