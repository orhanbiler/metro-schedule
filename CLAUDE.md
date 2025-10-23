# Claude AI Assistant Changelog

This file documents changes and improvements made by Claude AI to the Metro Schedule application.

## Lint and Typecheck Commands

To ensure code quality, run the following commands before committing:
- `npm run lint` - Check for linting issues
- `npm run typecheck` - Check for TypeScript type errors

## [2025-10-23] - Billable PDF Duplicate Officer Fix

### Problem Identified
User reported duplicate entries for Officer Thypam in the billable PDF, showing as both "Ofc. Thypam #1755" and "Officer Thypam #1755" with different hour counts.

### Root Cause Analysis
The issue was caused by inconsistent officer name formatting where "Officer" and "Ofc." (both meaning the same rank) were being treated as different entries in the payment summary.

### Solution Implemented
1. **Added Officer Name Normalization**
   - Created `normalizeOfficerName()` function that creates consistent keys based on last name and ID number
   - Treats "Officer" and "Ofc." as equivalent rank abbreviations

2. **Added Display Name Standardization**
   - Created `standardizeDisplayName()` function to ensure consistent display format
   - All "Officer" prefixes are converted to "Ofc." for consistency

3. **Updated Payment Aggregation Logic**
   - Modified both morning and afternoon slot processing in `generateBillablePDF()`
   - Officers are now properly grouped regardless of rank abbreviation format

### Files Modified
- `app/dashboard/schedule/page.tsx` (lines 1125-1245)

## [2025-09-19] - OT Slips Date Timezone Issue Resolution

### Problem Identified
User reported that OT Slips were generating with incorrect dates - showing one day earlier than the actual scheduled shift. For example, a shift scheduled for 9/16/2025 from 1300-2200 hours was appearing as 9/15/2025 on both the frontend OT Slips page and the generated PDF.

### Investigation Process
1. Searched for OT Slips related code files
2. Analyzed date handling in `app/dashboard/ot-slips/page.tsx`
3. Traced date flow from schedule creation to display
4. Identified timezone conversion issue when parsing dates from Firebase

### Root Cause Analysis
The issue was caused by JavaScript's `Date` constructor interpreting date strings stored in Firebase as UTC midnight. When these dates were converted back to local time, they could shift to the previous day depending on the user's timezone offset.

### Solution Implemented
1. **Enhanced Date Parsing Logic**
   - Modified the date parsing in `fetchWorkedShiftsForMonth` to properly handle both ISO format dates and regular date strings
   - Extracts just the date portion to avoid timezone shifts

2. **Added Helper Function**
   - Created `parseLocalDate()` function that correctly parses "YYYY-MM-DD" strings into local Date objects
   - Ensures consistent date handling across the application

3. **Updated Display Logic**
   - Modified date display in the shift list view
   - Updated date display in PDF generation
   - Both now use the `parseLocalDate()` helper for consistent results

### Technical Details
```typescript
// Helper function to parse date string and create a proper Date object
const parseLocalDate = (dateStr: string): Date => {
  // dateStr is in format "YYYY-MM-DD"
  const [year, month, day] = dateStr.split('-').map(num => parseInt(num));
  // Create date in local timezone (month is 0-indexed in JS)
  return new Date(year, month - 1, day);
};
```

### Files Modified
- `app/dashboard/ot-slips/page.tsx`

### Testing Considerations
- Verified that dates now display correctly for the reported case (9/16/2025)
- Solution handles various date formats that might be stored in Firebase
- Maintains backward compatibility with existing data

### Deployment
- Changes merged from feature branch `cursor/investigate-overtime-slip-date-discrepancy-f7e9` to `main`
- Successfully pushed to GitHub repository

---