'use client';

import { useState, useEffect } from 'react';
import { Bell, Sparkles, Wrench, Shield, Bug } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type ChangelogEntry, formatCreatorName } from '@/lib/changelog';

export function ChangelogDialog() {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [currentEntryId, setCurrentEntryId] = useState('');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const fetchChangelog = async () => {
    try {
      const response = await fetch('/api/changelog/public');
      if (response.ok) {
        const data = await response.json();
        setChangelog(data);
        setCurrentEntryId(data.length > 0 ? data[0].id : '');
        return data;
      }
    } catch (error) {
      console.error('Error fetching changelog:', error);
    }
    return [];
  };

  const checkForUpdates = async () => {
    // Fetch latest changelog data
    const latestChangelog = await fetchChangelog();
    
    // Check for unread changes
    const lastSeenEntryId = localStorage.getItem('lastSeenChangelogEntryId');
    
    let newChanges: ChangelogEntry[] = [];
    if (lastSeenEntryId) {
      // Find new entries since last seen
      const lastSeenIndex = latestChangelog.findIndex((entry: ChangelogEntry) => entry.id === lastSeenEntryId);
      if (lastSeenIndex === -1) {
        // Last seen entry not found, show all entries as new
        newChanges = latestChangelog;
      } else {
        // Show entries before the last seen one
        newChanges = latestChangelog.slice(0, lastSeenIndex);
      }
    } else {
      // No previous entries seen, show all as new
      newChanges = latestChangelog;
    }
    
    setUnreadCount(newChanges.length);
    setHasUnread(newChanges.length > 0);
  };

  useEffect(() => {
    checkForUpdates();
    
    // Listen for changelog updates
    const handleChangelogUpdate = () => {
      // Small delay to ensure the changelog file is updated
      setTimeout(checkForUpdates, 500);
    };
    
    window.addEventListener('changelogUpdated', handleChangelogUpdate);
    
    return () => {
      window.removeEventListener('changelogUpdated', handleChangelogUpdate);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && currentEntryId) {
      // Mark as read when opened
      localStorage.setItem('lastSeenChangelogEntryId', currentEntryId);
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
      case 'update':
        return <Sparkles className="h-4 w-4" />;
      case 'maintenance':
        return <Wrench className="h-4 w-4" />;
      case 'performance':
        return <Wrench className="h-4 w-4" />;
      case 'ui':
        return <Sparkles className="h-4 w-4" />;
      case 'breaking':
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
      case 'update':
        return 'default';
      case 'maintenance':
        return 'outline';
      case 'performance':
        return 'secondary';
      case 'ui':
        return 'default';
      case 'breaking':
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
      case 'update':
        return 'Update';
      case 'maintenance':
        return 'Maintenance';
      case 'performance':
        return 'Performance';
      case 'ui':
        return 'UI/UX';
      case 'breaking':
        return 'Breaking Change';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-white hover:bg-white/20"
          title={hasUnread ? `${unreadCount} new update${unreadCount > 1 ? 's' : ''}` : 'View changelog'}
        >
          <Bell className="h-5 w-5 text-white" />
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
            {changelog.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No updates yet</p>
                <p className="text-sm">Check back later for new features and improvements!</p>
              </div>
            ) : (
              changelog.map((entry, index) => {
              const isNew = index === 0;
              return (
                <div
                  key={entry.id}
                  className={`relative pb-6 ${
                    index !== changelog.length - 1 ? 'border-b' : ''
                  }`}
                >
                  {isNew && (
                    <div className="absolute top-0 right-0">
                      <Badge className="bg-green-600 text-white">Latest</Badge>
                    </div>
                  )}
                  <div className={`flex items-start justify-between mb-3 ${isNew ? 'pr-16' : ''}`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-semibold">{entry.title}</span>
                        <Badge variant={getTypeBadgeVariant(entry.type)} className="gap-1">
                          {getTypeIcon(entry.type)}
                          {getTypeLabel(entry.type)}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">{formatDate(entry.date)}</span>
                    </div>
                  </div>
                  <ul className="space-y-2 mt-3">
                    {entry.changes.map((change, changeIndex) => (
                      <li key={changeIndex} className="flex items-start gap-2 text-sm">
                        <span className="text-primary mt-1 flex-shrink-0">•</span>
                        <span className="flex-1 break-words">{change}</span>
                      </li>
                    ))}
                  </ul>
                  {entry.createdBy && (
                    <div className="text-right mt-2 text-xs text-muted-foreground w-full">
                      - {formatCreatorName(entry.createdBy)}
                    </div>
                  )}
                </div>
              );
            })
          )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}