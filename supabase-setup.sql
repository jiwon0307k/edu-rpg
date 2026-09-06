-- ============================================
-- Edu-RPG: Supabase Database Setup
-- ============================================
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- After running, create user accounts via Authentication > Users

-- 1. Profiles table
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    total_xp INTEGER NOT NULL DEFAULT 0
);

-- 2. Value types table (admin-managed)
CREATE TABLE value_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 5,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Daily entries table
CREATE TABLE daily_entries (
    id SERIAL PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    greetings BOOLEAN NOT NULL DEFAULT false,
    assignments INTEGER NOT NULL DEFAULT 0,
    writing_type TEXT NOT NULL DEFAULT 'none' CHECK (writing_type IN ('none', '5%', '10%')),
    bonus_points INTEGER NOT NULL DEFAULT 0,
    bonus_reason TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    modified_by UUID REFERENCES profiles(id)
);

-- 4. Entry value stamps table (denormalized)
CREATE TABLE entry_value_stamps (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
    value_type_id INTEGER NOT NULL REFERENCES value_types(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    student_name TEXT NOT NULL,
    value_name TEXT NOT NULL,
    points INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    modified_by UUID REFERENCES profiles(id)
);

-- 5. Titles table
CREATE TABLE titles (
    id SERIAL PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    entry_id INTEGER NOT NULL REFERENCES daily_entries(id) ON DELETE CASCADE,
    title_name TEXT NOT NULL,
    date_earned DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    modified_by UUID REFERENCES profiles(id)
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE value_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_value_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE titles ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- === profiles ===
-- Everyone can read profiles (needed for name lookups)
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
-- Users can update their own profile; admin can update any profile
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid() OR is_admin());
-- Allow insert during signup (handled by trigger below)
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (id = auth.uid() OR is_admin());

-- === value_types ===
-- Everyone can read value types
CREATE POLICY "value_types_select" ON value_types FOR SELECT USING (true);
-- Only admin can insert/update
CREATE POLICY "value_types_insert" ON value_types FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "value_types_update" ON value_types FOR UPDATE USING (is_admin());

-- === daily_entries ===
-- Students can read their own entries; admin can read all
CREATE POLICY "entries_select" ON daily_entries FOR SELECT
    USING (student_id = auth.uid() OR is_admin());
-- Students can insert their own entries
CREATE POLICY "entries_insert" ON daily_entries FOR INSERT
    WITH CHECK (student_id = auth.uid() OR is_admin());
-- Only admin can update entries (for approval)
CREATE POLICY "entries_update" ON daily_entries FOR UPDATE USING (is_admin());
-- Only admin can delete entries
CREATE POLICY "entries_delete" ON daily_entries FOR DELETE USING (is_admin());

-- === entry_value_stamps ===
-- Students see their own stamps; admin sees all
CREATE POLICY "stamps_select" ON entry_value_stamps FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM daily_entries
            WHERE daily_entries.id = entry_value_stamps.entry_id
            AND (daily_entries.student_id = auth.uid() OR is_admin())
        )
    );
-- Students can insert stamps for their own entries
CREATE POLICY "stamps_insert" ON entry_value_stamps FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM daily_entries
            WHERE daily_entries.id = entry_value_stamps.entry_id
            AND (daily_entries.student_id = auth.uid() OR is_admin())
        )
    );
-- Admin can delete stamps (for edit)
CREATE POLICY "stamps_delete" ON entry_value_stamps FOR DELETE USING (is_admin());

-- === titles ===
-- Students see their own titles; admin sees all
CREATE POLICY "titles_select" ON titles FOR SELECT
    USING (student_id = auth.uid() OR is_admin());
-- Students can insert their own titles
CREATE POLICY "titles_insert" ON titles FOR INSERT
    WITH CHECK (student_id = auth.uid() OR is_admin());
-- Admin can update titles (for approval)
CREATE POLICY "titles_update" ON titles FOR UPDATE USING (is_admin());
-- Admin can delete titles
CREATE POLICY "titles_delete" ON titles FOR DELETE USING (is_admin());

-- 6. Notifications table (milestone alerts)
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    value_type_name TEXT NOT NULL,
    milestone_level INTEGER NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'read')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications; admin can read all
CREATE POLICY "notifications_select" ON notifications FOR SELECT
    USING (recipient_id = auth.uid() OR is_admin());
-- Users can update their own notifications (mark as read)
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE
    USING (recipient_id = auth.uid());
-- Logged-in users can insert notifications (triggered during approval)
CREATE POLICY "notifications_insert" ON notifications FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- 7. Penalty types table (admin-managed)
CREATE TABLE penalty_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    percent INTEGER NOT NULL,
    is_reset BOOLEAN NOT NULL DEFAULT false,
    is_rate BOOLEAN NOT NULL DEFAULT false,
    rate_unit TEXT,
    rate_unit_count INTEGER,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE penalty_types ENABLE ROW LEVEL SECURITY;

-- Everyone can read penalty types
CREATE POLICY "penalty_types_select" ON penalty_types FOR SELECT USING (true);
-- Only admin can insert/update
CREATE POLICY "penalty_types_insert" ON penalty_types FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "penalty_types_update" ON penalty_types FOR UPDATE USING (is_admin());

-- 8. Penalties table (applied penalties)
CREATE TABLE penalties (
    id SERIAL PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    penalty_type_id INTEGER NOT NULL REFERENCES penalty_types(id),
    penalty_type_name TEXT NOT NULL,
    penalty_percent INTEGER NOT NULL,
    xp_deducted INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    student_name TEXT,
    note TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    modified_at TIMESTAMPTZ,
    modified_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;

-- Students can read their own penalties; admin can read all
CREATE POLICY "penalties_select" ON penalties FOR SELECT
    USING (student_id = auth.uid() OR is_admin());
-- Only admin can insert penalties
CREATE POLICY "penalties_insert" ON penalties FOR INSERT WITH CHECK (is_admin());
-- Only admin can delete penalties
CREATE POLICY "penalties_delete" ON penalties FOR DELETE USING (is_admin());

-- ============================================
-- Seed Data: Default value types
-- ============================================
INSERT INTO value_types (name, points, active) VALUES
    ('국어', 5, true),
    ('수학', 5, true),
    ('과학', 5, true),
    ('미술', 5, true),
    ('음악', 5, true);

-- ============================================
-- Seed Data: Default penalty types
-- ============================================
INSERT INTO penalty_types (name, percent, is_reset, is_rate, rate_unit, rate_unit_count) VALUES
    ('욕설', 5, false, false, NULL, NULL),
    ('폭력', 5, false, false, NULL, NULL),
    ('피해', 5, false, false, NULL, NULL),
    ('책임 X', 5, false, false, NULL, NULL),
    ('지각', 10, false, true, '분', 10),
    ('역할 X', 10, false, false, NULL, NULL),
    ('예의 X', 20, false, false, NULL, NULL),
    ('반역', 100, true, false, NULL, NULL);

-- ============================================
-- MIGRATION: Run this on existing databases
-- ============================================

-- 1a. profiles: add total_xp
-- ALTER TABLE profiles ADD COLUMN total_xp INTEGER NOT NULL DEFAULT 0;

-- 1b. penalty_types: replace is_lateness/is_rebel with flexible type system
-- ALTER TABLE penalty_types ADD COLUMN is_reset BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE penalty_types ADD COLUMN is_rate BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE penalty_types ADD COLUMN rate_unit TEXT;
-- ALTER TABLE penalty_types ADD COLUMN rate_unit_count INTEGER;
-- UPDATE penalty_types SET is_reset = true WHERE is_rebel = true;
-- UPDATE penalty_types SET is_rate = true, rate_unit = '분', rate_unit_count = 10 WHERE is_lateness = true;
-- ALTER TABLE penalty_types DROP COLUMN is_lateness;
-- ALTER TABLE penalty_types DROP COLUMN is_rebel;

-- 1c. penalties: add count + student_name
-- ALTER TABLE penalties ADD COLUMN count INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE penalties ADD COLUMN student_name TEXT;
-- UPDATE penalties p SET student_name = pr.name FROM profiles pr WHERE p.student_id = pr.id;

-- 1d. entry_value_stamps: add count
-- ALTER TABLE entry_value_stamps ADD COLUMN count INTEGER NOT NULL DEFAULT 1;

-- 1e. profiles RLS: allow admin to update any profile (for total_xp sync)
-- DROP POLICY "profiles_update_own" ON profiles;
-- CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid() OR is_admin());

-- 1f. daily_entries: add bonus_points and bonus_reason
-- ALTER TABLE daily_entries ADD COLUMN bonus_points INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE daily_entries ADD COLUMN bonus_reason TEXT DEFAULT '';

-- 1g. 2x XP Day event mode -- RUN THIS NOW (not yet applied)
-- Global on/off toggle (app_settings) + a per-entry snapshot flag on
-- daily_entries so an entry keeps whatever multiplier applied when it was
-- submitted, even if the toggle is switched later.
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES profiles(id)
);

INSERT INTO app_settings (key, value)
VALUES ('double_xp_day', false)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_select" ON app_settings FOR SELECT USING (true);
CREATE POLICY "app_settings_update" ON app_settings FOR UPDATE USING (is_admin());

-- 1h. Let a student edit their own daily_entries while still pending -- RUN THIS NOW (not yet applied)
-- (existing "entries_update" policy only allows admin; this adds a second
-- permissive policy so a student can fix their own submission before the
-- teacher approves it, but never touch anyone else's row or flip status
-- to 'approved' themselves - both USING and WITH CHECK re-verify status)
CREATE POLICY "entries_update_own_pending" ON daily_entries
    FOR UPDATE
    USING (student_id = auth.uid() AND status = 'pending')
    WITH CHECK (student_id = auth.uid() AND status = 'pending');

-- 1i. notifications: allow admin to delete stale milestone notifications -- RUN THIS NOW (not yet applied)
-- (there was no DELETE policy at all before, so RLS silently rejected any
-- delete; needed for reconcileMilestoneNotifications() in xp-service.js)
CREATE POLICY "notifications_delete" ON notifications FOR DELETE USING (is_admin());

ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS is_double_day BOOLEAN NOT NULL DEFAULT false;

-- 1j. Let a student rebuild their own pending entry's stamps/titles -- RUN THIS NOW (not yet applied)
-- (stamps_delete/titles_delete were admin-only; the student self-edit modal
-- deletes-then-reinserts stamps/titles the same way the admin edit modal
-- does, so it needs its own narrowly-scoped delete policy)
CREATE POLICY "stamps_delete_own_pending" ON entry_value_stamps
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM daily_entries
            WHERE daily_entries.id = entry_value_stamps.entry_id
            AND daily_entries.student_id = auth.uid()
            AND daily_entries.status = 'pending'
        )
    );

CREATE POLICY "titles_delete_own_pending" ON titles
    FOR DELETE
    USING (
        student_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM daily_entries
            WHERE daily_entries.id = titles.entry_id
            AND daily_entries.status = 'pending'
        )
    );

-- 1k. One-time cleanup: 김지원 2026-09-06 pending 기록에 중복 누적된 협동
-- 도장을 정상 상태(협동 10개/50%, 센스 1개/5%)로 재구성 -- RUN THIS NOW (not yet applied)
-- (Until 1j above was run, stamps_delete had no policy letting a student
-- delete their own pending stamps, so every save of the 오늘의 기록 수정
-- modal silently failed to delete the old 협동 rows and just inserted a
-- fresh set on top - this rebuilds that one entry's stamps from scratch.
-- Run 1j FIRST so future saves don't re-create this same duplication.)
DO $$
DECLARE
    v_entry_id INTEGER;
    v_student_name TEXT;
    v_date DATE;
BEGIN
    SELECT de.id, p.name, de.date
    INTO v_entry_id, v_student_name, v_date
    FROM daily_entries de
    JOIN profiles p ON p.id = de.student_id
    WHERE p.name = '김지원' AND de.date = '2026-09-06' AND de.status = 'pending'
    LIMIT 1;

    IF v_entry_id IS NULL THEN
        RAISE NOTICE '해당 조건(김지원 / 2026-09-06 / pending)의 기록을 찾지 못했습니다. 이미 정리되었거나 조건이 다를 수 있습니다.';
        RETURN;
    END IF;

    DELETE FROM entry_value_stamps WHERE entry_id = v_entry_id;

    INSERT INTO entry_value_stamps (entry_id, value_type_id, date, student_name, value_name, points, count)
    SELECT v_entry_id, vt.id, v_date, v_student_name, vt.name, vt.points, 10
    FROM value_types vt WHERE vt.name = '협동';

    INSERT INTO entry_value_stamps (entry_id, value_type_id, date, student_name, value_name, points, count)
    SELECT v_entry_id, vt.id, v_date, v_student_name, vt.name, vt.points, 1
    FROM value_types vt WHERE vt.name = '센스';
END $$;

-- ============================================
-- SETUP INSTRUCTIONS
-- ============================================
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Go to Authentication > Users > Add User
--    - Create admin: email + password, then run:
--      INSERT INTO profiles (id, name, role) VALUES ('<admin-user-uuid>', '선생님', 'admin');
--    - Create students: email + password, then run:
--      INSERT INTO profiles (id, name, role) VALUES ('<student-user-uuid>', '학생이름', 'student');
-- 3. Copy your Supabase URL and anon key from Settings > API
-- 4. Paste them into js/supabase-config.js
-- 5. Deploy the folder to Netlify (drag & drop)
