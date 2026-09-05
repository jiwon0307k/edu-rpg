// Shared 2x XP Day helpers.
// The toggle in app_settings is the live/global switch admins flip.
// Each daily_entries row also snapshots is_double_day at submission time,
// so past entries keep whatever multiplier applied when they were made,
// even if the toggle is changed later. Titles, bonus points, and penalties
// are never affected by this multiplier.

async function getDoubleXPDayActive() {
    const { data } = await db
        .from('app_settings')
        .select('value')
        .eq('key', 'double_xp_day')
        .single();

    return !!(data && data.value);
}

async function setDoubleXPDayActive(active, adminId) {
    const { error } = await db
        .from('app_settings')
        .update({
            value: active,
            updated_at: new Date().toISOString(),
            updated_by: adminId
        })
        .eq('key', 'double_xp_day');

    return !error;
}

function xpMultiplier(isDoubleDay) {
    return isDoubleDay ? 2 : 1;
}
