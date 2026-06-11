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
import { formatOfficerName, cn } from '@/lib/utils';
import {
  User,
  Shield,
  LogOut,
  FileText,
  LayoutDashboard,
  CalendarDays,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

// The navbar stays navy in both themes, so nav text must stay literal white;
// theme-aware tokens would flip it dark in light mode
const navFocusRing = 'focus-visible:ring-white/60 focus-visible:ring-offset-0';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const displayName =
    user?.rank && user?.idNumber
      ? formatOfficerName(user.name, user.rank, user.idNumber)
      : user?.name;

  const initials = useMemo(() => {
    if (!user?.name) return '?';
    return user.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }, [user?.name]);

  const primaryLinks = useMemo(
    () => [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/schedule', label: 'Schedule', icon: CalendarDays },
    ],
    []
  );

  const accountLinks = useMemo(() => {
    const links = [
      { href: '/dashboard/profile', label: 'Profile', icon: User },
      { href: '/dashboard/ot-slips', label: 'OT Slips', icon: FileText },
    ];
    if (user?.role === 'admin') {
      links.push({ href: '/dashboard/admin', label: 'Admin', icon: Shield });
    }
    return links;
  }, [user?.role]);

  // Exact match for the dashboard root so it doesn't stay highlighted on sub-pages
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : Boolean(pathname?.startsWith(href));

  const handleLogout = async () => {
    await logout();
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <nav
          className="sticky top-0 z-50 bg-navbar shadow-lg supports-[backdrop-filter]:bg-navbar/90 supports-[backdrop-filter]:backdrop-blur-md"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between gap-2 md:h-16">
              {/* Brand */}
              <Link
                href="/dashboard"
                className={cn(
                  'flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60'
                )}
              >
                <Image
                  src="/logo-cool.png"
                  alt="Cheverly Police Department"
                  width={48}
                  height={48}
                  quality={100}
                  priority
                  className="h-11 w-11 rounded-md object-contain md:h-12 md:w-12"
                />
                <span className="truncate text-base font-bold text-white sm:text-lg">
                  <span className="hidden lg:inline">Cheverly PD Metro</span>
                  <span className="lg:hidden">Cheverly PD</span>
                </span>
              </Link>

              {/* Desktop navigation */}
              <div className="hidden flex-1 items-center gap-1 md:ml-6 md:flex">
                {primaryLinks.map((item) => (
                  <Button
                    key={item.href}
                    asChild
                    variant="ghost"
                    className={cn(
                      'rounded-full px-4 text-white/75 hover:bg-white/10 hover:text-white',
                      navFocusRing,
                      isActive(item.href) && 'bg-white/15 text-white'
                    )}
                  >
                    <Link href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
                      {item.label}
                    </Link>
                  </Button>
                ))}
              </div>

              {/* Desktop actions */}
              <div className="hidden items-center gap-1 md:flex">
                <ChangelogDialog />
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className={cn(
                        'h-auto gap-2 rounded-full p-1 pr-2 text-white hover:bg-white/10 hover:text-white',
                        navFocusRing
                      )}
                      aria-label="Account menu"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
                        {initials}
                      </span>
                      <span className="hidden max-w-[160px] truncate text-sm font-medium lg:block">
                        {displayName}
                      </span>
                      <ChevronDown className="h-4 w-4 text-white/70" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="truncate text-sm font-medium">{displayName}</div>
                      {user?.email && (
                        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                      )}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {accountLinks.map((item) => (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link href={item.href} className="cursor-pointer">
                          <item.icon className="mr-2 h-4 w-4" aria-hidden="true" />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="cursor-pointer text-destructive focus:text-destructive"
                    >
                      <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Mobile actions */}
              <div className="flex items-center gap-1 md:hidden">
                <ChangelogDialog />
                <ThemeToggle />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMenuOpen(!menuOpen)}
                  className={cn(
                    'h-11 w-11 rounded-full text-white hover:bg-white/10 hover:text-white',
                    navFocusRing
                  )}
                  aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={menuOpen}
                  aria-controls="mobile-nav"
                >
                  {menuOpen ? (
                    <X className="h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Menu className="h-6 w-6" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          {menuOpen && (
            <div
              id="mobile-nav"
              className="border-t border-white/10 duration-200 animate-in fade-in slide-in-from-top-2 md:hidden"
            >
              <div className="space-y-1 px-3 pb-4 pt-3">
                {[...primaryLinks, ...accountLinks].map((item) => (
                  <Button
                    key={item.href}
                    asChild
                    variant="ghost"
                    className={cn(
                      'h-auto w-full justify-start gap-3 rounded-lg px-3 py-3 text-base font-medium',
                      'text-white/80 hover:bg-white/10 hover:text-white active:bg-white/15',
                      navFocusRing,
                      isActive(item.href) && 'bg-white/15 text-white'
                    )}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                    >
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </Button>
                ))}
                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{displayName}</div>
                      {user?.email && (
                        <div className="truncate text-xs text-white/60">{user.email}</div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={handleLogout}
                    className={cn(
                      'h-auto w-full justify-start gap-3 rounded-lg px-3 py-3 text-base font-medium',
                      'text-red-300 hover:bg-white/10 hover:text-red-200 active:bg-white/15',
                      navFocusRing
                    )}
                  >
                    <LogOut className="h-5 w-5" aria-hidden="true" />
                    Logout
                  </Button>
                </div>
              </div>
            </div>
          )}
        </nav>
        <main className="mx-auto max-w-7xl px-2 py-3 sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
