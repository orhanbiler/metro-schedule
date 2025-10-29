'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/auth/protected-route';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ChangelogDialog } from '@/components/ui/changelog-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth-context';
import { formatOfficerName } from '@/lib/utils';
import { User, Shield, LogOut, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const navigationLinks = useMemo(
    () => [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/dashboard/schedule', label: 'Schedule' },
    ],
    []
  );


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
                  <div className="relative h-16 w-[72px] sm:w-[72px] lg:w-[76px] xl:w-20">
                    <Image 
                      src="/logo-cool.png" 
                      alt="Cheverly Police Department" 
                      width={120} 
                      height={120}
                      quality={100}
                      priority
                      className="absolute left-0 rounded w-[72px] h-[72px] sm:w-[72px] sm:h-[72px] lg:w-[76px] lg:h-[76px] xl:w-20 xl:h-20"
                      style={{ 
                        top: '50%',
                        transform: 'translateY(-45%)'
                      }}
                    />
                  </div>
                  <h1 className="text-navbar-foreground text-lg sm:text-xl font-bold truncate">
                    <span className="hidden lg:inline">Cheverly PD Metro</span>
                    <span className="lg:hidden">Cheverly PD</span>
                  </h1>
                </div>
                <div className="hidden md:ml-6 md:flex md:space-x-2 lg:space-x-4 xl:space-x-8">
                  {navigationLinks.map((item) => {
                    const isActive = pathname ? pathname.startsWith(item.href) : false;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'px-1 md:px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors',
                          'text-navbar-foreground hover:bg-navbar-hover/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/60',
                          isActive && 'bg-navbar-hover/80 text-white shadow-sm'
                        )}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
              <div className="hidden md:ml-4 md:flex md:items-center space-x-2 lg:space-x-4 flex-shrink-0">
                <ChangelogDialog />
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="text-navbar-foreground hover:bg-navbar-hover px-2 lg:px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      {user?.rank && user?.idNumber ? formatOfficerName(user.name, user.rank, user.idNumber) : user?.name}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/profile" className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/ot-slips" className="cursor-pointer">
                        <FileText className="mr-2 h-4 w-4" />
                        OT Slips
                      </Link>
                    </DropdownMenuItem>
                    {user?.role === 'admin' && (
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard/admin" className="cursor-pointer">
                          <Shield className="mr-2 h-4 w-4" />
                          Admin
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center md:hidden space-x-2">
                <ChangelogDialog />
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
            <div className="md:hidden bg-navbar-hover/95 border-t border-navbar-hover/50 backdrop-blur">
              <div className="px-4 pt-4 pb-3 space-y-1">
                {navigationLinks.map((item) => {
                  const isActive = pathname ? pathname.startsWith(item.href) : false;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'block px-3 py-3 rounded-md text-base font-medium transition-colors',
                        'text-navbar-foreground hover:bg-navbar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/60',
                        isActive && 'bg-navbar-hover/70 text-white shadow-sm'
                      )}
                      onClick={() => setMenuOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                <Link
                  href="/dashboard/profile"
                  className={cn(
                    'block px-3 py-3 rounded-md text-base font-medium transition-colors',
                    'text-navbar-foreground hover:bg-navbar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/60',
                    pathname === '/dashboard/profile' && 'bg-navbar-hover/70 text-white shadow-sm'
                  )}
                  onClick={() => setMenuOpen(false)}
                  aria-current={pathname === '/dashboard/profile' ? 'page' : undefined}
                >
                  Profile
                </Link>
                <Link
                  href="/dashboard/ot-slips"
                  className={cn(
                    'block px-3 py-3 rounded-md text-base font-medium transition-colors',
                    'text-navbar-foreground hover:bg-navbar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/60',
                    pathname?.startsWith('/dashboard/ot-slips') && 'bg-navbar-hover/70 text-white shadow-sm'
                  )}
                  onClick={() => setMenuOpen(false)}
                  aria-current={pathname?.startsWith('/dashboard/ot-slips') ? 'page' : undefined}
                >
                  OT Slips
                </Link>
                {user?.role === 'admin' && (
                  <Link
                    href="/dashboard/admin"
                    className={cn(
                      'block px-3 py-3 rounded-md text-base font-medium transition-colors',
                      'text-navbar-foreground hover:bg-navbar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/60',
                      pathname?.startsWith('/dashboard/admin') && 'bg-navbar-hover/70 text-white shadow-sm'
                    )}
                    onClick={() => setMenuOpen(false)}
                    aria-current={pathname?.startsWith('/dashboard/admin') ? 'page' : undefined}
                  >
                    Admin
                  </Link>
                )}
                <div className="border-t border-navbar-hover/50 pt-4 mt-4">
                  <div className="px-3 py-2 mb-3">
                    <div className="text-navbar-foreground font-medium">
                      {user?.rank && user?.idNumber ? formatOfficerName(user.name, user.rank, user.idNumber) : user?.name}
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
