// Student Progress Page Logic

let currentProfile = null;

(async () => {
    currentProfile = await requireAuth(['student']);
    if (!currentProfile) return;

    document.getElementById('user-name').textContent = currentProfile.name;
    await loadProgressTable();
})();

function calculateLevel(totalXP) {
    const level = Math.floor(totalXP / 100) + 1;
    const remainder = totalXP % 100;
    return { level, remainder };
}

async function loadProgressTable() {
    // Load active value types for column headers
    const { data: valueTypes } = await db
        .from('value_types')
        .select('*')
        .order('id');

    // Build table header with dynamic value type columns
    const thead = document.getElementById('xp-table-head');
    const allValueTypes = valueTypes || [];
    const orderedValueTypes = orderValueTypesForDisplay(allValueTypes);

    let headerHTML = '<th style="min-width:120px;">날짜</th><th>총 경험치</th><th>상태</th><th>인사</th>';
    orderedValueTypes.forEach(vt => {
        headerHTML += `<th${!vt.active ? ' class="inactive-col"' : ''}>${vt.name}</th>`;
    });
    headerHTML += '<th>과제</th><th>글쓰기</th><th style="min-width:120px;">칭호</th><th style="min-width:120px;">보너스</th><th>총 경험치</th><th>누적 경험치</th>';

    // Load entries
    const { data: entries } = await db
        .from('daily_entries')
        .select('*')
        .eq('student_id', currentProfile.id)
        .order('date', { ascending: true });

    // Load value stamps for this student
    const { data: stamps } = await db
        .from('entry_value_stamps')
        .select('*')
        .eq('student_name', currentProfile.name)
        .order('date', { ascending: true });

    // Load titles for this student
    const { data: titles } = await db
        .from('titles')
        .select('*')
        .eq('student_id', currentProfile.id)
        .order('date_earned', { ascending: true });

    // Load penalties for this student
    const { data: penalties } = await db
        .from('penalties')
        .select('*')
        .eq('student_id', currentProfile.id)
        .order('date', { ascending: true });

    const tbody = document.getElementById('xp-table-body');
    tbody.innerHTML = '';

    renderTodayEditBanner((entries || []).find(e => e.status === 'pending' && e.date === getTodayISO()));

    // 6 trailing columns after the value-type columns: 과제/글쓰기/칭호/보너스/총경험치/누적경험치
    const summaryRowHTML = buildStampSummaryRow(orderedValueTypes, entries, stamps, 6);
    thead.innerHTML = summaryRowHTML + '<tr>' + headerHTML + '</tr>';

    const hasEntries = entries && entries.length > 0;
    const hasPenalties = penalties && penalties.length > 0;

    if (!hasEntries && !hasPenalties) {
        document.getElementById('no-data').style.display = 'block';
        return;
    }

    // Build chronological timeline
    const timeline = [];
    if (hasEntries) {
        entries.forEach(e => timeline.push({ type: 'entry', date: e.date, created_at: e.created_at, data: e }));
    }
    if (hasPenalties) {
        penalties.forEach(p => timeline.push({ type: 'penalty', date: p.date, created_at: p.created_at, data: p }));
    }
    timeline.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.created_at || '').localeCompare(b.created_at || '');
    });

    const colCount = allValueTypes.length + 5; // greetings + valueTypes + assignments + writing + titles + bonus

    let cumulativeXP = 0;
    let pendingXP = 0;

    timeline.forEach(item => {
        if (item.type === 'entry') {
            const entry = item.data;
            const row = document.createElement('tr');
            if (entry.status === 'pending') row.classList.add('pending-row');

            const entryStamps = (stamps || []).filter(s => s.entry_id === entry.id);
            const entryTitles = (titles || []).filter(t => t.entry_id === entry.id);

            // Compute the day's total XP first so it can be shown up front
            // (titles, bonus, and penalties are never doubled)
            const mult = entry.is_double_day ? 2 : 1;
            let dailyXP = 0;
            if (entry.greetings) dailyXP += 3 * mult;
            orderedValueTypes.forEach(vt => {
                const stamp = entryStamps.find(s => s.value_type_id === vt.id);
                if (stamp) dailyXP += stamp.points * (stamp.count || 1);
            });
            if (entry.assignments > 0) dailyXP += entry.assignments * 5 * mult;
            if (entry.writing_type === '5%') dailyXP += 5 * mult;
            else if (entry.writing_type === '10%') dailyXP += 10 * mult;
            if (entryTitles.length > 0) dailyXP += entryTitles.length * 20;
            if (entry.bonus_points > 0) dailyXP += entry.bonus_points;

            if (entry.status === 'approved') {
                cumulativeXP += dailyXP;
            } else {
                pendingXP += dailyXP;
            }

            const dateCell = document.createElement('td');
            dateCell.textContent = entry.date;
            row.appendChild(dateCell);

            const totalFrontCell = document.createElement('td');
            totalFrontCell.textContent = dailyXP + '%';
            row.appendChild(totalFrontCell);

            const statusCell = document.createElement('td');
            statusCell.innerHTML = entry.status === 'approved'
                ? '<span class="badge badge-approved">승인</span>'
                : '<span class="badge badge-pending">대기중</span>';
            row.appendChild(statusCell);

            const greetCell = document.createElement('td');
            greetCell.textContent = entry.greetings ? `${3 * mult}%` : '-';
            row.appendChild(greetCell);

            orderedValueTypes.forEach(vt => {
                const stampCell = document.createElement('td');
                const stamp = entryStamps.find(s => s.value_type_id === vt.id);
                if (stamp) {
                    const count = stamp.count || 1;
                    const stampXP = stamp.points * count;
                    stampCell.textContent = count > 1 ? `${stampXP}% (x${count})` : stamp.points + '%';
                } else {
                    stampCell.textContent = '-';
                }
                row.appendChild(stampCell);
            });

            const assignCell = document.createElement('td');
            assignCell.textContent = entry.assignments > 0
                ? `${entry.assignments}개 (${entry.assignments * 5 * mult}%)`
                : '-';
            row.appendChild(assignCell);

            const writeCell = document.createElement('td');
            if (entry.writing_type === '5%') {
                writeCell.textContent = `${5 * mult}%`;
            } else if (entry.writing_type === '10%') {
                writeCell.textContent = `${10 * mult}%`;
            } else {
                writeCell.textContent = '-';
            }
            row.appendChild(writeCell);

            const titleCell = document.createElement('td');
            if (entryTitles.length > 0) {
                titleCell.textContent = entryTitles.map(t => t.title_name).join(', ') + ' (' + (entryTitles.length * 20) + '%)';
            } else {
                titleCell.textContent = '-';
            }
            row.appendChild(titleCell);

            const bonusCell = document.createElement('td');
            if (entry.bonus_points > 0) {
                bonusCell.textContent = entry.bonus_points + '%' + (entry.bonus_reason ? ' (' + entry.bonus_reason + ')' : '');
            } else {
                bonusCell.textContent = '-';
            }
            row.appendChild(bonusCell);

            const totalBackCell = document.createElement('td');
            totalBackCell.textContent = dailyXP + '%';
            row.appendChild(totalBackCell);

            const cumCell = document.createElement('td');
            cumCell.textContent = cumulativeXP + '%';
            row.appendChild(cumCell);

            // Newest entries first, while cumulative XP is still computed oldest-to-newest above
            tbody.insertBefore(row, tbody.firstChild);
        } else {
            // Penalty row
            const p = item.data;
            const row = document.createElement('tr');
            row.classList.add('penalty-row');

            const dateCell = document.createElement('td');
            dateCell.textContent = p.date;
            row.appendChild(dateCell);

            const deductCell = document.createElement('td');
            deductCell.className = 'penalty-xp';
            deductCell.textContent = `-${p.xp_deducted}%`;
            row.appendChild(deductCell);

            const statusCell = document.createElement('td');
            statusCell.innerHTML = '<span class="badge badge-danger">감점</span>';
            row.appendChild(statusCell);

            const descCell = document.createElement('td');
            descCell.colSpan = colCount;
            descCell.className = 'penalty-label';
            descCell.textContent = `🚨 ${p.penalty_type_name}`;
            row.appendChild(descCell);

            cumulativeXP -= p.xp_deducted;
            if (cumulativeXP < 0) cumulativeXP = 0;

            const totalBackCell = document.createElement('td');
            totalBackCell.textContent = '-';
            row.appendChild(totalBackCell);

            const cumCell = document.createElement('td');
            cumCell.textContent = cumulativeXP + '%';
            row.appendChild(cumCell);

            tbody.insertBefore(row, tbody.firstChild);
        }
    });

    // Update level display
    const { level, remainder } = calculateLevel(cumulativeXP);
    document.getElementById('level-badge').textContent = 'Lv.' + level;
    document.getElementById('xp-bar').style.width = remainder + '%';
    document.getElementById('xp-text').textContent = remainder + '%';

    renderPendingXP(cumulativeXP, pendingXP);
    checkLevelUpCelebration(currentProfile.id, level);
}

// --- Level Up Celebration ---
function checkLevelUpCelebration(studentId, currentLevel) {
    const key = `rpg_last_level_${studentId}`;
    const stored = localStorage.getItem(key);
    const isFirstVisit = stored === null;
    const lastLevel = isFirstVisit ? 1 : (parseInt(stored, 10) || 1);

    // First-ever visit on this browser: only announce if they already
    // arrived at a level above the default Lv.1 (e.g. a returning student
    // opening the app on a new device).
    const shouldCelebrate = isFirstVisit ? currentLevel >= 2 : currentLevel > lastLevel;

    if (shouldCelebrate) {
        showLevelUpModal(studentId, currentLevel);
    } else {
        // Nothing to celebrate right now - keep the baseline in sync so a
        // later real level-up is detected correctly.
        localStorage.setItem(key, String(currentLevel));
    }
}

function showLevelUpModal(studentId, level) {
    const isMilestone = level % 5 === 0;

    document.getElementById('level-up-badge').textContent = 'Lv.' + level;
    document.getElementById('level-up-title').textContent = isMilestone
        ? `🎊 레벨 ${level} 도달! 축하해요! ✨`
        : '🎉 레벨 업! 한 단계 성장했어요!';

    const modal = document.getElementById('level-up-modal');
    modal.dataset.studentId = studentId;
    modal.dataset.level = level;
    modal.style.display = 'flex';

    if (isMilestone) {
        fireMilestoneConfetti();
    }
}

// Only saving the level here (not while merely detecting it) is what
// prevents the modal from being skipped if the student refreshes before
// dismissing it.
function closeLevelUpModal() {
    const modal = document.getElementById('level-up-modal');
    const { studentId, level } = modal.dataset;
    if (studentId && level) {
        localStorage.setItem(`rpg_last_level_${studentId}`, level);
    }
    modal.style.display = 'none';
}

function fireMilestoneConfetti() {
    if (typeof confetti !== 'function') return;

    const pastelColors = ['#F7D070', '#FFE89E', '#FFB7B2', '#FFDAC1', '#B5EAD7', '#C7CEEA'];
    const shoot = (originX) => {
        confetti({
            particleCount: 65,
            spread: 80,
            startVelocity: 35,
            gravity: 0.7,
            ticks: 350,
            origin: { x: originX, y: 0.6 },
            colors: pastelColors
        });
    };

    // Relay across left/right/center, 0.8s apart, ~3.5-4s of total confetti
    [0.2, 0.8, 0.5, 0.2, 0.8].forEach((x, i) => {
        setTimeout(() => shoot(x), i * 800);
    });
}

// Visualizes XP still awaiting teacher approval as a translucent pulsing
// overlay continuing on from the confirmed XP bar.
function renderPendingXP(cumulativeXP, pendingXP) {
    const pendingBar = document.getElementById('exp-bar-pending');
    const badge = document.getElementById('pending-xp-badge');

    if (!pendingXP || pendingXP <= 0) {
        pendingBar.style.width = '0%';
        badge.style.display = 'none';
        return;
    }

    const { level: currentLevel, remainder: currentRemainder } = calculateLevel(cumulativeXP);
    const projectedXP = cumulativeXP + pendingXP;
    const { level: projectedLevel, remainder: projectedRemainder } = calculateLevel(projectedXP);
    const willLevelUp = projectedLevel > currentLevel;

    pendingBar.style.left = currentRemainder + '%';
    pendingBar.style.width = (willLevelUp ? 100 - currentRemainder : pendingXP) + '%';
    pendingBar.classList.toggle('level-up-glow', willLevelUp);

    badge.classList.toggle('level-up', willLevelUp);
    badge.style.display = 'inline-block';
    badge.textContent = willLevelUp
        ? `✨ 승인 대기 중: +${pendingXP}% (승인 완료 시 Lv.${projectedLevel} ${projectedRemainder}% 달성 예정! 🎉)`
        : `⏳ 승인 대기 중: +${pendingXP}% (승인 완료 시 Lv.${projectedLevel} ${projectedRemainder}% 예정)`;
}

// --- Edit today's own pending entry (all fields, including stamps/titles,
// which are rebuilt via delete-then-reinsert on save) ---
let todayPendingEntry = null;

function renderTodayEditBanner(entry) {
    todayPendingEntry = entry || null;
    const banner = document.getElementById('today-edit-banner');
    if (banner) banner.style.display = todayPendingEntry ? 'flex' : 'none';
}

function addTodayEditTitleInput() {
    const container = document.getElementById('today-edit-title-inputs');
    const count = container.querySelectorAll('.title-row').length;
    if (count >= 5) {
        alert('칭호는 최대 5개까지 입력할 수 있습니다.');
        return;
    }
    const row = document.createElement('div');
    row.className = 'title-row';
    row.style.marginBottom = '6px';
    row.innerHTML = '<input type="text" name="today-edit-title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline">';
    container.appendChild(row);
}

async function openTodayEditModal() {
    if (!todayPendingEntry) return;

    document.getElementById('today-edit-greetings').checked = todayPendingEntry.greetings;
    document.getElementById('today-edit-assignments').value = todayPendingEntry.assignments || 0;

    const writingValue = todayPendingEntry.writing_type || 'none';
    const writingRadio = document.querySelector(`input[name="today-edit-writing"][value="${writingValue}"]`);
    if (writingRadio) writingRadio.checked = true;

    // Use this entry's own is_double_day flag (not any live toggle) so
    // editing preserves whatever multiplier applied at original submission
    const mult = todayPendingEntry.is_double_day ? 2 : 1;

    const [{ data: valueTypes }, { data: stamps }, { data: titles }] = await Promise.all([
        db.from('value_types').select('*').eq('active', true).order('id'),
        db.from('entry_value_stamps').select('*').eq('entry_id', todayPendingEntry.id),
        db.from('titles').select('*').eq('entry_id', todayPendingEntry.id)
    ]);

    const container = document.getElementById('today-edit-value-stamps');
    renderStampGroups(container, valueTypes || [], vt => {
        const existingStamp = (stamps || []).find(s => s.value_type_id === vt.id);
        const checked = !!existingStamp;
        const count = existingStamp ? (existingStamp.count || 1) : 1;
        return `
            <label class="checkbox-label">
                <input type="checkbox" name="today-edit-vt" value="${vt.id}" data-points="${vt.points * mult}" data-name="${vt.name}" ${checked ? 'checked' : ''}
                    onchange="this.closest('.stamp-count-item').querySelector('.stamp-count').disabled = !this.checked;">
                <span>${vt.name}</span>
            </label>
            <input type="number" class="stamp-count input-small" min="1" max="20" value="${count}" ${checked ? '' : 'disabled'}
                data-vt-id="${vt.id}">
        `;
    });

    const titleContainer = document.getElementById('today-edit-title-inputs');
    titleContainer.innerHTML = '';
    if (titles && titles.length > 0) {
        titles.forEach(t => {
            const row = document.createElement('div');
            row.className = 'title-row';
            row.style.marginBottom = '6px';
            row.innerHTML = `<input type="text" name="today-edit-title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline" value="${t.title_name}">`;
            titleContainer.appendChild(row);
        });
    } else {
        const row = document.createElement('div');
        row.className = 'title-row';
        row.style.marginBottom = '6px';
        row.innerHTML = '<input type="text" name="today-edit-title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline">';
        titleContainer.appendChild(row);
    }

    document.getElementById('today-edit-modal').style.display = 'flex';
}

function closeTodayEditModal() {
    document.getElementById('today-edit-modal').style.display = 'none';
}

let isSavingTodayEdit = false;

async function saveTodayEntryEdit() {
    if (!todayPendingEntry || isSavingTodayEdit) return;
    isSavingTodayEdit = true;

    const saveBtn = document.getElementById('today-edit-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const greetings = document.getElementById('today-edit-greetings').checked;
        const assignments = parseInt(document.getElementById('today-edit-assignments').value) || 0;
        const writingInput = document.querySelector('input[name="today-edit-writing"]:checked');
        const writing = writingInput ? writingInput.value : 'none';

        const entryId = todayPendingEntry.id;
        const auditFields = { modified_at: getNowKST(), modified_by: currentProfile.id };

        // .eq('status', 'pending') double-checks the teacher hasn't approved
        // it in the meantime; .single() then errors if that row is gone
        const { error } = await db
            .from('daily_entries')
            .update({
                greetings,
                assignments,
                writing_type: writing,
                ...auditFields
            })
            .eq('id', entryId)
            .eq('status', 'pending')
            .select()
            .single();

        if (error) {
            alert('수정할 수 없습니다. 이미 승인되었거나 수정 권한이 없습니다.');
            closeTodayEditModal();
            await loadProgressTable();
            return;
        }

        // Rebuild stamps: delete old, insert new. Check .error explicitly -
        // if RLS silently blocks the delete (0 rows affected, no thrown
        // error), inserting anyway would pile duplicates on top of the
        // untouched old rows instead of replacing them.
        const { error: stampsDeleteError } = await db.from('entry_value_stamps').delete().eq('entry_id', entryId);
        if (stampsDeleteError) throw stampsDeleteError;

        const checkedStamps = document.querySelectorAll('input[name="today-edit-vt"]:checked');
        if (checkedStamps.length > 0) {
            const stampRecords = Array.from(checkedStamps).map(cb => {
                const countInput = cb.closest('.stamp-count-item').querySelector('.stamp-count');
                const count = parseInt(countInput.value) || 1;
                return {
                    entry_id: entryId,
                    value_type_id: parseInt(cb.value),
                    date: todayPendingEntry.date,
                    student_name: currentProfile.name,
                    value_name: cb.dataset.name,
                    points: parseInt(cb.dataset.points),
                    count: count,
                    ...auditFields
                };
            });
            await db.from('entry_value_stamps').insert(stampRecords);
        }

        // Rebuild titles: delete old, insert new from edit inputs
        const { error: titlesDeleteError } = await db.from('titles').delete().eq('entry_id', entryId);
        if (titlesDeleteError) throw titlesDeleteError;

        const titleInputs = document.querySelectorAll('#today-edit-title-inputs input[name="today-edit-title-name"]');
        const titleNames = Array.from(titleInputs)
            .map(input => input.value.trim())
            .filter(name => name.length > 0);

        if (titleNames.length > 0) {
            const titleRecords = titleNames.map(name => ({
                student_id: currentProfile.id,
                entry_id: entryId,
                title_name: name,
                date_earned: todayPendingEntry.date,
                status: 'pending',
                ...auditFields
            }));
            await db.from('titles').insert(titleRecords);
        }

        closeTodayEditModal();
        await loadProgressTable();
    } catch (err) {
        console.error('Today entry edit failed:', err);
        alert('수정 처리 중 오류가 발생했습니다. 데이터를 보호하기 위해 변경을 취소합니다.');
    } finally {
        isSavingTodayEdit = false;
        if (saveBtn) saveBtn.disabled = false;
    }
}
