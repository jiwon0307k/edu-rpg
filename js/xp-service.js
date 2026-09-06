// XP Service: recalculation + milestone checks (shared by admin pages)

// --- Milestone reconciliation ---
// Deleting or editing an approved entry can drop a student's approved-stamp
// count for a value type back below a milestone they were already notified
// about. checkMilestones() only ever ADDS notifications and never removes
// one, so a stale "level 2" notification would silently block a real future
// re-achievement of level 2 (its existingSet check would think it was
// already sent). Call this after anything that can reduce approved stamp
// counts (currently: deleting an approved daily_entries row) so the ghost
// notification is removed and the milestone can fire again honestly.
//
// Note: milestone notifications are NOT linked to the `titles` table in
// this schema (a title is a manually-entered record tied to one entry_id,
// not something checkMilestones ever creates) - so there is no title to
// "reclaim" here, only notifications.
async function reconcileMilestoneNotifications(studentId) {
    const { data: entries } = await db
        .from('daily_entries')
        .select('id')
        .eq('student_id', studentId)
        .eq('status', 'approved');

    const entryIds = (entries || []).map(e => e.id);

    let stamps = [];
    if (entryIds.length > 0) {
        const { data } = await db
            .from('entry_value_stamps')
            .select('value_name, count')
            .in('entry_id', entryIds);
        stamps = data || [];
    }

    const countByName = {};
    stamps.forEach(s => {
        countByName[s.value_name] = (countByName[s.value_name] || 0) + (s.count || 1);
    });

    const { data: existing } = await db
        .from('notifications')
        .select('id, value_type_name, milestone_level')
        .eq('student_id', studentId)
        .neq('value_type_name', 'level_up');

    if (!existing || existing.length === 0) return;

    const staleIds = existing
        .filter(n => n.milestone_level > Math.floor((countByName[n.value_type_name] || 0) / 10))
        .map(n => n.id);

    if (staleIds.length > 0) {
        await db.from('notifications').delete().in('id', staleIds);
    }
}

// --- Milestone check ---
// Called after an entry becomes approved (approve, edit-approve, admin direct add)
async function checkMilestones(studentId, studentName) {
    // Get all approved entries for this student
    const { data: entries } = await db
        .from('daily_entries')
        .select('id')
        .eq('student_id', studentId)
        .eq('status', 'approved');

    if (!entries || entries.length === 0) return;

    const entryIds = entries.map(e => e.id);

    // Get all value stamps for approved entries
    const { data: stamps } = await db
        .from('entry_value_stamps')
        .select('value_type_id, value_name, count')
        .in('entry_id', entryIds);

    if (!stamps || stamps.length === 0) return;

    // Count stamps per value_type_id (using stamp count)
    const countMap = {};
    const nameMap = {};
    stamps.forEach(s => {
        countMap[s.value_type_id] = (countMap[s.value_type_id] || 0) + (s.count || 1);
        nameMap[s.value_type_id] = s.value_name;
    });

    // Get existing notifications for this student to avoid duplicates
    const { data: existing } = await db
        .from('notifications')
        .select('value_type_name, milestone_level')
        .eq('student_id', studentId);

    const existingSet = new Set(
        (existing || []).map(n => `${n.value_type_name}_${n.milestone_level}`)
    );

    // Get admin user id
    const { data: admins } = await db
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

    const adminId = admins && admins.length > 0 ? admins[0].id : null;

    // Check each value type for milestone crossings
    const notifications = [];
    for (const [vtId, count] of Object.entries(countMap)) {
        const valueName = nameMap[vtId];
        // Check every 10-stamp milestone
        const maxLevel = Math.floor(count / 10);
        for (let level = 1; level <= maxLevel; level++) {
            const key = `${valueName}_${level}`;
            if (existingSet.has(key)) continue;

            // Student notification
            notifications.push({
                recipient_id: studentId,
                student_id: studentId,
                value_type_name: valueName,
                milestone_level: level,
                message: `${valueName} ${level}단계 칭호 획득!!`
            });

            // Admin notification
            if (adminId) {
                notifications.push({
                    recipient_id: adminId,
                    student_id: studentId,
                    value_type_name: valueName,
                    milestone_level: level,
                    message: `${studentName} ${valueName} ${level}단계 칭호 획득`
                });
            }
        }
    }

    if (notifications.length > 0) {
        await db.from('notifications').insert(notifications);
    }
}

// --- XP Recalculation Utility ---
async function recalculateAndSaveXP(studentId) {
    const { data: entries } = await db
        .from('daily_entries')
        .select('*')
        .eq('student_id', studentId)
        .eq('status', 'approved');

    let totalXP = 0;

    if (entries && entries.length > 0) {
        entries.forEach(e => {
            // Titles, bonus, and penalties are never doubled - only these four
            const mult = e.is_double_day ? 2 : 1;
            if (e.greetings) totalXP += 3 * mult;
            if (e.assignments > 0) totalXP += e.assignments * 5 * mult;
            if (e.writing_type === '5%') totalXP += 5 * mult;
            if (e.writing_type === '10%') totalXP += 10 * mult;
            if (e.bonus_points) totalXP += e.bonus_points;
        });

        const entryIds = entries.map(e => e.id);
        const { data: stamps } = await db
            .from('entry_value_stamps')
            .select('points, count')
            .in('entry_id', entryIds);

        if (stamps) {
            stamps.forEach(s => totalXP += s.points * (s.count || 1));
        }

        const { data: titles } = await db
            .from('titles')
            .select('id')
            .eq('student_id', studentId)
            .eq('status', 'approved');

        if (titles) {
            totalXP += titles.length * 20;
        }
    }

    const { data: penalties } = await db
        .from('penalties')
        .select('xp_deducted')
        .eq('student_id', studentId);

    if (penalties) {
        penalties.forEach(p => totalXP -= p.xp_deducted);
    }

    totalXP = Math.max(0, totalXP);

    // Fetch profile BEFORE update to get old XP and name
    const { data: profile } = await db
        .from('profiles')
        .select('name, total_xp')
        .eq('id', studentId)
        .single();

    const oldXP = profile?.total_xp || 0;

    await db
        .from('profiles')
        .update({ total_xp: totalXP })
        .eq('id', studentId);

    // Check level-up
    const oldLevel = Math.floor(oldXP / 100) + 1;
    const newLevel = Math.floor(totalXP / 100) + 1;

    if (newLevel > oldLevel) {
        const levelNotifications = [];
        for (let level = oldLevel + 1; level <= newLevel; level++) {
            levelNotifications.push({
                recipient_id: studentId,
                student_id: studentId,
                value_type_name: 'level_up',
                milestone_level: level,
                message: `Lv.${level} 달성! 축하합니다!`
            });
        }

        if (levelNotifications.length > 0) {
            await db.from('notifications').insert(levelNotifications);
        }
    }

    // Check milestones after XP recalculation
    await checkMilestones(studentId, profile?.name || '');

    return totalXP;
}
