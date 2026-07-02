# Claude AI Assistant Changelog

This file documents changes and improvements made by Claude AI to the Metro Schedule application.

## Lint and Typecheck Commands

To ensure code quality, run the following commands before committing:
- `npm run lint` - Check for linting issues
- `npm run typecheck` - Check for TypeScript type errors

## [2026-07-02] - Admin Capacity Override & Schedule Audit Trail

### Problems Identified
1. Per-hour capacity (2 officers on Tue–Thu) was enforced for everyone,
   including admins. When a 3rd officer worked a Wednesday as a one-off,
   there was no way to record it in the system.
2. There was no record of who signed up for or was removed from a shift.
   When an officer claimed he had signed up but wasn't on the schedule,
   admins had no way to verify what happened.

### Solutions Implemented
1. **Admin capacity override (hard ceiling of 3/hr)**
   - `getEffectiveMaxOfficersPerHour(slotDate, isAdmin)` in
     `lib/schedule-utils.ts`: admins may exceed the standard limit up to
     `ADMIN_OVERRIDE_MAX_OFFICERS_PER_HOUR` (3); regular officers keep the
     standard limit (3 Mon/Fri, 2 otherwise).
   - Server validation (`lib/schedule-validation.ts`) now only rejects NEW
     capacity violations, so a previously granted override doesn't block
     unrelated later changes to the same shift. Regular officers still cannot
     join an hour that is already at/over the standard limit.
   - Client checks in `app/dashboard/schedule/page.tsx` use the effective
     limit, so admins see and can assign the 3rd slot.

2. **Schedule audit trail**
   - `lib/schedule-audit.ts` diffs each save and emits entries
     (signup / removal / hours_change) with timestamp, actor (uid, name, id,
     role), affected officer, shift date/slot/hours, self-vs-admin flag, and a
     `capacityOverride` flag when the change exceeded the standard limit.
   - `app/api/schedule/route.ts` persists entries to the `scheduleAudit`
     Firestore collection after every successful save (best-effort; failures
     are logged, never fail the save). Clients cannot read/write the
     collection directly (server-only via Admin SDK; catch-all deny rule).
   - `app/api/admin/audit/route.ts`: admin-only GET, filtered by month/year
     via a single `monthKey` field (no composite index needed).
   - New page `/dashboard/admin/audit` with month navigation and name filter,
     linked from Admin Tools. The log only covers changes made after this
     feature was deployed.

### Files Modified
- `lib/schedule-utils.ts`, `lib/schedule-validation.ts`, `lib/schedule-audit.ts` (new)
- `app/api/schedule/route.ts`, `app/api/admin/audit/route.ts` (new)
- `app/dashboard/schedule/page.tsx`, `app/dashboard/admin/page.tsx`,
  `app/dashboard/admin/audit/page.tsx` (new)

## [2026-06-20] - Date-Based Pay Rates (WMATA July 2026 Increase)

### Problem Identified
WMATA shift pay rates increased effective July 2026. PDFs for June 2026 and
earlier must keep the legacy rates, while July 2026 and onward use the new
rates. Previously the rates were hardcoded, so changing them would have
incorrectly re-priced past months.

### Solution Implemented
1. **Added `getPayRateConfig(year, month)`** in `lib/utils.ts`
   - Returns the rate set that applies to a schedule period.
   - New (current) rates take effect July 2026 (month index 6); June 2026 and
     earlier use the legacy rates.
   - Legacy: $65/hr Sgt.+ / $60/hr below Sgt., $10/hr billable service charge.
   - Current: $105/hr Sgt.+ / $75/hr below Sgt., $5/hr billable service charge.

2. **Made `calculateOfficerPayRate(rank, config)` config-driven**
   - The base rate is now resolved from the passed `PayRateConfig` rather than
     hardcoded constants.

3. **Threaded the config through both PDFs** in `app/dashboard/schedule/page.tsx`
   - `generatePDF` and `generateBillablePDF` compute the config from the
     exported schedule's `selectedYear`/`selectedMonth`.
   - The billable service charge now uses `rateConfig.serviceCharge` instead of
     a hardcoded `+ 5`.
   - The "Pay Rates" footer note is now dynamic, and a billable rate note
     (including the service charge) was added to the billable PDF.

### Files Modified
- `lib/utils.ts`
- `app/dashboard/schedule/page.tsx`

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