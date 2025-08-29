'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ProtectedRoute from '@/components/auth/protected-route';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuth } from '@/lib/auth-context';
import { formatOfficerName } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);


  const handleLogout = async () => {
    await logout();
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <nav className="sticky top-0 z-50 bg-navbar shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center flex-1 min-w-0">
                <div className="flex-shrink-0 flex items-center gap-3">
                  <Image 
                    src="/logo.png" 
                    alt="Cheverly Police Department" 
                    width={32} 
                    height={32}
                    className="rounded"
                  />
                  <h1 className="text-navbar-foreground text-lg sm:text-xl font-bold truncate">
                    <span className="hidden lg:inline">Cheverly PD Metro</span>
                    <span className="lg:hidden">Cheverly PD</span>
                  </h1>
                </div>
                <div className="hidden md:ml-6 md:flex md:space-x-2 lg:space-x-4 xl:space-x-8">
                  <Link
                    href="/dashboard"
                    className="text-navbar-foreground hover:bg-navbar-hover px-1 md:px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/schedule"
                    className="text-navbar-foreground hover:bg-navbar-hover px-1 md:px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Schedule
                  </Link>
                  <Link
                    href="/dashboard/profile"
                    className="text-navbar-foreground hover:bg-navbar-hover px-1 md:px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Profile
                  </Link>
                  {user?.role === 'admin' && (
                    <Link
                      href="/dashboard/admin"
                      className="text-navbar-foreground hover:bg-navbar-hover px-1 md:px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Admin
                    </Link>
                  )}
                </div>
              </div>
              <div className="hidden md:ml-4 md:flex md:items-center space-x-2 lg:space-x-4 flex-shrink-0">
                <div className="w-8 h-8 bg-navbar-foreground/10 rounded-full flex items-center justify-center overflow-hidden">
                  <Image
                    src="/media/avatar/police-avatar-no-bg.png"
                    alt="User Avatar"
                    width={24}
                    height={24}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex flex-col items-end max-w-[120px] lg:max-w-[160px] xl:max-w-none">
                  <span className="text-navbar-foreground text-sm font-medium truncate w-full text-right">
                    {user?.rank && user?.idNumber ? formatOfficerName(user.name, user.rank, user.idNumber) : user?.name}
                  </span>
                  <span className="text-navbar-foreground opacity-70 text-xs truncate w-full text-right">
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
                  className="text-navbar-foreground hover:bg-navbar-hover p-2 rounded-md transition-colors"
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
            <div className="md:hidden bg-navbar-hover border-t border-navbar-hover/50">
              <div className="px-4 pt-4 pb-3 space-y-1">
                <Link
                  href="/dashboard"
                  className="text-navbar-foreground block px-3 py-3 rounded-md text-base font-medium hover:bg-navbar-hover transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/schedule"
                  className="text-navbar-foreground block px-3 py-3 rounded-md text-base font-medium hover:bg-navbar-hover transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Schedule
                </Link>
                <Link
                  href="/dashboard/profile"
                  className="text-navbar-foreground block px-3 py-3 rounded-md text-base font-medium hover:bg-navbar-hover transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Profile
                </Link>
                {user?.role === 'admin' && (
                  <Link
                    href="/dashboard/admin"
                    className="text-navbar-foreground block px-3 py-3 rounded-md text-base font-medium hover:bg-navbar-hover transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    Admin
                  </Link>
                )}
                <div className="border-t border-navbar-hover/50 pt-4 mt-4">
                  <div className="px-3 py-2 mb-3 flex items-center gap-3">
                    <div className="w-10 h-10 bg-navbar-foreground/10 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                      <Image
                        src="/media/avatar/police-avatar-no-bg.png"
                        alt="User Avatar"
                        width={32}
                        height={32}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-navbar-foreground font-medium">
                        {user?.rank && user?.idNumber ? formatOfficerName(user.name, user.rank, user.idNumber) : user?.name}
                      </div>
                      <div className="text-navbar-foreground opacity-70 text-sm">
                        {user?.idNumber ? `#${user.idNumber} • ${user?.role}` : user?.role}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-navbar-foreground w-full text-left px-3 py-3 rounded-md text-base font-medium hover:bg-navbar-hover transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}
        </nav>
        <main className="max-w-7xl mx-auto py-3 px-2 sm:py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}