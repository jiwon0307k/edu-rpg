# Edu-RPG: Student XP Tracking Website

## Project Overview
RPG-style classroom XP tracker for Korean elementary/middle school teachers. Students submit daily XP entries, teacher (admin) approves them. Maintained by a non-developer.

## Tech Stack
- **Frontend**: Plain HTML + CSS + vanilla JavaScript (no frameworks, no build step)
- **Backend/DB/Auth**: Supabase (PostgreSQL + Auth + JS SDK via CDN)
- **Hosting**: Netlify (static file drag & drop)

## File Structure
```
edu-rpg/
├── index.html              # Login page
├── student.html            # Student progress dashboard (경험치 통장)
├── student-input.html      # Student daily XP input form
├── admin-students.html     # Admin student management (list, detail, entry, penalty)
├── admin.html              # Admin settings (value types + penalty types management)
├── admin-approval.html     # Admin pending entry approval
├── css/style.css           # RPG-themed dark CSS (single file)
├── js/
│   ├── supabase-config.js  # Supabase URL + anon key (gitignored credentials)
│   ├── auth.js             # Login/logout/route guard (shared across all pages)
│   ├── date-util.js        # KST timezone date utilities
│   ├── student.js          # Student progress table logic
│   ├── student-input.js    # Student input form logic
│   ├── admin-students.js   # Admin student management logic
│   ├── admin.js            # Admin settings (value/penalty type management)
│   ├── admin-approval.js   # Admin approval logic
│   └── notifications.js    # Shared milestone check + notification bell UI
├── assets/                 # RPG-themed icons/images
└── supabase-setup.sql      # DB schema, RLS policies, seed data, migration SQL
```

## Database (Supabase PostgreSQL)
- **profiles**: user id/name/role/total_xp (FK to auth.users). `total_xp` is a cached column updated on every approve/reject/penalty action.
- **value_types**: admin-managed dynamic subject stamps (국어, 수학, etc.) with points
- **daily_entries**: per-student daily XP record (greetings, assignments, writing, status)
- **entry_value_stamps**: denormalized stamps per entry (snapshots points at time of entry). Has `count` field for multi-count stamps.
- **titles**: student-earned titles (20% XP each, up to 5 per entry)
- **notifications**: milestone alerts when students accumulate every 10 stamps of a value type
- **penalty_types**: admin-managed penalty categories with flexible type system:
  - **일반 (normal)**: flat percentage deduction (e.g., 5%)
  - **비율형 (rate)**: unit-based percentage (e.g., 10% per 10분 of lateness)
  - **초기화 (reset)**: confiscates all remaining XP
- **penalties**: applied penalty records with `count`, `student_name`, `xp_deducted`

RLS enforced: students see only their own data, admin sees all. `is_admin()` SQL helper function. Admin can update any profile (for `total_xp` sync).

## Key Concepts
- **Leveling**: every 100% XP = 1 level. Displayed as "Lv.3 42%"
- **XP sources**: 인사 3%, 가치 stamps (dynamic, default 5% × count), 과제 5% each, 글쓰기 감사일기 5%/주제글쓰기 10%, 칭호 20% each (up to 5)
- **Stamp count**: each value stamp can have count > 1 (e.g., 국어 x3 = 15%). Stored in `entry_value_stamps.count`.
- **Approval flow**: student submits (status=pending) → admin approves/edits/rejects → approved entries count toward XP
- **XP caching**: `profiles.total_xp` is recalculated and saved after every approve/reject/penalty via `recalculateAndSaveXP()`. Student list reads from this cached value for fast loading.
- **Value type snapshots**: when a stamp is recorded, the current point value is copied into entry_value_stamps so historical entries are unaffected by later changes
- **Milestone notifications**: every 10 approved stamps (using count) of the same value type triggers notifications to both student and admin
- **Multi-penalty**: admin can apply multiple penalty types at once. Each penalty row becomes a single DB record with `count` and `xp_deducted`.

## Page Architecture

### Admin Pages (3 pages)
1. **admin-students.html** — Main admin landing page after login
   - Student list (reads `profiles.total_xp`, no per-student queries)
   - Student detail timeline (entries + penalties)
   - Admin add entry form (with stamp counts)
   - Multi-penalty application UI
2. **admin.html** — Settings/management page
   - Value type CRUD (가치 종류 관리)
   - Penalty type CRUD with type selector (일반/비율형/초기화)
3. **admin-approval.html** — Pending entry approval
   - Approval cards with approve/edit/reject
   - Edit modal with stamp count inputs

### Student Pages (2 pages)
1. **student.html** — Progress dashboard with XP table and level display
2. **student-input.html** — Daily XP input form with stamp count inputs

## Development Notes
- All JS loaded via `<script>` tags, no modules/bundler. Supabase SDK loaded from CDN.
- Each HTML page includes: supabase CDN → supabase-config.js → auth.js → notifications.js → date-util.js → page-specific JS
- auth.js provides `getProfile()`, `requireAuth(roles)`, `logout()` — used by all pages
- `recalculateAndSaveXP(studentId)` is duplicated in `admin-approval.js` and `admin-students.js` (no module system)
- No routing library; navigation is plain `<a href>` and `window.location.href`
- Admin login redirects to `admin-students.html` (set in auth.js)
- All UI text is in Korean

## Conventions
- Keep it simple — the maintainer is a non-developer teacher
- No build tools, no npm, no transpilation
- One CSS file for everything
- Inline event handlers (onclick) are acceptable for admin UI simplicity
- Prefer `async/await` with Supabase JS SDK v2
- 커밋, 푸쉬를 완료하거나 사용자 피드백 대기 상태로 넘어갈 때, 작업 완료 신호로 bash 명령어 `afplay /System/Library/Sounds/Glass.aiff &`를 실행하여 소리로 알려줄 것.
