'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, CheckCircle, Clock, Bell, Settings, Timer, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isFirestoreInitialized } from '@/lib/firebase-utils';
import { formatOfficerName } from '@/lib/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { UserListSkeleton, StatsCardSkeleton } from '@/components/schedule/schedule-skeleton';

interface User {
  id: string;
  email: string;
  name: string;
  idNumber?: string;
  rank?: string;
  role: 'admin' | 'user';
  createdAt: string;
  updatedAt?: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleStats, setScheduleStats] = useState({
    totalSlots: 0,
    filledSlots: 0,
    availableSlots: 0,
    thisMonthUsers: 0,
    totalHoursWorked: 0,
    totalHoursUncovered: 0,
  });

  useEffect(() => {
    fetchUsers();
    calculateScheduleStats();
    
    // Set up real-time listener for schedule changes only if db is properly initialized
    if (isFirestoreInitialized(db)) {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth(); // 0-indexed for schedule ID
      const currentYear = currentDate.getFullYear();
      const scheduleId = `${currentYear}-${currentMonth}`;
      
      try {
        const scheduleRef = doc(db, 'schedules', scheduleId);
        
        // Setting up real-time listener for schedule changes
        
        const unsubscribe = onSnapshot(scheduleRef, () => {
          // Schedule document changed, recalculating statistics
          // Recalculate stats when schedule changes
          calculateScheduleStats();
        }, (error) => {
          console.error('Error listening to schedule changes in admin:', error);
        });

        return () => {
          if (unsubscribe) {
            unsubscribe();
          }
        };
      } catch (error) {
        console.error('Error setting up schedule listener:', error);
      }
    } else {
      console.warn('Firebase/Firestore not properly initialized. Real-time updates disabled.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users');
      if (response.ok) {
        const userData = await response.json();
        setUsers(userData);
      } else {
        toast.error('Failed to load users');
      }
    } catch {
      toast.error('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to calculate hours from time string (e.g., "6am-2pm" = 8 hours)
  const calculateHoursFromTimeString = (timeStr: string): number => {
    if (!timeStr) return 0;
    
    // Parse time strings like "6am-2pm", "10pm-6am", "12am-8am"
    const match = timeStr.match(/(\d+)(am|pm)-(\d+)(am|pm)/i);
    if (!match) return 0;
    
    const [, startHour, startPeriod, endHour, endPeriod] = match;
    
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
  };

  const calculateScheduleStats = useCallback(async () => {
    try {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth(); // Keep 0-indexed for API consistency
      const currentYear = currentDate.getFullYear();
      
      // Calculate remaining WEEKDAYS in the current month (from today onwards, excluding weekends)
      const today = currentDate.getDate();
      const currentHour = currentDate.getHours();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate(); // currentMonth + 1 because Date constructor expects 1-indexed month for this calculation
      
      let remainingSlots = 0;
      for (let day = today; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day); // currentMonth is 0-indexed here, which is correct for Date constructor
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
      
      const maxPossibleSlots = remainingSlots; // 2 morning + 2 afternoon slots per weekday
      
      // Calculating schedule statistics for current month
      
      // Fetch current month's schedule
      // Fetching schedule data for current month
      const response = await fetch(`/api/schedule?month=${currentMonth}&year=${currentYear}`);
      if (!response.ok) {
        // Failed to fetch schedule data, using fallback statistics
        // If no schedule exists, show all slots as available
        const fallbackStats = {
          totalSlots: maxPossibleSlots,
          filledSlots: 0,
          availableSlots: maxPossibleSlots,
          thisMonthUsers: 0,
          totalHoursWorked: 0,
          totalHoursUncovered: maxPossibleSlots * 8, // Assuming 8 hours per slot
        };
        // Using fallback statistics due to API error
        setScheduleStats(fallbackStats);
        return;
      }
      
      const data = await response.json();
      // The API returns the document data directly if it exists, or { schedule: [] } if not
      const schedule = data.schedule || data || [];
      
      // Processing fetched schedule data
      
      // Ensure schedule is an array and check if empty
      if (!Array.isArray(schedule) || schedule.length === 0) {
        const emptyScheduleStats = {
          totalSlots: maxPossibleSlots,
          filledSlots: 0,
          availableSlots: maxPossibleSlots,
          thisMonthUsers: 0,
          totalHoursWorked: 0,
          totalHoursUncovered: maxPossibleSlots * 8, // Assuming 8 hours per slot
        };
        // No schedule data found, using empty schedule statistics
        setScheduleStats(emptyScheduleStats);
        return;
      }
      
      // Calculate actual statistics from existing schedule (only from today onwards)
      let filledSlots = 0;
      let totalHoursWorked = 0;
      let totalHoursUncovered = 0;
      const uniqueOfficers = new Set<string>();
      
      schedule.forEach((day: { 
        id: string; 
        date: Date | string; 
        morningSlot?: { 
          officers?: Array<{ name: string; customHours?: string }>; 
          maxOfficers?: number;
          time?: string;
        }; 
        afternoonSlot?: { 
          officers?: Array<{ name: string; customHours?: string }>; 
          maxOfficers?: number;
          time?: string;
        } 
      }) => {
        // Only count days from today onwards
        let dayDate;
        let dayOfMonth;
        
        if (day.date instanceof Date) {
          dayDate = day.date;
          dayOfMonth = dayDate.getDate();
        } else if (typeof day.date === 'string') {
          dayDate = new Date(day.date);
          dayOfMonth = dayDate.getDate();
        } else {
          // Fallback: assume it's a day number or use day ID
          dayOfMonth = parseInt(day.id) || 1;
        }
        
        // Processing schedule day for statistics calculation
        
        if (dayOfMonth >= today) {
          const morningOfficers = day.morningSlot?.officers || [];
          const afternoonOfficers = day.afternoonSlot?.officers || [];
          const morningTime = day.morningSlot?.time || '6am-2pm';
          const afternoonTime = day.afternoonSlot?.time || '2pm-10pm';
          const maxMorning = day.morningSlot?.maxOfficers || 2;
          const maxAfternoon = day.afternoonSlot?.maxOfficers || 2;
          
          // Counting filled slots and hours for this day
          
          // For today, only count shifts that haven't started yet
          if (dayOfMonth === today) {
            const currentHour = new Date().getHours();
            // Morning shift: 0500-1300
            if (currentHour < 5) {
              // Both shifts are in the future
              filledSlots += morningOfficers.length + afternoonOfficers.length;
              
              // Calculate hours for morning shift
              morningOfficers.forEach(officer => {
                const hours = calculateHoursFromTimeString(officer.customHours || morningTime);
                totalHoursWorked += hours;
              });
              
              // Calculate uncovered hours for morning
              const uncoveredMorning = maxMorning - morningOfficers.length;
              if (uncoveredMorning > 0) {
                totalHoursUncovered += uncoveredMorning * calculateHoursFromTimeString(morningTime);
              }
              
              // Calculate hours for afternoon shift
              afternoonOfficers.forEach(officer => {
                const hours = calculateHoursFromTimeString(officer.customHours || afternoonTime);
                totalHoursWorked += hours;
              });
              
              // Calculate uncovered hours for afternoon
              const uncoveredAfternoon = maxAfternoon - afternoonOfficers.length;
              if (uncoveredAfternoon > 0) {
                totalHoursUncovered += uncoveredAfternoon * calculateHoursFromTimeString(afternoonTime);
              }
            } else if (currentHour < 13) {
              // Only afternoon shift is in the future (1300-2200)
              filledSlots += afternoonOfficers.length;
              
              // Calculate hours for afternoon shift only
              afternoonOfficers.forEach(officer => {
                const hours = calculateHoursFromTimeString(officer.customHours || afternoonTime);
                totalHoursWorked += hours;
              });
              
              // Calculate uncovered hours for afternoon
              const uncoveredAfternoon = maxAfternoon - afternoonOfficers.length;
              if (uncoveredAfternoon > 0) {
                totalHoursUncovered += uncoveredAfternoon * calculateHoursFromTimeString(afternoonTime);
              }
            }
            // If current hour >= 13, don't count any slots for today
          } else {
            // Future days - count all filled slots and hours
            filledSlots += morningOfficers.length + afternoonOfficers.length;
            
            // Calculate hours for morning shift
            morningOfficers.forEach(officer => {
              const hours = calculateHoursFromTimeString(officer.customHours || morningTime);
              totalHoursWorked += hours;
            });
            
            // Calculate uncovered hours for morning
            const uncoveredMorning = maxMorning - morningOfficers.length;
            if (uncoveredMorning > 0) {
              totalHoursUncovered += uncoveredMorning * calculateHoursFromTimeString(morningTime);
            }
            
            // Calculate hours for afternoon shift
            afternoonOfficers.forEach(officer => {
              const hours = calculateHoursFromTimeString(officer.customHours || afternoonTime);
              totalHoursWorked += hours;
            });
            
            // Calculate uncovered hours for afternoon
            const uncoveredAfternoon = maxAfternoon - afternoonOfficers.length;
            if (uncoveredAfternoon > 0) {
              totalHoursUncovered += uncoveredAfternoon * calculateHoursFromTimeString(afternoonTime);
            }
          }
          
          // Track unique officers (for all slots, regardless of time)
          [...morningOfficers, ...afternoonOfficers].forEach((officer: { name: string } | string) => {
            if (officer && typeof officer === 'object' && officer.name) {
              uniqueOfficers.add(officer.name);
            } else if (officer && typeof officer === 'string') {
              uniqueOfficers.add(officer);
            }
          });
        }
      });
      
      const availableSlots = maxPossibleSlots - filledSlots;
      
      const stats = {
        totalSlots: maxPossibleSlots,
        filledSlots,
        availableSlots,
        thisMonthUsers: uniqueOfficers.size,
        totalHoursWorked,
        totalHoursUncovered,
      };
      
      // Schedule statistics calculated successfully
      setScheduleStats(stats);
    } catch (error) {
      console.error('Error calculating schedule stats:', error);
      // Fallback: calculate based on remaining weekdays in current month
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth(); // 0-indexed
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
        totalHoursWorked: 0,
        totalHoursUncovered: maxPossibleSlots * 8, // Assuming 8 hours per slot
      });
    }
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };


  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage users and view system statistics</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{users.length}</div>
                <p className="text-xs text-muted-foreground">
                  {users.filter(u => u.role === 'admin').length} admin, {users.filter(u => u.role === 'user').length} officers
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Schedule Coverage</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {scheduleStats.totalSlots > 0 
                    ? Math.round((scheduleStats.filledSlots / scheduleStats.totalSlots) * 100) + '%'
                    : '0%'
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  {scheduleStats.filledSlots}/{scheduleStats.totalSlots} slots filled
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Available Slots</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{scheduleStats.availableSlots}</div>
                <p className="text-xs text-muted-foreground">
                  Shifts remaining for the rest of this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Officers</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{scheduleStats.thisMonthUsers}</div>
                <p className="text-xs text-muted-foreground">
                  Working this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Hours Covered</CardTitle>
                <Timer className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{scheduleStats.totalHoursWorked}</div>
                <p className="text-xs text-muted-foreground">
                  Total hours scheduled
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Hours Uncovered</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{scheduleStats.totalHoursUncovered}</div>
                <p className="text-xs text-muted-foreground">
                  Hours without coverage
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Admin Tools */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Tools</CardTitle>
          <CardDescription>System administration and management tools</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link href="/dashboard/admin/changelog">
              <Button variant="outline" className="w-full h-20 flex flex-col gap-2 hover:bg-accent">
                <Bell className="h-6 w-6" />
                <div className="text-center">
                  <div className="font-semibold">Changelog Management</div>
                  <div className="text-sm text-muted-foreground">Create and manage app updates</div>
                </div>
              </Button>
            </Link>
            <Button variant="outline" className="w-full h-20 flex flex-col gap-2 hover:bg-accent" disabled>
              <Settings className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">System Settings</div>
                <div className="text-sm text-muted-foreground">Coming soon</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users Management */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            View and manage all system users
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {loading ? (
            <UserListSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[640px] rounded-lg border">
                <table className="w-full">
                  <thead>
                    <tr className="bg-navy-900 text-white">
                      <th className="text-left p-3 font-semibold whitespace-nowrap">User</th>
                      <th className="text-left p-3 font-semibold whitespace-nowrap">Role</th>
                      <th className="text-left p-3 font-semibold whitespace-nowrap">Status</th>
                      <th className="text-left p-3 font-semibold whitespace-nowrap">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center p-8 text-muted-foreground">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      users.map((user, index) => (
                        <tr key={user.id} className={`border-t hover:bg-muted/50 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
                          <td className="p-3">
                            <div className="min-w-[200px]">
                              <div className="font-semibold whitespace-nowrap">
                                {user.rank && user.idNumber ? formatOfficerName(user.name, user.rank, user.idNumber) : user.name}
                              </div>
                              <div className="text-sm text-muted-foreground break-all">{user.email}</div>
                            </div>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <Badge 
                              variant={user.role === 'admin' ? 'default' : 'secondary'}
                              className={user.role === 'admin' ? 'bg-navy-800 text-white' : ''}
                            >
                              {user.role}
                            </Badge>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="text-sm">Active</span>
                            </div>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <div className="text-sm">
                              {formatDate(user.createdAt)}
                            </div>
                          </td>
                        </tr>
                      ))
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