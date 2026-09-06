# Edu-RPG: Student XP Tracking Website

## Project Overview
RPG-style classroom XP tracker for Korean elementary/middle school teachers. Students submit daily XP entries, teacher (admin) approves them. Maintained by a non-developer.

Core engineering priorities: strict data integrity (full-reconciliation recalculation, never incremental math), defense-in-depth RLS security, and a consistent no-build-step deployment model.

## Tech Stack
- **Frontend**: Plain HTML + CSS + vanilla JavaScript (no frameworks, no build step)
- **Backend/DB/Auth**: Supabase (PostgreSQL + Auth + JS SDK via CDN)
- **Hosting**: GitHub Pages (static files served directly from the repo, no build/deploy pipeline)

## File Structure
```
edu-rpg/
├── index.html              # Login page
├── student.html            # Student progress dashboard (경험치 통장 + 모은 도장 + 오늘 기록 수정)
├── student-input.html      # Student daily XP input form
├── admin-students.html     # Admin student management (list, detail, entry, batch entry, penalty)
├── admin.html              # Admin settings (value types, penalty types, 2x Day toggle)
├── admin-approval.html     # Admin pending entry approval
├── css/style.css           # "Soft Butter & Pure Milk" theme CSS (single file)
├── js/
│   ├── supabase-config.js  # Supabase URL + anon key (gitignored credentials)
│   ├── auth.js              # Login/logout/route guard (shared across all pages)
│   ├── date-util.js         # KST timezone date utilities
│   ├── double-day.js        # 2x XP Day global toggle + multiplier helper
│   ├── xp-service.js        # Full-Reconciliation recalculation + milestone/notification logic
│   ├── stamp-groups.js      # Shared value-stamp grid renderer + "모은 도장" summary row builder
│   ├── notifications.js     # Notification bell UI (list, mark read/all-read)
│   ├── student.js           # Student progress table, level-up celebration, self-edit modal
│   ├── student-input.js     # Student input form logic
│   ├── admin-students.js    # Admin student management logic (list/detail/entry/edit/delete/penalty)
│   ├── admin-batch-entry.js # "일괄 입력" (batch entry) modal logic
│   ├── admin.js              # Admin settings (value/penalty type management, 2x Day toggle)
│   └── admin-approval.js    # Admin approval logic
├── assets/                 # RPG-themed icons/images
├── supabase-setup.sql      # DB schema, RLS policies, seed data, numbered migrations (1a–1k)
├── README.md                # User-facing overview, setup guide, feature history
└── CLAUDE.md                # This file
```

## Database Schema (Supabase PostgreSQL)

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (FK auth.users), `name`, `role` (student/admin), `total_xp` | `total_xp` is a cache, always rewritten by `recalculateAndSaveXP()` |
| `value_types` | `id`, `name`, `points`, `active` | Admin-managed stamp categories (국어, 협동, ...). Inactive types are kept, not deleted, so historical stamps stay valid |
| `daily_entries` | `student_id`, `date`, `greetings`, `assignments`, `writing_type`, `bonus_points`, `bonus_reason`, `status` (pending/approved), `is_double_day` | One row per student per submission (direct-add by admin creates `status='approved'` rows directly) |
| `entry_value_stamps` | `entry_id`, `value_type_id`, `value_name`, `points`, `count` | Denormalized: `points`/`value_name` are snapshotted at insert time so later edits to `value_types` never rewrite history |
| `titles` | `student_id`, `entry_id`, `title_name`, `date_earned`, `status` | Up to 5 per entry, 20% XP each; `status` mirrors the parent entry's status |
| `penalty_types` | `id`, `name`, `percent`, `is_reset`, `is_rate`, `rate_unit`, `rate_unit_count`, `active` | 3-way type system: normal / rate-based / full-reset |
| `penalties` | `student_id`, `penalty_type_id`, `xp_deducted`, `count`, `note` | One row per applied penalty (multi-penalty UI creates several rows at once) |
| `notifications` | `recipient_id`, `student_id`, `value_type_name`, `milestone_level`, `message`, `status` | `value_type_name = 'level_up'` is the special level-up notification type |
| `app_settings` | `key`, `value` (boolean) | Single row `key='double_xp_day'` — the global 2x Day switch |

### RLS Policy Summary
`is_admin()` (SECURITY DEFINER SQL function checking `profiles.role = 'admin'`) gates almost every admin-only policy. Key points, because RLS gaps here have caused real bugs (see "Known RLS pitfalls" below):

- **profiles**: readable by everyone (name lookups); a user updates their own row, admin updates any (needed to sync `total_xp`).
- **daily_entries**: student reads/inserts their own; **UPDATE is admin-only by default** (`entries_update`), plus a second, narrower policy (`entries_update_own_pending`) lets a student update their *own* row *only while still `status='pending'`* — both `USING` and `WITH CHECK` re-verify status so a student can never flip their own entry to approved.
- **`entry_value_stamps` / `titles`**: DELETE was originally admin-only (`stamps_delete`, `titles_delete`). Two more policies (`stamps_delete_own_pending`, `titles_delete_own_pending`) let a student delete stamps/titles belonging to their own still-pending entry — required by the student self-edit modal's delete-then-reinsert flow (see below).
- **notifications**: no DELETE policy existed until `notifications_delete` (admin-only) was added for `reconcileMilestoneNotifications()`.
- **app_settings**: everyone reads (need to know if 2x Day is on), only admin updates.

**Known RLS pitfall (already hit once, documented in migration 1j/1k):** a DELETE blocked by RLS does **not** raise an error — it just silently affects 0 rows. Every delete-then-reinsert flow in this codebase therefore checks `{ error }` from the delete call explicitly and aborts the save if it's set, rather than trusting a resolved promise to mean "rows were actually removed." When adding a new table that students or admins need to delete from, add the policy **and** run it before shipping the UI that depends on it — the migration comment convention below exists specifically to catch this class of bug early.

### Migration workflow
New schema/RLS changes are appended to `supabase-setup.sql` under `-- MIGRATION`, numbered sequentially (`1a`, `1b`, ... `1k`, ...), each block commented with **why** it's needed. A migration not yet confirmed applied is marked `-- RUN THIS NOW (not yet applied)`. Claude/any AI assistant working on this repo cannot execute SQL directly — every new migration must be written here and the user told explicitly which block to run in the Supabase SQL Editor.

## Core Engineering Patterns

### Full-Reconciliation recalculation (`recalculateAndSaveXP`, `js/xp-service.js`)
The single source of truth for `profiles.total_xp`. Never does incremental `+`/`-` math. On every call it:
1. Re-queries **all** `daily_entries` with `status='approved'` for the student.
2. Sums greetings/assignments/writing/bonus per entry (applying `is_double_day` per-entry, not a live toggle).
3. Re-queries all `entry_value_stamps` for those entries and sums `points * count`.
4. Re-queries all `status='approved'` `titles` (20% each).
5. Subtracts all `penalties.xp_deducted` for the student.
6. Clamps to `>= 0`, writes the new `total_xp`, diffs old vs. new level to fire level-up notifications, then calls `checkMilestones()`.

Call this after **any** operation that can change a student's approved XP total: approve, reject, edit, delete, apply/edit a penalty, direct admin add. It is duplicated verbatim in intent (not literally, but structurally) wherever a page needs it — there's no module system to share a single copy across pages that don't already load `xp-service.js`.

### Milestone reconciliation (`checkMilestones` / `reconcileMilestoneNotifications`, `js/xp-service.js`)
`checkMilestones(studentId, studentName)` only ever **adds** notifications (every 10 approved stamps of a value type, checked against existing sent notifications to avoid duplicates). It never removes one — so if a delete or edit drops an approved stamp count back below a milestone already notified, that "ghost" notification would otherwise block the milestone from ever firing again honestly. `reconcileMilestoneNotifications(studentId)` fixes this: it recomputes current approved stamp counts and deletes any notification whose `milestone_level` now exceeds what the data actually supports. Call it after any delete/edit that can reduce an approved stamp count (already wired into `deleteRecordAndRefresh` and the record-edit save paths in `admin-students.js`).

### Delete & Replace for child records (stamps/titles)
Whenever an entry's `entry_value_stamps` or `titles` need to reflect a new set of checked stamps/typed titles (student self-edit modal, admin edit modal), the pattern is always:
1. `DELETE FROM entry_value_stamps WHERE entry_id = ?` — check `{ error }`, throw/abort on failure.
2. Insert fresh rows built from the currently-checked checkboxes/inputs.
3. Same two steps for `titles`.

Never patch individual rows. This guarantees the DB always matches exactly what's checked in the modal, with no leftover rows from a previous save — the class of bug this prevents (RLS silently blocking the delete, so re-inserts pile on top of untouched old rows) is exactly what happened before migration 1j existed; see `supabase-setup.sql` 1j/1k comments for the postmortem.

### 2x XP Day (`js/double-day.js`, `app_settings`, `daily_entries.is_double_day`)
`app_settings.double_xp_day` is the live global toggle an admin flips from `admin.html`. Every *new* `daily_entries` row snapshots the toggle's value into its own `is_double_day` column at submission/creation time. All XP math (`recalculateAndSaveXP`, table rendering, live preview) reads the **entry's own** `is_double_day`, never the live toggle — so switching the toggle off never retroactively halves XP that was already earned during the event. Titles, bonus points, and penalties are never multiplied. `xpMultiplier(isDoubleDay)` (`double-day.js`) is the single `1`/`2` lookup used everywhere this matters.

### Stamp grid & summary row (`js/stamp-groups.js`)
- `renderStampGroups(container, valueTypes, buildItemHTML)` — lays out value types as one 3-column grid, splitting into a "생활"(life) segment and a "학습"(study) segment via `STAMP_GROUP_LIFE`/`STAMP_GROUP_STUDY` name lists, with a dashed divider between them. Used by every stamp-checkbox UI (submission form, admin add-entry, all edit modals).
- `orderValueTypesForDisplay(valueTypes)` — same life-then-study ordering, used for table column order so headers and the grid always agree.
- `buildStampSummaryRow(orderedValueTypes, entries, stamps, trailingCount, leadingCount=4)` — builds the `<tr class="stamp-summary-row">` HTML string inserted as the *first* row of a table's `<thead>`, directly above the real header row. Counts only stamps whose parent `daily_entries.status === 'approved'`. The leading 4 columns (날짜/총경험치/상태/인사) and the trailing columns (whatever follows the value-type columns — 6 on `student.html`, 7 on `admin-students.html` for the extra 관리 column) are each collapsed into a single transparent `colspan`'d `<th>`, so the colspan sum always exactly equals the real header's column count no matter how many value types exist — this is what keeps the table grid from ever visually breaking. Each value-type column gets its own `<th>` with a `.stamp-summary-badge` colored by a 10-count tier (`tier-0`..`tier-4`, via `stampShowcaseTier(count)`).

## Page Architecture

### Admin Pages (3 pages)
1. **admin-students.html** — Main admin landing page after login
   - Student list (reads `profiles.total_xp`, no per-student queries)
   - Student detail timeline (entries + penalties) with the stamp summary row
   - Direct-add entry form (stamps, titles, bonus)
   - Batch entry modal (`admin-batch-entry.js`): same-day bulk entry for the whole class with per-student exceptions
   - Per-row edit/delete for both entries and penalties (always followed by `recalculateAndSaveXP` + `reconcileMilestoneNotifications`)
   - Multi-penalty application UI
2. **admin.html** — Settings/management page
   - Value type CRUD (가치 종류 관리)
   - Penalty type CRUD with type selector (일반/비율형/초기화)
   - 2x XP Day toggle
3. **admin-approval.html** — Pending entry approval
   - Approval cards with approve/edit/reject, "전체 승인"
   - Edit modal: full field set (date/greetings/assignments/writing/bonus/stamps/titles), Delete & Replace on save

### Student Pages (2 pages)
1. **student.html** — Progress dashboard: level display with pending-XP pulse gauge, level-up celebration modal (confetti on level-up and every 5th level), stamp summary row, XP table, and a self-edit modal for the student's own still-pending entry (full field set, same Delete & Replace pattern as the admin edit modal)
2. **student-input.html** — Daily XP input form with stamp count inputs and live XP preview

## Development Notes
- All JS loaded via `<script>` tags, no modules/bundler. Supabase SDK loaded from CDN.
- Typical load order: Supabase CDN → `supabase-config.js` → `auth.js` → `notifications.js` → `date-util.js` → (`xp-service.js` / `double-day.js` / `stamp-groups.js` as needed) → page-specific JS.
- `auth.js` provides `getProfile()`, `requireAuth(roles)`, `logout()` — used by all pages.
- No routing library; navigation is plain `<a href>` and `window.location.href`.
- Admin login redirects to `admin-students.html` (set in `auth.js`).
- All UI text is in Korean.
- **Cache busting**: every local `<link>`/`<script>` tag carries a `?v=YYYYMMDD_label` query string (never applied to external CDN URLs). Whenever `css/style.css` or a JS file changes, bump the version string on every tag referencing that file, across every HTML page that includes it — GitHub Pages/browser caching has repeatedly caused "the fix isn't showing" reports otherwise.

## CSS Design Guidelines ("Soft Butter & Pure Milk")

### Design tokens (`css/style.css` `:root`)
```css
--primary: #F5B738;        /* butter gold accent */
--bg: #FAF3DC;              /* page background */
--bg-card: #FFFEFA;         /* card / input background */
--bg-card-lighter: #F9F5EC; /* nested / lighter card background */
--text: #3E2E1E;            /* body text */
--heading: #2A1B08;         /* headings */
--text-muted: #8A7A52;
--border: #ECE2CD;
--border-table: #F0E7D6;
--danger: #E66760;
```
Always reference these variables rather than hardcoding hex values in shared components — one-off modal-specific tones (e.g. a slightly richer cream/tan for a single form) are the exception, not the default, and should be scoped to that component's own selectors.

### Form field geometry
Every text/number/date/select input across admin add-entry, admin edit, admin-approval edit, and the student self-edit modal is standardized to:
```css
height: 40px;
box-sizing: border-box;
border-radius: 8px;
```
`<select>` elements additionally need `appearance: none` + a custom SVG chevron background-image, or they fall back to ugly native OS chrome — every select in this app follows the same pattern (see `#admin-writing`, `#edit-writing`, `#edit-entry-writing`, `#edit-penalty-type` in `style.css`).

### Value-stamp chip (`.stamp-count-item`)
Rectangular tag (border-radius: 8px, not a pill) used for every stamp checkbox+count control across the app (submission form, admin forms, all edit modals). Mobile/tablet breakpoints override padding/font-size for density but explicitly reset `height: auto` so the fixed desktop height never forces oversized chips on small screens — check both breakpoints (`@media max-width: 1024px` and `767px`) before changing this component's base sizing.

### "모은 도장" tier colors (`.stamp-summary-badge`)
| Tier | Count | Look |
|---|---|---|
| tier-0 | 0 | dashed border, faded (`opacity: 0.5`) |
| tier-1 | 1–9 | light butter cream |
| tier-2 | 10–19 | bold golden butter |
| tier-3 | 20–29 | bold amber gold |
| tier-4 | 30+ | metallic gold gradient + inset highlight + drop shadow ("master" tier) |

## Conventions
- Keep it simple — the maintainer is a non-developer teacher
- No build tools, no npm, no transpilation
- One CSS file for everything
- Inline event handlers (onclick) are acceptable for admin UI simplicity
- Prefer `async/await` with Supabase JS SDK v2
- 커밋, 푸쉬를 완료하거나 사용자 피드백 대기 상태로 넘어갈 때, 작업 완료 신호로 bash 명령어 `afplay /System/Library/Sounds/Glass.aiff &`를 실행하여 소리로 알려줄 것.
