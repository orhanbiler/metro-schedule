'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User as UserIcon, Mail, Calendar, Clock, Shield } from 'lucide-react';
import Image from 'next/image';
import { formatOfficerName } from '@/lib/utils';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  rank?: string;
  idNumber?: string;
  firebaseAuthUID?: string;
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastOnline, setLastOnline] = useState<string>('');

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
      setLastOnline(new Date().toISOString());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Update last online timestamp periodically
    const interval = setInterval(() => {
      setLastOnline(new Date().toISOString());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
    return `${Math.floor(diffInMinutes / 1440)} days ago`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-muted-foreground">No user data found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Profile Header */}
      <div className="flex items-start gap-6">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center overflow-hidden">
          <Image
            src="/media/avatar/police-avatar-no-bg.png"
            alt="Police Officer Avatar"
            width={80}
            height={80}
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {user.rank && user.idNumber ? formatOfficerName(user.name, user.rank, user.idNumber) : user.name}
          </h1>
          <p className="text-muted-foreground mt-1">{user.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge 
              variant={user.role === 'admin' ? 'default' : 'secondary'}
              className={user.role === 'admin' ? 'bg-navy-800 text-white' : ''}
            >
              <Shield className="w-3 h-3 mr-1" />
              {user.role === 'admin' ? 'Administrator' : 'Officer'}
            </Badge>
            <Badge variant="outline" className="text-green-600 border-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
              Online
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="w-5 h-5" />
              Account Information
            </CardTitle>
            <CardDescription>
              Your basic account details and information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-medium">Email Address</div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <UserIcon className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-medium">Name</div>
                <div className="text-sm text-muted-foreground">{user.name}</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-medium">Role</div>
                <div className="text-sm text-muted-foreground">
                  {user.role === 'admin' ? 'Administrator' : 'Police Officer'}
                </div>
              </div>
            </div>

            {user.idNumber && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 text-muted-foreground mt-0.5 font-bold text-xs">#</div>
                <div>
                  <div className="font-medium">ID Number</div>
                  <div className="text-sm text-muted-foreground font-mono">#{user.idNumber}</div>
                </div>
              </div>
            )}

            {user.rank && (
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="font-medium">Rank</div>
                  <div className="text-sm text-muted-foreground">{user.rank}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Activity Information
            </CardTitle>
            <CardDescription>
              Your account activity and session details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-green-600 mt-0.5" />
              <div>
                <div className="font-medium">Last Online</div>
                <div className="text-sm text-muted-foreground">
                  {formatRelativeTime(lastOnline)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(lastOnline)}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-medium">Account Created</div>
                <div className="text-sm text-muted-foreground">
                  {user.id === 'admin-1' 
                    ? 'System Administrator Account'
                    : 'Registration information not available'
                  }
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 text-muted-foreground mt-0.5">
                <div className="w-full h-full bg-blue-500 rounded-full"></div>
              </div>
              <div>
                <div className="font-medium">Session Status</div>
                <div className="text-sm text-green-600">Active Session</div>
                <div className="text-xs text-muted-foreground">
                  Logged in via web browser
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 text-muted-foreground mt-0.5">
                <div className="w-full h-full bg-purple-500 rounded-sm"></div>
              </div>
              <div>
                <div className="font-medium">Account Type</div>
                <div className="text-sm text-muted-foreground">
                  {user.firebaseAuthUID ? 'Firebase Authenticated' : 'Local Account'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}