'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Users } from 'lucide-react';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface User {
  name: string;
  email: string;
  role: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [scheduleStats, setScheduleStats] = useState({
    totalSlots: 0,
    filledSlots: 0,
    availableSlots: 0,
    thisMonthUsers: 0,
  });

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    
    calculateScheduleStats();
    
    // Set up real-time listener for schedule changes
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
  }, []);

  const calculateScheduleStats = async () => {
    try {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth(); // Keep 0-indexed for API consistency
      const currentYear = currentDate.getFullYear();
      
      // Calculate remaining WEEKDAYS in the current month (from today onwards, excluding weekends)
      const today = currentDate.getDate();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      
      let remainingWeekdays = 0;
      for (let day = today; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dayOfWeek = date.getDay();
        // Skip weekends (0 = Sunday, 6 = Saturday)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          remainingWeekdays++;
        }
      }
      
      const maxPossibleSlots = remainingWeekdays * 4; // 2 morning + 2 afternoon slots per weekday
      
      // Fetch current month's schedule
      const response = await fetch(`/api/schedule?month=${currentMonth}&year=${currentYear}`);
      if (!response.ok) {
        // If no schedule exists, show all slots as available
        setScheduleStats({
          totalSlots: maxPossibleSlots,
          filledSlots: 0,
          availableSlots: maxPossibleSlots,
          thisMonthUsers: 0,
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
        });
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
          const morningOfficers = day.morningSlot?.officers || [];
          const afternoonOfficers = day.afternoonSlot?.officers || [];
          
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
      
      setScheduleStats({
        totalSlots: maxPossibleSlots,
        filledSlots,
        availableSlots,
        thisMonthUsers: uniqueOfficers.size,
      });
    } catch (error) {
      console.error('Error calculating schedule stats:', error);
      // Fallback: calculate based on remaining weekdays in current month
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();
      const today = currentDate.getDate();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      
      let remainingWeekdays = 0;
      for (let day = today; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          remainingWeekdays++;
        }
      }
      
      const maxPossibleSlots = remainingWeekdays * 4;
      
      setScheduleStats({
        totalSlots: maxPossibleSlots,
        filledSlots: 0,
        availableSlots: maxPossibleSlots,
        thisMonthUsers: 0,
      });
    }
  };

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium">Available Shifts</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{scheduleStats.availableSlots} remaining</div>
          <p className="text-xs text-muted-foreground">Open for signup</p>
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