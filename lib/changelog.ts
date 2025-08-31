export interface ChangelogEntry {
  version: string;
  date: string;
  type: 'feature' | 'fix' | 'improvement' | 'security';
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.3.0',
    date: '2024-12-31',
    type: 'feature',
    changes: [
      'Added changelog notification system with bell icon',
      'Users can now view application updates and new features',
      'Unread changes are indicated with a notification badge'
    ]
  },
  {
    version: '2.2.0',
    date: '2024-12-31',
    type: 'improvement',
    changes: [
      'Updated shift times: Morning 05:00-13:00, Afternoon 13:00-22:00',
      'Fixed intermittent login redirect issue',
      'Improved authentication flow reliability'
    ]
  },
  {
    version: '2.1.0',
    date: '2024-12-30',
    type: 'improvement',
    changes: [
      'Enhanced mobile navigation with responsive design',
      'Added Cheverly PD logo to navigation and PDF exports',
      'Improved PDF generation with professional formatting'
    ]
  },
  {
    version: '2.0.0',
    date: '2024-12-29',
    type: 'feature',
    changes: [
      'Dual officer support - up to 2 officers per shift',
      'Real-time schedule updates using Firestore listeners',
      'Custom hours selection within shift windows',
      'Admin dashboard with user management capabilities'
    ]
  },
  {
    version: '1.5.0',
    date: '2024-12-28',
    type: 'improvement',
    changes: [
      'Added confirmation dialogs for critical operations',
      'Implemented modern toast notifications system',
      'Enhanced error handling and validation',
      'Improved user profile display with rank and ID'
    ]
  },
  {
    version: '1.0.0',
    date: '2024-12-15',
    type: 'feature',
    changes: [
      'Initial release of Metro Schedule Management System',
      'User authentication with Firebase',
      'Schedule management for metro overtime shifts',
      'PDF export functionality for administrators',
      'Mobile-optimized responsive design'
    ]
  }
];

// Get the latest version
export const CURRENT_VERSION = CHANGELOG[0].version;

// Helper to get changelog entries after a specific version
export function getChangesSinceVersion(lastSeenVersion: string | null): ChangelogEntry[] {
  if (!lastSeenVersion) {
    // If no version seen, show last 3 versions
    return CHANGELOG.slice(0, 3);
  }
  
  const lastSeenIndex = CHANGELOG.findIndex(entry => entry.version === lastSeenVersion);
  if (lastSeenIndex === -1) {
    // Version not found, show last 3 versions
    return CHANGELOG.slice(0, 3);
  }
  
  // Return all versions newer than the last seen version
  return CHANGELOG.slice(0, lastSeenIndex);
}