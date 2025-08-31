'use client';

import { useState, useEffect } from 'react';
import { Bell, Sparkles, Wrench, Shield, Bug } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CHANGELOG, CURRENT_VERSION, getChangesSinceVersion, type ChangelogEntry } from '@/lib/changelog';

export function ChangelogDialog() {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Check for unread changes
    const lastSeenVersion = localStorage.getItem('lastSeenChangelogVersion');
    const newChanges = getChangesSinceVersion(lastSeenVersion);
    setUnreadCount(newChanges.length);
    setHasUnread(newChanges.length > 0);
  }, []);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // Mark as read when opened
      localStorage.setItem('lastSeenChangelogVersion', CURRENT_VERSION);
      setHasUnread(false);
      setUnreadCount(0);
    }
  };

  const getTypeIcon = (type: ChangelogEntry['type']) => {
    switch (type) {
      case 'feature':
        return <Sparkles className="h-4 w-4" />;
      case 'improvement':
        return <Wrench className="h-4 w-4" />;
      case 'fix':
        return <Bug className="h-4 w-4" />;
      case 'security':
        return <Shield className="h-4 w-4" />;
    }
  };

  const getTypeBadgeVariant = (type: ChangelogEntry['type']) => {
    switch (type) {
      case 'feature':
        return 'default';
      case 'improvement':
        return 'secondary';
      case 'fix':
        return 'outline';
      case 'security':
        return 'destructive';
    }
  };

  const getTypeLabel = (type: ChangelogEntry['type']) => {
    switch (type) {
      case 'feature':
        return 'New Feature';
      case 'improvement':
        return 'Improvement';
      case 'fix':
        return 'Bug Fix';
      case 'security':
        return 'Security';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          title={hasUnread ? `${unreadCount} new update${unreadCount > 1 ? 's' : ''}` : 'View changelog'}
        >
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            What&apos;s New
          </DialogTitle>
          <DialogDescription>
            Stay updated with the latest features and improvements
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-6">
            {CHANGELOG.map((entry, index) => {
              const isNew = index === 0;
              return (
                <div
                  key={entry.version}
                  className={`relative pb-6 ${
                    index !== CHANGELOG.length - 1 ? 'border-b' : ''
                  }`}
                >
                  {isNew && (
                    <div className="absolute -top-2 -right-2">
                      <Badge className="bg-green-600 text-white">Latest</Badge>
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-semibold">Version {entry.version}</span>
                        <Badge variant={getTypeBadgeVariant(entry.type)} className="gap-1">
                          {getTypeIcon(entry.type)}
                          {getTypeLabel(entry.type)}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">{entry.date}</span>
                    </div>
                  </div>
                  <ul className="space-y-2 mt-3">
                    {entry.changes.map((change, changeIndex) => (
                      <li key={changeIndex} className="flex items-start gap-2 text-sm">
                        <span className="text-primary mt-1">•</span>
                        <span className="flex-1">{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}