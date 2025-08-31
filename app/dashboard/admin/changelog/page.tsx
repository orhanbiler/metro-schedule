'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, Trash2, Calendar, Sparkles, Wrench, Shield, Bug } from 'lucide-react';
import { toast } from 'sonner';
import { CHANGELOG, type ChangelogEntry, formatCreatorName } from '@/lib/changelog';
import { useAuth } from '@/lib/auth-context';

export default function ChangelogManagementPage() {
  const { user } = useAuth();
  const [changelogs, setChangelogs] = useState<ChangelogEntry[]>(CHANGELOG);
  const [editingEntry, setEditingEntry] = useState<ChangelogEntry | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  const [formData, setFormData] = useState({
    date: '',
    title: '',
    type: 'feature' as ChangelogEntry['type'],
    changes: ['']
  });

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0], // Today's date
      title: '',
      type: 'feature',
      changes: ['']
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingEntry(null);
    resetForm();
  };

  const handleEdit = (entry: ChangelogEntry) => {
    setIsCreating(false);
    setEditingEntry(entry);
    setFormData({
      date: entry.date,
      title: entry.title,
      type: entry.type,
      changes: [...entry.changes]
    });
  };

  const handleSave = async () => {
    if (!formData.date || !formData.title.trim() || formData.changes.some(change => !change.trim())) {
      toast.error('Please fill in all fields');
      return;
    }

    const newEntry: ChangelogEntry = {
      id: isCreating ? Date.now().toString() : editingEntry?.id || '',
      date: formData.date,
      title: formData.title.trim(),
      type: formData.type,
      changes: formData.changes.filter(change => change.trim()),
      createdBy: {
        name: user?.name || 'Unknown User',
        rank: user?.rank,
        idNumber: user?.idNumber
      }
    };

    try {
      const response = await fetch('/api/admin/changelog', {
        method: isCreating ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry: newEntry,
          originalId: editingEntry?.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save changelog');
      }

      // Update local state
      if (isCreating) {
        setChangelogs([newEntry, ...changelogs]);
      } else if (editingEntry) {
        setChangelogs(changelogs.map(entry => 
          entry.id === editingEntry.id ? newEntry : entry
        ));
      }

      toast.success(`Changelog ${isCreating ? 'created' : 'updated'} successfully`);
      
      // Trigger a custom event to notify other components about the changelog update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('changelogUpdated'));
      }
      
      setIsCreating(false);
      setEditingEntry(null);
      resetForm();
    } catch (error) {
      console.error('Error saving changelog:', error);
      toast.error('Failed to save changelog');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch('/api/admin/changelog', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });

      if (!response.ok) {
        throw new Error('Failed to delete changelog');
      }

      setChangelogs(changelogs.filter(entry => entry.id !== id));
      toast.success('Changelog deleted successfully');
      
      // Trigger a custom event to notify other components about the changelog update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('changelogUpdated'));
      }
    } catch (error) {
      console.error('Error deleting changelog:', error);
      toast.error('Failed to delete changelog');
    }
  };

  const addChangeField = () => {
    setFormData({
      ...formData,
      changes: [...formData.changes, '']
    });
  };

  const removeChangeField = (index: number) => {
    setFormData({
      ...formData,
      changes: formData.changes.filter((_, i) => i !== index)
    });
  };

  const updateChange = (index: number, value: string) => {
    const newChanges = [...formData.changes];
    newChanges[index] = value;
    setFormData({
      ...formData,
      changes: newChanges
    });
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Changelog Management</h1>
          <p className="text-muted-foreground">Create and manage application updates and release notes</p>
        </div>
        <Button onClick={handleCreate} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Changelog
        </Button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingEntry) && (
        <Card>
          <CardHeader>
            <CardTitle>{isCreating ? 'Create New' : 'Edit'} Changelog Entry</CardTitle>
            <CardDescription>
              {isCreating ? 'Add a new update to inform users about changes' : 'Modify the selected changelog entry'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                type="text"
                placeholder="e.g., Update #1, Version 2.1.0, Security Patch"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={formData.type} onValueChange={(value: ChangelogEntry['type']) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feature">New Feature</SelectItem>
                    <SelectItem value="improvement">Improvement</SelectItem>
                    <SelectItem value="fix">Bug Fix</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                    <SelectItem value="ui">UI/UX</SelectItem>
                    <SelectItem value="breaking">Breaking Change</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Changes</Label>
              {formData.changes.map((change, index) => (
                <div key={index} className="flex gap-2">
                  <Textarea
                    value={change}
                    onChange={(e) => updateChange(index, e.target.value)}
                    placeholder="Describe what changed..."
                    className="flex-1"
                    rows={2}
                  />
                  {formData.changes.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeChangeField(index)}
                      className="mt-0 h-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addChangeField}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Another Change
              </Button>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreating(false);
                  setEditingEntry(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {isCreating ? 'Create' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Changelog List */}
      <div className="space-y-4">
        {changelogs.map((entry, index) => (
          <Card key={entry.id}>
            <CardContent className="pt-6 relative">
              <div className="mb-4 pr-16 sm:pr-0">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <span className="text-lg sm:text-xl font-semibold break-words overflow-wrap-anywhere">{entry.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={getTypeBadgeVariant(entry.type)} className="gap-1 text-xs">
                        {getTypeIcon(entry.type)}
                        {entry.type}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                        {formatDate(entry.date)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(entry)}
                      className="gap-1 text-xs sm:text-sm"
                    >
                      <Edit2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive text-xs sm:text-sm">
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Changelog Entry</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this changelog entry from {formatDate(entry.date)}? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogAction
                            onClick={() => handleDelete(entry.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    {index === 0 && (
                      <Badge className="bg-green-600 text-white text-xs">Latest</Badge>
                    )}
                  </div>
                </div>
              </div>
              <ul className="space-y-1">
                {entry.changes.map((change, changeIndex) => (
                  <li key={changeIndex} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-1 flex-shrink-0">•</span>
                    <span className="break-words">{change}</span>
                  </li>
                ))}
              </ul>
              {entry.createdBy && (
                <div className="text-right mt-2 text-xs text-muted-foreground w-full">
                  - {formatCreatorName(entry.createdBy)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}