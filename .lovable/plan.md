## Plan: Edit URL on Checklist Items

### What
Add an inline edit button to each checklist row so the user can change the company’s URL without deleting and re-adding the row.

### Files to change

1. **src/lib/jobs/api.functions.ts**
   - Add `updateManualCompany` server function (POST, `requireSupabaseAuth`).
   - Input: `{ id: string, url: string }` — URL validated with `z.string().url()`.
   - Handler updates `manual_companies` where `id = data.id` and `user_id = context.userId`.

2. **src/routes/_app.checklist.tsx**
   - Import `Pencil` from `lucide-react`.
   - In `ChecklistRow`, add local state for edit mode (`isEditing`) and edited URL value.
   - Show a small pencil icon next to the row actions.
   - When editing, replace the static URL display with an inline input + Save / Cancel buttons.
   - Wire `updateManualCompany` via `useMutation`, invalidate `manual-companies` query on success.
   - Keep the existing row layout and freshness indicator unchanged.

### UX
- Pencil icon button opens inline edit mode.
- Inline input pre-filled with current URL.
- Save commits the change; Cancel discards it.
- No page reload or route change.
- The company name remains read-only (only URL is editable).