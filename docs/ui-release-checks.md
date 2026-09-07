# UI simplification release — September 7, 2026

## Behavior

- Mobile has four bottom destinations: Home, Schedule, OT Slips, Profile. Appearance, administration (admins only), and sign out are in Profile. Updates remain in the header.
- Each day shows morning and afternoon coverage together. One signup button opens the hours dialog with a shift choice. Only eligible shifts appear; selecting another shift resets the hour range to that shift.
- Admin assignment and removal remain attached to their corresponding shift. Schedule, billable, and full-schedule PDFs are available from Export.
- Existing scheduling rules, including the temporary self-signup suspension, are unchanged. Server validation remains authoritative.

## Verification

- Production Next.js build and TypeScript checks pass.
- ESLint passes with one existing unused `router` warning in `hooks/use-keyboard-shortcuts.ts`.
- Source comparison confirms the signup, assignment, removal, load/save, all three schedule PDF generators, OT PDF generation, OT fetching, and local-date parsing functions are unchanged.
- Browser checks use isolated synthetic schedules and accounts, with writes intercepted. No production schedule data is modified by UI checks.
- Browser suite passed at 320, 375, 390, 430, 768, and 1280px: single mobile navigation, one signup entry per day, both shift choices and time resets, correct afternoon 18:00–20:00 save payload, full/already-assigned states, failed-save rollback, admin assignment/removal, Profile actions, month selection, loading/errors, and enlarged text.
- All four PDF export actions produced valid PDF downloads in the isolated preview.
- A live-update check confirmed that a selected shift becoming full disables confirmation and requires an explicit new choice; it never silently submits the other shift.
- Semantic theme colors use Tailwind's alpha placeholder so selected navigation, hover states, and subtle card backgrounds generate correctly.

## Manual regression paths

1. At phone widths, verify one bottom navigation bar, no hamburger, active route labels, and content clearance above the home indicator.
2. Open Profile and use appearance options, admin navigation, and sign out. Verify desktop navigation at tablet width.
3. Open a day's signup dialog, switch between morning and afternoon, and confirm the time options and submitted shift match. Verify 2–4 hour limits, cancellation, already assigned/full shifts, and signup suspension for ordinary officers.
4. Assign an officer to the intended shift as an admin, cancel a removal confirmation, and verify past-date/admin override controls remain available.
5. Change month/year and jump to today. Verify loading, empty, and failed-load states.
6. Generate schedule, billable, full-schedule, and OT PDFs. Verify OT date and hours, and billable officer aggregation.
7. Check 320–430px phones, tablet, and desktop in light/dark themes, including keyboard focus and dialog scrolling.

## Deployment

The existing GitHub `main` → Vercel production integration publishes to `https://metro-schedule.vercel.app`. Verify the deployed commit's Vercel status and the production login/protected-route response after push. Authenticated visual checks use fixtures because this workspace has no configured Firebase test account.
