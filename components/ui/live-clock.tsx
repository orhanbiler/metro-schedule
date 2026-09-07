'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * A live date/time strip used as a lightweight debug indicator: if the seconds
 * keep ticking, the app is mounted and responsive, and the date it shows is the
 * exact date the scheduling/sign-up-window logic reads from.
 */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Render a fixed-height placeholder before mount to avoid an SSR/CSR
  // hydration mismatch (server time !== client time) and layout shift.
  if (!now) {
    return <div className="mb-4 h-6 sm:mb-5" aria-hidden="true" />;
  }

  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  // Short timezone label (e.g. "EDT") — handy when debugging window-boundary math.
  const tzAbbr = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();

  return (
    <div
      className="mb-4 flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground sm:mb-5"
      role="status"
      aria-live="off"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          <span className="hidden sm:inline">{dateLabel}</span>
          <span className="sm:hidden">
            {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          {timeLabel}
        </span>
        <span className="text-xs text-muted-foreground">{tzAbbr}</span>
      </div>
    </div>
  );
}
