'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/**
 * One-time popup shown after login until the user taps "Got it".
 * Acknowledgment is stored per account (server-side), so it follows the user
 * across devices; localStorage is only a fast-path cache to avoid re-checking
 * the server on every page load. Bump NOTICE_KEY to announce a new notice.
 */
const NOTICE_KEY = 'scheduling-rules-2026-07';

const RULES: { title: string; body: string }[] = [
  {
    title: 'Shift capacity',
    body: 'Each shift now allows 2 officers on Tue–Thu and 3 on Mon/Fri — counted per shift, even if your hours don’t overlap. Once those spots are taken, the shift is full.',
  },
  {
    title: 'Minimum hours',
    body: 'Sign-ups must be one continuous block of at least 2 hours (4-hour maximum still applies).',
  },
  {
    title: 'Sign up for your whole month in advance',
    body: 'Sign-ups for the upcoming month open on the 20th for Patrol and the 25th for all other assignments, and close when the new month begins. Schedule everything you plan to work for that month during this window — once the month starts, all remaining open shifts are locked. Last-minute sign-ups (grabbing a shift a day or two before) are no longer allowed. Any change after the month begins must go through the Deputy Chief.',
  },
  {
    title: 'Removals',
    body: 'You can no longer remove yourself from a shift. If you can’t work, contact the Deputy Chief to be removed.',
  },
  {
    title: 'Audit trail',
    body: 'Every sign-up, removal, and hours change is now permanently recorded — date, time, and who made the change.',
  },
];

export function RulesNoticeDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const cacheKey = `noticeAck:${NOTICE_KEY}:${user.id}`;
    if (localStorage.getItem(cacheKey)) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/user/notice-ack?key=${NOTICE_KEY}`);
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json();
          if (data.acknowledged) {
            localStorage.setItem(cacheKey, '1');
            return;
          }
        }
        // Not acknowledged (or check failed and we can't tell) — show the notice
        setOpen(true);
      } catch {
        if (!cancelled) setOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const acknowledge = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await fetch('/api/user/notice-ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: NOTICE_KEY }),
      });
      localStorage.setItem(`noticeAck:${NOTICE_KEY}:${user.id}`, '1');
    } catch {
      // Best effort: the notice will simply show again next login
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[95vw] sm:max-w-[540px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 shrink-0" />
            New Scheduling Rules — Please Read
          </DialogTitle>
          <DialogDescription>
            The Metro overtime sign-up rules have been updated.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 -mr-1">
          <ul className="space-y-3 text-sm">
            {RULES.map((rule) => (
              <li key={rule.title} className="flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">•</span>
                <span className="break-words">
                  <span className="font-semibold">{rule.title}:</span> {rule.body}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Contact the Deputy Chief for scheduling questions.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={acknowledge} disabled={saving} className="w-full sm:w-auto">
            {saving ? 'Saving…' : 'Got it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
