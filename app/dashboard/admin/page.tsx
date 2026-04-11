'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, CheckCircle, Clock, Bell, Settings, Timer, Mail, Send, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { formatOfficerName } from '@/lib/utils';
import { useScheduleStats } from '@/hooks/use-schedule-stats';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UserListSkeleton, StatsCardSkeleton } from '@/components/schedule/schedule-skeleton';
import { useAuth } from '@/lib/auth-context';

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
  const { firebaseUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [signupDisabled, setSignupDisabled] = useState(false);
  const [savingSignupSetting, setSavingSignupSetting] = useState(false);
  const {
    totalSlots,
    filledSlots,
    remainingAvailable: remainingSlots,
    thisMonthUsers,
    totalHoursWorked,
  } = useScheduleStats();
  const scheduleStats = { totalSlots, filledSlots, remainingSlots, thisMonthUsers, totalHoursWorked };

  // Fetch signup disabled setting
  const fetchSignupSetting = useCallback(async () => {
    try {
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/admin/settings', { headers });
      if (response.ok) {
        const data = await response.json();
        setSignupDisabled(data.signupDisabled ?? false);
      }
    } catch (error) {
      console.error('Error fetching signup setting:', error);
    }
  }, [firebaseUser]);

  // Toggle signup setting
  const handleSignupToggle = async (disabled: boolean) => {
    setSavingSignupSetting(true);
    try {
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers,
        body: JSON.stringify({ signupDisabled: disabled }),
      });

      if (response.ok) {
        setSignupDisabled(disabled);
        toast.success(disabled ? 'Sign-up disabled' : 'Sign-up enabled');
      } else {
        toast.error('Failed to update setting');
      }
    } catch (error) {
      console.error('Error updating signup setting:', error);
      toast.error('Failed to update setting');
    } finally {
      setSavingSignupSetting(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchSignupSetting();
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


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const sendTestEmail = async () => {
    if (!testEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setSendingEmail(true);
    try {
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: testEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Test email sent successfully to ${testEmail}`);
        setTestEmail('');
      } else {
        toast.error(data.error || 'Failed to send test email');
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      toast.error('Failed to send test email');
    } finally {
      setSendingEmail(false);
    }
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
                <div className="text-2xl font-bold text-green-600">{scheduleStats.remainingSlots}</div>
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
                <CardTitle className="text-sm font-medium">Total Worked Hours</CardTitle>
                <Timer className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{scheduleStats.totalHoursWorked}</div>
                <p className="text-xs text-muted-foreground">
                  Hours covered this month
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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

          {/* Sign-up Control */}
          <div className="border-t pt-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Sign-up Control</h3>
            </div>
            <div className="flex items-center justify-between max-w-md">
              <div>
                <p className="text-sm font-medium">Disable New Sign-ups</p>
                <p className="text-sm text-muted-foreground">
                  When enabled, the sign-up link on the login page will be hidden
                </p>
              </div>
              <Switch
                checked={signupDisabled}
                onCheckedChange={handleSignupToggle}
                disabled={savingSignupSetting}
                aria-label="Disable sign-up"
              />
            </div>
          </div>

          {/* Email Test Section */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Test Email Notifications</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Send a test changelog email to verify the email notification system is working correctly.
            </p>
            <div className="flex gap-2 max-w-md">
              <div className="flex-1">
                <Label htmlFor="testEmail" className="sr-only">Test Email Address</Label>
                <Input
                  id="testEmail"
                  type="email"
                  placeholder="Enter email address..."
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  disabled={sendingEmail}
                />
              </div>
              <Button
                onClick={sendTestEmail}
                disabled={sendingEmail || !testEmail.trim()}
                className="flex items-center gap-2"
              >
                {sendingEmail ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Test
                  </>
                )}
              </Button>
            </div>
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
