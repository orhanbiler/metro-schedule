'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/auth/protected-route';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ChangelogDialog } from '@/components/ui/changelog-dialog';
import { RulesNoticeDialog } from '@/components/ui/rules-notice-dialog';
import { LiveClock } from '@/components/ui/live-clock';
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
import { User, Shield, LogOut, FileText, House, CalendarDays, ChevronDown } from 'lucide-react';

const navFocusRing = 'focus-visible:ring-white/60 focus-visible:ring-offset-0';

const mobileLinks = [
  { href: '/dashboard', label: 'Home', icon: House },
  { href: '/dashboard/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/dashboard/ot-slips', label: 'OT Slips', icon: FileText },
  { href: '/dashboard/profile', label: 'Profile', icon: User },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
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

  const primaryLinks = mobileLinks.slice(0, 3);
  if (user?.role === 'admin') {
    primaryLinks.push({ href: '/dashboard/admin', label: 'Admin', icon: Shield });
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : Boolean(pathname?.startsWith(href));

  return (
    <ProtectedRoute>
      <div className="min-h-dvh bg-background">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-background focus:px-4 focus:py-3 focus:text-foreground focus:shadow-lg">
          Skip to content
        </a>
        <header
          className="sticky top-0 z-50 border-b border-white/10 bg-navbar"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <Link href="/dashboard" className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              <Image
                src="/logo-cool.png"
                alt="Cheverly Police Department"
                width={48}
                height={48}
                quality={100}
                priority
                className="h-11 w-11 shrink-0 object-contain"
              />
              <span className="min-w-0 text-white">
                <span className="block text-base font-semibold leading-tight tracking-tight">Cheverly PD</span>
                <span className="mt-0.5 block text-xs text-white/65">Metro detail</span>
              </span>
            </Link>

            <nav aria-label="Main navigation" className="hidden flex-1 items-center gap-1 md:ml-3 md:flex lg:ml-8">
              {primaryLinks.map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant="ghost"
                  className={cn(
                    'h-10 rounded-lg px-3 text-sm text-white/75 hover:bg-white/10 hover:text-white',
                    navFocusRing,
                    isActive(item.href) && 'bg-white/15 text-white'
                  )}
                >
                  <Link href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
                    {item.label}
                  </Link>
                </Button>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-1">
              <ChangelogDialog />
              <div className="hidden items-center gap-1 md:flex">
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className={cn('h-11 gap-2 rounded-lg px-2 text-white hover:bg-white/10 hover:text-white', navFocusRing)}
                      aria-label="Account menu"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
                        {initials}
                      </span>
                      <span className="hidden max-w-[160px] truncate text-sm font-medium xl:block">{displayName}</span>
                      <ChevronDown className="h-4 w-4 text-white/70" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel className="font-normal">
                      <div className="truncate text-sm font-medium">{displayName}</div>
                      {user?.email && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/profile" className="min-h-10 cursor-pointer">
                        <User className="mr-2 h-4 w-4" aria-hidden="true" />
                        Profile & settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="min-h-10 cursor-pointer text-destructive focus:text-destructive">
                      <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="dashboard-content mx-auto max-w-7xl px-4 pt-4 outline-none sm:px-6 sm:pt-6 lg:px-8">
          <LiveClock />
          {children}
        </main>

        <nav aria-label="Mobile navigation" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md md:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-3 pt-2">
            {mobileLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive(item.href) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <item.icon className="h-5 w-5" strokeWidth={isActive(item.href) ? 2.25 : 1.75} aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        <RulesNoticeDialog />
      </div>
    </ProtectedRoute>
  );
}
