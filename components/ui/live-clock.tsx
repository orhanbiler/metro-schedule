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
    return <div className="mb-3 h-[42px] rounded-lg border bg-muted/40 sm:mb-4" aria-hidden="true" />;
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
      className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm sm:mb-4"
      role="status"
      aria-live="off"
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* Pulsing dot = liveness indicator: it stops if the app hangs. */}
        <span className="relative flex h-2.5 w-2.5 shrink-0" title="Live">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate font-medium text-foreground">{dateLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-base font-semibold tabular-nums tracking-tight text-foreground">
          {timeLabel}
        </span>
        <span className="text-xs text-muted-foreground">{tzAbbr}</span>
      </div>
    </div>
  );
}
