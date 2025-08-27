'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ProtectedRoute from '@/components/auth/protected-route';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  // Sync user data periodically to pick up role changes
  useEffect(() => {
    if (user?.id && user.id !== 'admin-1') {
      const syncUserData = async () => {
        try {
          const response = await fetch('/api/auth/sync-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });

          if (response.ok) {
            const syncedUser = await response.json();
            if (syncedUser.role !== user.role) {
              console.log('Role changed from', user.role, 'to', syncedUser.role);
              setUser(syncedUser);
              localStorage.setItem('user', JSON.stringify(syncedUser));
            }
          }
        } catch (error) {
          console.error('User sync failed:', error);
        }
      };

      // Sync immediately and then every 30 seconds
      syncUserData();
      const interval = setInterval(syncUserData, 30000);

      return () => clearInterval(interval);
    }
  }, [user?.id, user?.role]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <nav className="bg-navy-800 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <div className="flex-shrink-0 flex items-center gap-3">
                  <Image 
                    src="/logo.png" 
                    alt="Cheverly Police Department" 
                    width={32} 
                    height={32}
                    className="rounded"
                  />
                  <h1 className="text-white text-lg sm:text-xl font-bold">
                    Cheverly PD Metro
                  </h1>
                </div>
                <div className="hidden md:ml-6 md:flex md:space-x-4 lg:space-x-8">
                  <Link
                    href="/dashboard"
                    className="text-white hover:bg-navy-600 px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/schedule"
                    className="text-white hover:bg-navy-600 px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Schedule
                  </Link>
                  <Link
                    href="/dashboard/profile"
                    className="text-white hover:bg-navy-600 px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Profile
                  </Link>
                  {user?.role === 'admin' && (
                    <Link
                      href="/dashboard/admin"
                      className="text-white hover:bg-navy-600 px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Admin
                    </Link>
                  )}
                </div>
              </div>
              <div className="hidden md:ml-6 md:flex md:items-center space-x-2 lg:space-x-4">
                <div className="flex flex-col items-end">
                  <span className="text-white text-sm font-medium">
                    {user?.rank && user?.idNumber ? `${user.rank} ${user.name}` : user?.name}
                  </span>
                  <span className="text-navy-300 text-xs">
                    {user?.idNumber ? `#${user.idNumber}` : user?.role}
                  </span>
                </div>
                <ThemeToggle />
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="text-navy-800 bg-white hover:bg-gray-100"
                >
                  Logout
                </Button>
              </div>
              <div className="flex items-center md:hidden space-x-2">
                <ThemeToggle />
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="text-white hover:bg-navy-600 p-2 rounded-md transition-colors"
                  aria-label="Toggle menu"
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    {menuOpen ? (
                      <path d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {menuOpen && (
            <div className="md:hidden bg-navy-700 border-t border-navy-600">
              <div className="px-4 pt-4 pb-3 space-y-1">
                <Link
                  href="/dashboard"
                  className="text-white block px-3 py-3 rounded-md text-base font-medium hover:bg-navy-600 transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/schedule"
                  className="text-white block px-3 py-3 rounded-md text-base font-medium hover:bg-navy-600 transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Schedule
                </Link>
                <Link
                  href="/dashboard/profile"
                  className="text-white block px-3 py-3 rounded-md text-base font-medium hover:bg-navy-600 transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Profile
                </Link>
                {user?.role === 'admin' && (
                  <Link
                    href="/dashboard/admin"
                    className="text-white block px-3 py-3 rounded-md text-base font-medium hover:bg-navy-600 transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    Admin
                  </Link>
                )}
                <div className="border-t border-navy-600 pt-4 mt-4">
                  <div className="px-3 py-2 mb-3">
                    <div className="text-white font-medium">
                      {user?.rank && user?.idNumber ? `${user.rank} ${user.name}` : user?.name}
                    </div>
                    <div className="text-navy-300 text-sm">
                      {user?.idNumber ? `#${user.idNumber} • ${user?.role}` : user?.role}
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-white w-full text-left px-3 py-3 rounded-md text-base font-medium hover:bg-navy-600 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}
        </nav>
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}