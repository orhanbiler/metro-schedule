# Agent Changelog

This file documents changes made by AI agents to the codebase.

## [2025-10-23] - Billable PDF Duplicate Officer Entry Fix

### Fixed
- **Issue**: Billable PDF was showing duplicate entries for officers when their names were formatted differently (e.g., "Ofc. Thypam #1755" appearing separately from "Officer Thypam #1755")
- **Root Cause**: Inconsistent officer name formatting where "Officer" and "Ofc." were treated as different entries despite being the same rank
- **Solution**:
  - Added name normalization function to create consistent grouping keys
  - Implemented display name standardization to ensure "Officer" is always shown as "Ofc."
  - Updated payment aggregation logic to properly combine entries for the same officer

### Changes Made
- Modified `app/dashboard/schedule/page.tsx`:
  - Added `normalizeOfficerName()` helper function (lines 1126-1144)
  - Added `standardizeDisplayName()` helper function (lines 1147-1153)
  - Updated morning slot processing in `generateBillablePDF()` (lines 1174-1195)
  - Updated afternoon slot processing in `generateBillablePDF()` (lines 1216-1237)
  - Updated payment table generation to use standardized display names (lines 1316-1326)

### Impact
- Officers with inconsistent name formatting are now properly grouped in billable PDFs
- Payment summaries correctly aggregate hours for the same officer regardless of rank abbreviation format
- Consistent display format (always "Ofc." instead of mixed "Officer"/"Ofc.")

## [2025-09-19] - OT Slips Date Timezone Fix

### Fixed
- **Issue**: OT Slips were showing dates one day earlier than the actual scheduled shift (e.g., 9/16/2025 showing as 9/15/2025)
- **Root Cause**: Timezone handling issue when parsing dates from Firebase. JavaScript's `Date` constructor was interpreting date strings as UTC midnight, causing timezone shifts
- **Solution**: 
  - Updated date parsing logic to properly handle both ISO format dates and regular date strings
  - Added `parseLocalDate()` helper function to correctly parse "YYYY-MM-DD" strings into local Date objects
  - Updated date display in both the frontend shift list and PDF generation

### Changes Made
- Modified `app/dashboard/ot-slips/page.tsx`:
  - Enhanced date parsing in `fetchWorkedShiftsForMonth` function (lines 83-95)
  - Added `parseLocalDate` helper function (lines 415-420)
  - Updated date display in shift list (line 576)
  - Updated date display in PDF generation (line 296)

### Impact
- Officers will now see the correct date for their scheduled shifts on both the OT Slips page and generated PDFs
- No more confusion about shift dates being off by one day

---