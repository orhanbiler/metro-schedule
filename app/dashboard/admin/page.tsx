'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

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
  });

  useEffect(() => {
    fetchUsers();
    calculateScheduleStats();
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

  const calculateScheduleStats = async () => {
    try {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      
      // Calculate remaining days in the current month (from today onwards)
      const today = currentDate.getDate();
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const remainingDays = daysInMonth - today + 1; // +1 to include today
      const maxPossibleSlots = remainingDays * 4; // 2 morning + 2 afternoon slots per day
      
      console.log('Schedule Stats Debug:', {
        currentMonth,
        currentYear,
        today,
        daysInMonth,
        remainingDays,
        maxPossibleSlots
      });
      
      // Fetch current month's schedule
      const response = await fetch(`/api/schedule?month=${currentMonth}&year=${currentYear}`);
      if (!response.ok) {
        console.error('Failed to fetch schedule data');
        // If no schedule exists, show all slots as available
        const fallbackStats = {
          totalSlots: maxPossibleSlots,
          filledSlots: 0,
          availableSlots: maxPossibleSlots,
          thisMonthUsers: 0,
        };
        console.log('Fallback Stats (API error):', fallbackStats);
        setScheduleStats(fallbackStats);
        return;
      }
      
      const data = await response.json();
      // The API returns the document data directly if it exists, or { schedule: [] } if not
      const schedule = data.schedule || data || [];
      
      console.log('Fetched schedule data:', { 
        dataKeys: Object.keys(data), 
        hasScheduleProperty: 'schedule' in data,
        scheduleLength: Array.isArray(schedule) ? schedule.length : 0,
        firstItem: Array.isArray(schedule) ? schedule[0] : null,
        rawData: data
      });
      
      // Ensure schedule is an array and check if empty
      if (!Array.isArray(schedule) || schedule.length === 0) {
        const emptyScheduleStats = {
          totalSlots: maxPossibleSlots,
          filledSlots: 0,
          availableSlots: maxPossibleSlots,
          thisMonthUsers: 0,
        };
        console.log('Empty Schedule Stats:', emptyScheduleStats);
        setScheduleStats(emptyScheduleStats);
        return;
      }
      
      // Calculate actual statistics from existing schedule (only from today onwards)
      let filledSlots = 0;
      const uniqueOfficers = new Set<string>();
      
      schedule.forEach((day: { 
        id: string; 
        date: Date | string; 
        morningSlot?: { officers?: { name: string }[]; maxOfficers?: number }; 
        afternoonSlot?: { officers?: { name: string }[]; maxOfficers?: number } 
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
        
        console.log('Processing day:', { dayId: day.id, date: day.date, dayOfMonth, today });
        
        if (dayOfMonth >= today) {
          const morningOfficers = day.morningSlot?.officers || [];
          const afternoonOfficers = day.afternoonSlot?.officers || [];
          
          console.log('Counting slots for day', dayOfMonth, ':', { 
            morning: morningOfficers.length, 
            afternoon: afternoonOfficers.length 
          });
          
          // Count filled slots
          filledSlots += morningOfficers.length + afternoonOfficers.length;
          
          // Track unique officers
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
      };
      
      console.log('Final Schedule Stats:', stats);
      setScheduleStats(stats);
    } catch (error) {
      console.error('Error calculating schedule stats:', error);
      // Fallback: calculate based on remaining days in current month
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      const today = currentDate.getDate();
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const remainingDays = daysInMonth - today + 1;
      const maxPossibleSlots = remainingDays * 4;
      
      setScheduleStats({
        totalSlots: maxPossibleSlots,
        filledSlots: 0,
        availableSlots: maxPossibleSlots,
        thisMonthUsers: 0,
      });
    }
  };

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
              Open for signup
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
      </div>

      {/* Users Management */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            View and manage all system users
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="text-muted-foreground">Loading users...</div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="bg-navy-900 text-white">
                    <th className="text-left p-3 font-semibold">User</th>
                    <th className="text-left p-3 font-semibold">Role</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                    <th className="text-left p-3 font-semibold">Joined</th>
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
                          <div>
                            <div className="font-semibold">
                              {user.rank && user.idNumber ? `${user.rank} ${user.name} #${user.idNumber}` : user.name}
                            </div>
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge 
                            variant={user.role === 'admin' ? 'default' : 'secondary'}
                            className={user.role === 'admin' ? 'bg-navy-800 text-white' : ''}
                          >
                            {user.role}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-sm">Active</span>
                          </div>
                        </td>
                        <td className="p-3">
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
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => toast.success('Feature coming soon!')}
            >
              <div className="font-semibold">Export User Data</div>
              <div className="text-sm text-muted-foreground mt-1">Download user list as CSV</div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => toast.success('Navigate to Schedule page to manage shifts')}
            >
              <div className="font-semibold">Manage Schedule</div>
              <div className="text-sm text-muted-foreground mt-1">Add or remove shift assignments</div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => window.location.reload()}
            >
              <div className="font-semibold">Refresh Data</div>
              <div className="text-sm text-muted-foreground mt-1">Update user and schedule information</div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => toast.success('System status: All services operational')}
            >
              <div className="font-semibold">System Status</div>
              <div className="text-sm text-muted-foreground mt-1">Check system health</div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}