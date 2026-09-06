// Admin Students Page Logic

let currentProfile = null;
let allValueTypes = [];
let allPenaltyTypes = [];
let selectedStudentId = null;
let selectedStudentName = null;
let isDoubleDay = false;

(async () => {
    currentProfile = await requireAuth(['admin']);
    if (!currentProfile) return;

    await loadPendingCount();
    await initDoubleDayBadge();
    await loadValueTypes();
    await loadPenaltyTypes();
    await loadStudents();
})();

// --- 2x XP Day ---
async function initDoubleDayBadge() {
    isDoubleDay = await getDoubleXPDayActive();
    document.getElementById('double-day-badge').style.display = isDoubleDay ? 'inline-block' : 'none';
}

function applyAdminDoubleDayLabels() {
    const mult = xpMultiplier(isDoubleDay);
    const fire = isDoubleDay ? ' 🔥' : '';
    document.getElementById('admin-insa-title').textContent = `인사 (${3 * mult}%${fire})`;
    document.getElementById('admin-stamp-title').textContent = `가치 도장 (각 ${5 * mult}%${fire})`;
    document.getElementById('admin-assignment-title').textContent = `과제 개수 (각 ${5 * mult}%${fire})`;
    document.getElementById('admin-writing-5-option').textContent = `감사 일기 (${5 * mult}%${fire})`;
    document.getElementById('admin-writing-10-option').textContent = `주제 글쓰기 (${10 * mult}%${fire})`;
}

// --- Pending Count ---
async function loadPendingCount() {
    const { count } = await db
        .from('daily_entries')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

    const badge = document.getElementById('pending-count');
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline';
    }
}

// --- Load Data ---
async function loadValueTypes() {
    const { data } = await db
        .from('value_types')
        .select('*')
        .order('id');

    allValueTypes = data || [];
}

async function loadPenaltyTypes() {
    const { data } = await db
        .from('penalty_types')
        .select('*')
        .order('id');

    allPenaltyTypes = data || [];
}

function calculateLevel(totalXP) {
    const level = Math.floor(totalXP / 100) + 1;
    const remainder = totalXP % 100;
    return { level, remainder };
}

// --- Students List (fast loading via profiles.total_xp) ---
async function loadStudents() {
    const { data: students } = await db
        .from('profiles')
        .select('id, name, total_xp')
        .eq('role', 'student')
        .order('name');
    console.log(students);

    const tbody = document.getElementById('students-body');
    tbody.innerHTML = '';

    if (!students || students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">등록된 학생이 없습니다.</td></tr>';
        return;
    }

    students.forEach(student => {
        const totalXP = student.total_xp || 0;
        const { level, remainder } = calculateLevel(totalXP);

        const row = document.createElement('tr');
        row.dataset.studentId = student.id;
        if (student.id === selectedStudentId) row.classList.add('student-row-selected');
        row.innerHTML = `
            <td><a href="#" onclick="showStudentDetail('${student.id}', '${student.name}'); return false;">${student.name}</a></td>
            <td><span class="level-badge-small">Lv.${level}</span> ${remainder}%</td>
            <td>${totalXP}%</td>
            <td><button class="btn btn-small btn-secondary" onclick="showStudentDetail('${student.id}', '${student.name}')">상세보기</button></td>
        `;
        tbody.appendChild(row);
    });
}

function highlightSelectedStudentRow(studentId) {
    document.querySelectorAll('#students-body tr').forEach(row => {
        row.classList.toggle('student-row-selected', row.dataset.studentId === studentId);
    });
}

// --- XP Sync ---
async function syncAllXP() {
    if (!confirm('모든 학생의 XP를 재계산합니다. 진행하시겠습니까?')) return;

    const { data: students } = await db
        .from('profiles')
        .select('id')
        .eq('role', 'student');

    if (!students) return;

    for (const student of students) {
        await recalculateAndSaveXP(student.id);
    }

    alert('XP 동기화 완료!');
    await loadStudents();
}

// --- Student Detail ---
async function showStudentDetail(studentId, studentName) {
    selectedStudentId = studentId;
    selectedStudentName = studentName;
    document.getElementById('detail-student-name').textContent = studentName;
    document.getElementById('student-detail-placeholder').style.display = 'none';
    document.getElementById('student-detail').style.display = 'block';
    highlightSelectedStudentRow(studentId);

    // Reset penalty section and add-entry form when switching students
    hidePenaltySection();
    hideAddEntryForm();
    resetAddEntryForm();

    // Set default date for admin entry form
    document.getElementById('admin-entry-date').value = getTodayISO();

    // Refresh 2x day state in case it changed since page load, then update labels
    isDoubleDay = await getDoubleXPDayActive();
    document.getElementById('double-day-badge').style.display = isDoubleDay ? 'inline-block' : 'none';
    applyAdminDoubleDayLabels();
    const mult = xpMultiplier(isDoubleDay);

    // Load admin value stamp checkboxes with count inputs
    const container = document.getElementById('admin-value-stamps');
    renderStampGroups(container, allValueTypes.filter(vt => vt.active), vt => `
        <label class="checkbox-label">
            <input type="checkbox" name="admin-vt" value="${vt.id}" data-points="${vt.points * mult}" data-name="${vt.name}"
                onchange="this.closest('.stamp-count-item').querySelector('.stamp-count').disabled = !this.checked;">
            <span>${vt.name}</span>
        </label>
        <input type="number" class="stamp-count input-small" min="1" max="20" value="1" disabled data-vt-id="${vt.id}">
    `);

    await loadStudentEntries(studentId, studentName);

    document.getElementById('student-detail').scrollIntoView({ behavior: 'smooth' });
}

function hideStudentDetail() {
    document.getElementById('student-detail').style.display = 'none';
    document.getElementById('student-detail-placeholder').style.display = 'block';
    highlightSelectedStudentRow(null);
    selectedStudentId = null;
    selectedStudentName = null;
}

async function loadStudentEntries(studentId, studentName) {
    const { data: entries } = await db
        .from('daily_entries')
        .select('*')
        .eq('student_id', studentId)
        .order('date', { ascending: true });

    const { data: stamps } = await db
        .from('entry_value_stamps')
        .select('*')
        .eq('student_name', studentName)
        .order('date');

    const { data: titles } = await db
        .from('titles')
        .select('*')
        .eq('student_id', studentId)
        .order('date_earned');

    const { data: penalties } = await db
        .from('penalties')
        .select('*')
        .eq('student_id', studentId)
        .order('date', { ascending: true });

    // Build header
    const thead = document.getElementById('detail-table-head');
    const orderedValueTypes = orderValueTypesForDisplay(allValueTypes);
    const midCols = allValueTypes.length + 5; // insa + stamps + assignments + writing + titles + bonus
    let headerHTML = '<tr><th style="min-width:120px;">날짜</th><th>총 경험치</th><th>상태</th><th>인사</th>';
    orderedValueTypes.forEach(vt => {
        headerHTML += `<th${!vt.active ? ' class="inactive-col"' : ''}>${vt.name}</th>`;
    });
    headerHTML += '<th>과제</th><th>글쓰기</th><th style="min-width:120px;">칭호</th><th style="min-width:120px;">보너스</th><th>총 경험치</th><th>누적 경험치</th><th>관리</th></tr>';
    thead.innerHTML = headerHTML;

    const tbody = document.getElementById('detail-table-body');
    tbody.innerHTML = '';

    const hasEntries = entries && entries.length > 0;
    const hasPenalties = penalties && penalties.length > 0;

    if (!hasEntries && !hasPenalties) {
        tbody.innerHTML = `<tr><td colspan="${midCols + 6}" class="text-center text-muted">아직 등록된 기록이 없습니다.</td></tr>`;
        document.getElementById('detail-level-badge').textContent = 'Lv.1';
        document.getElementById('detail-xp-text').textContent = '0%';
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

    let cumulativeXP = 0;

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

            if (entry.status === 'approved') cumulativeXP += dailyXP;

            let cells = `<td>${entry.date}</td>`;
            cells += `<td>${dailyXP}%</td>`;
            cells += `<td>${entry.status === 'approved'
                ? '<span class="badge badge-approved">승인</span>'
                : '<span class="badge badge-pending">대기중</span>'}</td>`;

            cells += entry.greetings ? `<td>${3 * mult}%</td>` : '<td>-</td>';

            orderedValueTypes.forEach(vt => {
                const stamp = entryStamps.find(s => s.value_type_id === vt.id);
                if (stamp) {
                    const count = stamp.count || 1;
                    const stampXP = stamp.points * count;
                    cells += `<td>${count > 1 ? stampXP + '% (x' + count + ')' : stamp.points + '%'}</td>`;
                }
                else { cells += '<td>-</td>'; }
            });

            if (entry.assignments > 0) {
                cells += `<td>${entry.assignments}개 (${entry.assignments * 5 * mult}%)</td>`;
            } else { cells += '<td>-</td>'; }

            if (entry.writing_type === '5%') { cells += `<td>${5 * mult}%</td>`; }
            else if (entry.writing_type === '10%') { cells += `<td>${10 * mult}%</td>`; }
            else { cells += '<td>-</td>'; }

            if (entryTitles.length > 0) {
                cells += `<td>${entryTitles.map(t => t.title_name).join(', ')} (${entryTitles.length * 20}%)</td>`;
            } else { cells += '<td>-</td>'; }

            if (entry.bonus_points > 0) {
                cells += `<td>${entry.bonus_points}%${entry.bonus_reason ? ' (' + entry.bonus_reason + ')' : ''}</td>`;
            } else { cells += '<td>-</td>'; }

            cells += `<td>${dailyXP}%</td>`;
            cells += `<td>${cumulativeXP}%</td>`;
            cells += `<td>
                <button type="button" class="btn-row-edit" title="이 기록 수정" onclick="openEditEntryModal(${entry.id})">✏️</button>
                <button type="button" class="btn-row-delete" title="이 기록 삭제" onclick="deleteEntryRow(${entry.id})">🗑️</button>
            </td>`;

            row.innerHTML = cells;
            // Newest entries first, while cumulative XP is still computed oldest-to-newest above
            tbody.insertBefore(row, tbody.firstChild);
        } else {
            const p = item.data;
            const row = document.createElement('tr');
            row.classList.add('penalty-row');

            const noteText = p.note ? ` (${p.note})` : '';
            const countText = (p.count || 1) > 1 ? ` x${p.count}` : '';

            let cells = `<td>${p.date}</td>`;
            cells += `<td class="penalty-xp">-${p.xp_deducted}%</td>`;
            cells += `<td><span class="badge badge-danger">감점</span></td>`;
            cells += `<td colspan="${midCols}" class="penalty-label">🚨 ${p.penalty_type_name}${countText}${noteText}</td>`;

            cumulativeXP -= p.xp_deducted;
            if (cumulativeXP < 0) cumulativeXP = 0;
            cells += `<td>-</td>`;
            cells += `<td>${cumulativeXP}%</td>`;
            cells += `<td>
                <button type="button" class="btn-row-edit" title="이 감점 수정" onclick="openEditPenaltyModal(${p.id})">✏️</button>
                <button type="button" class="btn-row-delete" title="이 감점 삭제" onclick="deletePenaltyRow(${p.id})">🗑️</button>
            </td>`;

            row.innerHTML = cells;
            tbody.insertBefore(row, tbody.firstChild);
        }
    });

    const { level, remainder } = calculateLevel(cumulativeXP);
    document.getElementById('detail-level-badge').textContent = 'Lv.' + level;
    document.getElementById('detail-xp-text').textContent = remainder + '%';
}

// --- Delete a single record (source-of-truth recalculation, no subtraction math) ---
let isDeletingRecord = false;

async function deleteEntryRow(entryId) {
    if (!confirm('이 기록을 삭제하시겠습니까? 누적 경험치와 레벨이 원천 데이터를 기준으로 자동 재계산됩니다.')) return;

    await deleteRecordAndRefresh(async () => {
        // Clean up everything that hangs off this entry before the entry itself
        await db.from('entry_value_stamps').delete().eq('entry_id', entryId);
        await db.from('titles').delete().eq('entry_id', entryId);

        const { error } = await db.from('daily_entries').delete().eq('id', entryId);
        if (error) throw error;
    });
}

async function deletePenaltyRow(penaltyId) {
    if (!confirm('이 감점 기록을 삭제하시겠습니까? 누적 경험치와 레벨이 원천 데이터를 기준으로 자동 재계산됩니다.')) return;

    await deleteRecordAndRefresh(async () => {
        const { error } = await db.from('penalties').delete().eq('id', penaltyId);
        if (error) throw error;
    });
}

// Shared delete pipeline: perform the DB delete, then rebuild everything from
// the database from scratch (recalculateAndSaveXP re-sums ALL remaining
// daily_entries/stamps/titles/penalties - never a naive total_xp subtraction),
// then re-render the detail table and student list from that fresh state.
// Re-rendering the whole table (instead of just removing one <tr>) is
// deliberate: every row's "누적 경험치" column is a running total computed
// from the rows before it, so surgically deleting a single row would leave
// every other row showing a stale cumulative number - exactly the kind of
// data distortion this feature exists to prevent.
async function deleteRecordAndRefresh(performDelete) {
    if (!selectedStudentId || isDeletingRecord) return;
    isDeletingRecord = true;

    try {
        await performDelete();
        await recalculateAndSaveXP(selectedStudentId);
        // If this deletion dropped an approved stamp count back below a
        // milestone the student was already notified about, clear that
        // stale notification so re-achieving it later fires correctly
        await reconcileMilestoneNotifications(selectedStudentId);
        await loadStudentEntries(selectedStudentId, selectedStudentName);
        await loadStudents();
    } catch (err) {
        console.error('Delete failed:', err);
        alert('삭제 처리 중 오류가 발생했습니다. 데이터를 보호하기 위해 변경을 취소합니다.');
    } finally {
        isDeletingRecord = false;
    }
}

function addEditEntryTitleInput() {
    const container = document.getElementById('edit-entry-title-inputs');
    const count = container.querySelectorAll('.title-row').length;
    if (count >= 5) {
        alert('칭호는 최대 5개까지 입력할 수 있습니다.');
        return;
    }
    const row = document.createElement('div');
    row.className = 'title-row';
    row.style.marginBottom = '6px';
    row.innerHTML = '<input type="text" name="edit-entry-title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline">';
    container.appendChild(row);
}

// --- Edit a single record (core fields + bonus + stamps + titles, all
// rebuilt from scratch on save so the row matches exactly what's shown) ---
let editEntryOriginal = null;

async function openEditEntryModal(entryId) {
    const { data: entry } = await db.from('daily_entries').select('*').eq('id', entryId).single();
    if (!entry) return;
    editEntryOriginal = entry;

    document.getElementById('edit-entry-id').value = entry.id;
    document.getElementById('edit-entry-date-field').value = entry.date;
    document.getElementById('edit-entry-greetings').checked = entry.greetings;
    document.getElementById('edit-entry-assignments').value = entry.assignments || 0;
    document.getElementById('edit-entry-writing').value = entry.writing_type;
    document.getElementById('edit-entry-bonus-points').value = entry.bonus_points || 0;
    document.getElementById('edit-entry-bonus-reason').value = entry.bonus_reason || '';

    // Use this entry's own is_double_day flag (not the live toggle) so
    // editing preserves whatever multiplier applied at original submission
    const editMult = xpMultiplier(entry.is_double_day);

    const [{ data: stamps }, { data: titles }] = await Promise.all([
        db.from('entry_value_stamps').select('*').eq('entry_id', entryId),
        db.from('titles').select('*').eq('entry_id', entryId)
    ]);

    const container = document.getElementById('edit-entry-value-stamps');
    renderStampGroups(container, allValueTypes.filter(vt => vt.active), vt => {
        const existingStamp = (stamps || []).find(s => s.value_type_id === vt.id);
        const checked = !!existingStamp;
        const count = existingStamp ? (existingStamp.count || 1) : 1;
        return `
            <label class="checkbox-label">
                <input type="checkbox" name="edit-entry-vt" value="${vt.id}" data-points="${vt.points * editMult}" data-name="${vt.name}" ${checked ? 'checked' : ''}
                    onchange="this.closest('.stamp-count-item').querySelector('.stamp-count').disabled = !this.checked;">
                <span>${vt.name}</span>
            </label>
            <input type="number" class="stamp-count input-small" min="1" max="20" value="${count}" ${checked ? '' : 'disabled'}
                data-vt-id="${vt.id}">
        `;
    });

    const titleContainer = document.getElementById('edit-entry-title-inputs');
    titleContainer.innerHTML = '';
    if (titles && titles.length > 0) {
        titles.forEach(t => {
            const row = document.createElement('div');
            row.className = 'title-row';
            row.style.marginBottom = '6px';
            row.innerHTML = `<input type="text" name="edit-entry-title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline" value="${t.title_name}">`;
            titleContainer.appendChild(row);
        });
    } else {
        const row = document.createElement('div');
        row.className = 'title-row';
        row.style.marginBottom = '6px';
        row.innerHTML = '<input type="text" name="edit-entry-title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline">';
        titleContainer.appendChild(row);
    }

    document.getElementById('edit-entry-modal').style.display = 'flex';
}

function closeEditEntryModal() {
    document.getElementById('edit-entry-modal').style.display = 'none';
    editEntryOriginal = null;
}

let isSavingEntryEdit = false;

async function saveEntryRowEdit() {
    if (isSavingEntryEdit) return;
    isSavingEntryEdit = true;

    const saveBtn = document.getElementById('edit-entry-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const entryId = parseInt(document.getElementById('edit-entry-id').value);
        const date = document.getElementById('edit-entry-date-field').value;
        const greetings = document.getElementById('edit-entry-greetings').checked;
        const assignments = parseInt(document.getElementById('edit-entry-assignments').value) || 0;
        const writing = document.getElementById('edit-entry-writing').value;
        const bonusPoints = parseInt(document.getElementById('edit-entry-bonus-points').value) || 0;
        const bonusReason = document.getElementById('edit-entry-bonus-reason').value.trim();

        const auditFields = { modified_at: getNowKST(), modified_by: currentProfile.id };

        const { error } = await db
            .from('daily_entries')
            .update({
                date,
                greetings,
                assignments,
                writing_type: writing,
                bonus_points: bonusPoints,
                bonus_reason: bonusReason,
                ...auditFields
            })
            .eq('id', entryId);

        if (error) throw error;

        // Rebuild stamps: delete old, insert new. Check .error explicitly -
        // if RLS silently blocks the delete (0 rows affected, no thrown
        // error), inserting anyway would pile duplicates on top of the
        // untouched old rows instead of replacing them.
        const { error: stampsDeleteError } = await db.from('entry_value_stamps').delete().eq('entry_id', entryId);
        if (stampsDeleteError) throw stampsDeleteError;

        const checkedStamps = document.querySelectorAll('input[name="edit-entry-vt"]:checked');
        if (checkedStamps.length > 0) {
            const stampRecords = Array.from(checkedStamps).map(cb => {
                const countInput = cb.closest('.stamp-count-item').querySelector('.stamp-count');
                const count = parseInt(countInput.value) || 1;
                return {
                    entry_id: entryId,
                    value_type_id: parseInt(cb.value),
                    date: date,
                    student_name: selectedStudentName,
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

        const titleInputs = document.querySelectorAll('#edit-entry-title-inputs input[name="edit-entry-title-name"]');
        const titleNames = Array.from(titleInputs)
            .map(input => input.value.trim())
            .filter(name => name.length > 0);

        if (titleNames.length > 0) {
            const titleRecords = titleNames.map(name => ({
                student_id: selectedStudentId,
                entry_id: entryId,
                title_name: name,
                date_earned: date,
                status: editEntryOriginal ? editEntryOriginal.status : 'approved',
                ...auditFields
            }));
            await db.from('titles').insert(titleRecords);
        }

        // Source-of-truth recalculation, then rebuild the whole table so
        // every row's running "누적 경험치" stays consistent
        await recalculateAndSaveXP(selectedStudentId);
        // Editing stamps can drop an approved stamp count back below a
        // milestone the student was already notified about - same risk as
        // deleting a record, so clear any now-stale notification
        await reconcileMilestoneNotifications(selectedStudentId);
        closeEditEntryModal();
        await loadStudentEntries(selectedStudentId, selectedStudentName);
        await loadStudents();
    } catch (err) {
        console.error('Entry edit failed:', err);
        alert('수정 처리 중 오류가 발생했습니다. 데이터를 보호하기 위해 변경을 취소합니다.');
    } finally {
        isSavingEntryEdit = false;
        if (saveBtn) saveBtn.disabled = false;
    }
}

let editingPenaltyOriginal = null;

async function openEditPenaltyModal(penaltyId) {
    const { data: penalty } = await db.from('penalties').select('*').eq('id', penaltyId).single();
    if (!penalty) return;
    editingPenaltyOriginal = penalty;

    document.getElementById('edit-penalty-id').value = penalty.id;

    const select = document.getElementById('edit-penalty-type');
    select.innerHTML = allPenaltyTypes.filter(pt => pt.active).map(pt => {
        const typeLabel = pt.is_reset ? ' [초기화]' : pt.is_rate ? ' [비율형]' : '';
        const selected = pt.id === penalty.penalty_type_id ? 'selected' : '';
        return `<option value="${pt.id}" data-percent="${pt.percent}" data-reset="${pt.is_reset}" data-rate="${pt.is_rate}" data-rate-unit-count="${pt.rate_unit_count || 1}" ${selected}>${pt.name} (${pt.percent}%)${typeLabel}</option>`;
    }).join('');

    document.getElementById('edit-penalty-count').value = penalty.count || 1;
    document.getElementById('edit-penalty-note').value = penalty.note || '';

    document.getElementById('edit-penalty-modal').style.display = 'flex';
}

function closeEditPenaltyModal() {
    document.getElementById('edit-penalty-modal').style.display = 'none';
    editingPenaltyOriginal = null;
}

let isSavingPenaltyEdit = false;

async function savePenaltyRowEdit() {
    if (isSavingPenaltyEdit || !editingPenaltyOriginal) return;
    isSavingPenaltyEdit = true;

    const saveBtn = document.getElementById('edit-penalty-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const penaltyId = parseInt(document.getElementById('edit-penalty-id').value);
        const select = document.getElementById('edit-penalty-type');
        const opt = select.options[select.selectedIndex];
        if (!opt) return;

        const isReset = opt.dataset.reset === 'true';
        const isRate = opt.dataset.rate === 'true';
        const percent = parseInt(opt.dataset.percent);
        const rateUnitCount = parseInt(opt.dataset.rateUnitCount) || 1;
        const count = parseInt(document.getElementById('edit-penalty-count').value) || 1;
        const note = document.getElementById('edit-penalty-note').value.trim() || null;
        const typeName = opt.textContent.split(' (')[0];

        const percentPerCount = isRate ? Math.floor((count / rateUnitCount) * percent) : percent;

        // Recompute the deduction against the student's XP as if this
        // penalty's OLD effect were undone first, then re-cap against that
        // ceiling - never a naive subtraction of the new percent
        const { data: profile } = await db
            .from('profiles')
            .select('total_xp')
            .eq('id', selectedStudentId)
            .single();

        const ceiling = (profile?.total_xp || 0) + editingPenaltyOriginal.xp_deducted;
        let newDeduction = isReset ? ceiling : percentPerCount * count;
        if (newDeduction > ceiling) newDeduction = ceiling;
        if (newDeduction < 0) newDeduction = 0;

        const { error } = await db
            .from('penalties')
            .update({
                penalty_type_id: parseInt(opt.value),
                penalty_type_name: typeName,
                penalty_percent: isReset ? 100 : percentPerCount,
                xp_deducted: newDeduction,
                count: isReset ? 1 : count,
                note,
                modified_at: getNowKST(),
                modified_by: currentProfile.id
            })
            .eq('id', penaltyId);

        if (error) throw error;

        await recalculateAndSaveXP(selectedStudentId);
        closeEditPenaltyModal();
        await loadStudentEntries(selectedStudentId, selectedStudentName);
        await loadStudents();
    } catch (err) {
        console.error('Penalty edit failed:', err);
        alert('수정 처리 중 오류가 발생했습니다. 데이터를 보호하기 위해 변경을 취소합니다.');
    } finally {
        isSavingPenaltyEdit = false;
        if (saveBtn) saveBtn.disabled = false;
    }
}

// --- Admin Add Entry ---
function showAddEntryForm() {
    document.getElementById('admin-add-entry').style.display = 'block';
}

function hideAddEntryForm() {
    document.getElementById('admin-add-entry').style.display = 'none';
}

function resetAddEntryForm() {
    document.getElementById('admin-greetings').checked = false;
    document.getElementById('admin-assignments').value = '0';
    document.getElementById('admin-writing').value = 'none';
    document.getElementById('admin-bonus-points').value = '0';
    document.getElementById('admin-bonus-reason').value = '';
    document.getElementById('admin-title-inputs').innerHTML = '<div class="title-row" style="margin-bottom: 6px;"><input type="text" name="admin-title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline"></div>';
    document.querySelectorAll('input[name="admin-vt"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#admin-value-stamps .stamp-count').forEach(input => {
        input.value = '1';
        input.disabled = true;
    });
}

function addAdminTitleInput() {
    const container = document.getElementById('admin-title-inputs');
    const count = container.querySelectorAll('.title-row').length;
    if (count >= 5) {
        alert('칭호는 최대 5개까지 입력할 수 있습니다.');
        return;
    }
    const row = document.createElement('div');
    row.className = 'title-row';
    row.style.marginBottom = '6px';
    row.innerHTML = '<input type="text" name="admin-title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline">';
    container.appendChild(row);
}

let isSubmittingAdminEntry = false;

async function submitAdminEntry() {
    if (!selectedStudentId) return;
    if (isSubmittingAdminEntry) return;
    isSubmittingAdminEntry = true;

    const submitBtn = document.getElementById('admin-entry-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
        await doSubmitAdminEntry();
    } finally {
        isSubmittingAdminEntry = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function doSubmitAdminEntry() {
    const date = document.getElementById('admin-entry-date').value;
    const greetings = document.getElementById('admin-greetings').checked;
    const assignments = parseInt(document.getElementById('admin-assignments').value) || 0;
    const writing = document.getElementById('admin-writing').value;
    const bonusPoints = parseInt(document.getElementById('admin-bonus-points').value) || 0;
    const bonusReason = document.getElementById('admin-bonus-reason').value.trim();
    const titleNames = Array.from(document.querySelectorAll('#admin-title-inputs input[name="admin-title-name"]'))
        .map(input => input.value.trim())
        .filter(name => name.length > 0);

    const { data: entry, error } = await db
        .from('daily_entries')
        .insert({
            student_id: selectedStudentId,
            date: date,
            greetings: greetings,
            assignments: assignments,
            writing_type: writing,
            bonus_points: bonusPoints,
            bonus_reason: bonusReason,
            status: 'approved',
            is_double_day: isDoubleDay,
            modified_at: getNowKST(),
            modified_by: currentProfile.id
        })
        .select()
        .single();

    if (error) { alert('추가 실패: ' + error.message); return; }

    // Value stamps with count
    const checkedStamps = document.querySelectorAll('input[name="admin-vt"]:checked');
    if (checkedStamps.length > 0) {
        const stampRecords = Array.from(checkedStamps).map(cb => {
            const countInput = cb.closest('.stamp-count-item').querySelector('.stamp-count');
            const count = parseInt(countInput.value) || 1;
            return {
                entry_id: entry.id,
                value_type_id: parseInt(cb.value),
                date: date,
                student_name: selectedStudentName,
                value_name: cb.dataset.name,
                points: parseInt(cb.dataset.points),
                count: count,
                modified_at: getNowKST(),
                modified_by: currentProfile.id
            };
        });

        await db.from('entry_value_stamps').insert(stampRecords);
    }

    // Titles
    if (titleNames.length > 0) {
        const titleRecords = titleNames.map(name => ({
            student_id: selectedStudentId,
            entry_id: entry.id,
            title_name: name,
            date_earned: date,
            status: 'approved',
            modified_at: getNowKST(),
            modified_by: currentProfile.id
        }));
        await db.from('titles').insert(titleRecords);
    }

    // Recalculate XP (also checks milestones internally)
    await recalculateAndSaveXP(selectedStudentId);

    // Reset form
    hideAddEntryForm();
    resetAddEntryForm();

    await loadStudentEntries(selectedStudentId, selectedStudentName);
    await loadStudents();
}

// --- Multi-Penalty Application ---
let penaltyRowCounter = 0;

function showPenaltySection() {
    const container = document.getElementById('penalty-rows');
    container.innerHTML = '';
    penaltyRowCounter = 0;
    document.getElementById('penalty-preview').style.display = 'none';
    document.getElementById('penalty-section').style.display = 'flex';
    addPenaltyRow();
}

function hidePenaltySection() {
    document.getElementById('penalty-section').style.display = 'none';
    document.getElementById('penalty-preview').style.display = 'none';
}

function addPenaltyRow() {
    const container = document.getElementById('penalty-rows');
    const rowId = penaltyRowCounter++;

    const activeTypes = allPenaltyTypes.filter(pt => pt.active);
    const options = activeTypes.map(pt => {
        const typeLabel = pt.is_reset ? ' [초기화]' : pt.is_rate ? ' [비율형]' : '';
        return `<option value="${pt.id}" data-percent="${pt.percent}" data-reset="${pt.is_reset}" data-rate="${pt.is_rate}" data-rate-unit="${pt.rate_unit || ''}" data-rate-unit-count="${pt.rate_unit_count || ''}">${pt.name} (${pt.percent}%)${typeLabel}</option>`;
    }).join('');

    const row = document.createElement('div');
    row.className = 'penalty-row-item';
    row.id = `penalty-row-${rowId}`;
    row.innerHTML = `
        <div class="form-row">
            <div class="form-group">
                <label>감점 종류</label>
                <select class="penalty-type-sel" onchange="onPenaltyRowChange(${rowId})">
                    <option value="">선택하세요</option>
                    ${options}
                </select>
            </div>
            <div class="form-group">
                <label>횟수</label>
                <input type="number" class="penalty-count-input input-small" min="1" value="1" oninput="updatePenaltyPreview()">
            </div>
            <div class="form-group penalty-rate-group" style="display:none;">
                <label class="penalty-rate-label">단위 수</label>
                <input type="number" class="penalty-rate-input input-small" min="1" value="1" oninput="updatePenaltyPreview()">
            </div>
            <div class="form-group">
                <label>메모</label>
                <input type="text" class="penalty-note-input input-inline" placeholder="메모 (선택)">
            </div>
            <div class="form-group" style="align-self:flex-end;">
                <button class="btn btn-small btn-danger" onclick="removePenaltyRow(${rowId})">삭제</button>
            </div>
        </div>
    `;
    container.appendChild(row);
}

function removePenaltyRow(rowId) {
    const row = document.getElementById(`penalty-row-${rowId}`);
    if (row) row.remove();
    updatePenaltyPreview();
}

function onPenaltyRowChange(rowId) {
    const row = document.getElementById(`penalty-row-${rowId}`);
    if (!row) return;

    const select = row.querySelector('.penalty-type-sel');
    const opt = select.options[select.selectedIndex];
    const countInput = row.querySelector('.penalty-count-input');
    const rateGroup = row.querySelector('.penalty-rate-group');
    const rateLabel = row.querySelector('.penalty-rate-label');
    const rateInput = row.querySelector('.penalty-rate-input');

    if (!opt || !opt.value) {
        rateGroup.style.display = 'none';
        countInput.disabled = false;
        updatePenaltyPreview();
        return;
    }

    const isReset = opt.dataset.reset === 'true';
    const isRate = opt.dataset.rate === 'true';

    if (isReset) {
        countInput.value = '1';
        countInput.disabled = true;
        rateGroup.style.display = 'none';
    } else if (isRate) {
        countInput.disabled = false;
        rateGroup.style.display = 'block';
        const unit = opt.dataset.rateUnit || '단위';
        rateLabel.textContent = unit + ' 수';
        rateInput.value = opt.dataset.rateUnitCount || '1';
    } else {
        countInput.disabled = false;
        rateGroup.style.display = 'none';
    }

    updatePenaltyPreview();
}

async function updatePenaltyPreview() {
    console.log('updatePenaltyPreview');
    const rows = document.querySelectorAll('.penalty-row-item');
    if (rows.length === 0) {
        document.getElementById('penalty-preview').style.display = 'none';
        return;
    }

    // Get current XP from profile (fast)
    const { data: profile } = await db
        .from('profiles')
        .select('total_xp')
        .eq('id', selectedStudentId)
        .single();

    const currentXP = profile?.total_xp || 0;
    let remaining = currentXP;
    let totalDeducted = 0;
    const lines = [];

    rows.forEach(row => {
        const select = row.querySelector('.penalty-type-sel');
        const opt = select.options[select.selectedIndex];
        if (!opt || !opt.value) return;

        const isReset = opt.dataset.reset === 'true';
        const isRate = opt.dataset.rate === 'true';
        const penaltyPercent = parseInt(opt.dataset.percent);
        const typeName = opt.textContent.split(' (')[0];

        if (isReset) {
            lines.push(`${typeName}: 경험치 전액 몰수 (-${remaining}%)`);
            totalDeducted += remaining;
            remaining = 0;
            return;
        }

        let penaltyPercentPerCnt = penaltyPercent;
        if (isRate) {
            const rateInput = row.querySelector('.penalty-rate-input');
            const unitCount = parseInt(rateInput.value) || 1;
            const rateUnitCount = parseInt(opt.dataset.rateUnitCount) || 1;
            penaltyPercentPerCnt = Math.floor((unitCount / rateUnitCount) * penaltyPercent);
        }

        const count = parseInt(row.querySelector('.penalty-count-input').value) || 1;
        let deduction = count * penaltyPercentPerCnt;
        if (deduction > remaining) {
            deduction = remaining;
        }
        remaining -= deduction;
        lines.push(`${typeName}${count > 1 ? ' x' + count : ''}: -${deduction}%`);
        totalDeducted += deduction;
        if (remaining < 0) remaining = 0;
    });

    if (lines.length > 0) {
        document.getElementById('penalty-preview-text').innerHTML =
            `현재 경험치: ${currentXP}%<br>${lines.join('<br>')}<br><strong>합계: -${totalDeducted}% (잔여: ${remaining}%)</strong>`;
        document.getElementById('penalty-preview').style.display = 'block';
    } else {
        document.getElementById('penalty-preview').style.display = 'none';
    }
}

let isApplyingPenalties = false;

async function applyPenalties() {
    if (!selectedStudentId) return;
    if (isApplyingPenalties) return;
    isApplyingPenalties = true;

    const applyBtn = document.getElementById('apply-penalty-btn');
    if (applyBtn) applyBtn.disabled = true;

    try {
        await doApplyPenalties();
    } finally {
        isApplyingPenalties = false;
        if (applyBtn) applyBtn.disabled = false;
    }
}

async function doApplyPenalties() {
    const rows = document.querySelectorAll('.penalty-row-item');
    if (rows.length === 0) return;

    // Get current XP
    const { data: profile } = await db
        .from('profiles')
        .select('total_xp')
        .eq('id', selectedStudentId)
        .single();

    const currentXP = profile?.total_xp || 0;
    let remaining = currentXP;
    const penaltyRecords = [];

    rows.forEach(row => {
        const select = row.querySelector('.penalty-type-sel');
        const opt = select.options[select.selectedIndex];
        if (!opt || !opt.value) return;

        const penaltyTypeId = parseInt(opt.value);
        const typeName = opt.textContent.split(' (')[0];
        const isReset = opt.dataset.reset === 'true';
        const isRate = opt.dataset.rate === 'true';
        const penaltyPercent = parseInt(opt.dataset.percent);
        const noteInput = row.querySelector('.penalty-note-input');
        const note = noteInput.value.trim() || null;

        if (isReset) {
            penaltyRecords.push({
                student_id: selectedStudentId,
                student_name: selectedStudentName,
                penalty_type_id: penaltyTypeId,
                penalty_type_name: typeName,
                penalty_percent: 100,
                xp_deducted: remaining,
                count: 1,
                note: note || '경험치 전액 몰수',
                date: getTodayISO(),
                modified_at: getNowKST(),
                modified_by: currentProfile.id
            });
            remaining = 0;
            return;
        }

        let penaltyPercentPerCnt = penaltyPercent;
        let rateNote = null;
        if (isRate) {
            const rateInput = row.querySelector('.penalty-rate-input');
            const unitCount = parseInt(rateInput.value) || 1;
            const rateUnitCount = parseInt(opt.dataset.rateUnitCount) || 1;
            const unit = opt.dataset.rateUnit || '';
            penaltyPercentPerCnt = Math.floor((unitCount / rateUnitCount) * penaltyPercent);
            rateNote = `${unitCount}${unit}`;
        }

        const count = parseInt(row.querySelector('.penalty-count-input').value) || 1;

        let deduction = count * penaltyPercentPerCnt;
        if (deduction > remaining) {
            deduction = remaining;
        }

        const finalNote = [rateNote, note].filter(Boolean).join(' - ') || null;

        penaltyRecords.push({
            student_id: selectedStudentId,
            student_name: selectedStudentName,
            penalty_type_id: penaltyTypeId,
            penalty_type_name: typeName,
            penalty_percent: penaltyPercentPerCnt,
            xp_deducted: deduction,
            count: count,
            note: finalNote,
            date: getTodayISO(),
            modified_at: getNowKST(),
            modified_by: currentProfile.id
        });
        remaining -= deduction;
        if (remaining < 0) remaining = 0;
    });

    if (penaltyRecords.length === 0) {
        alert('감점 종류를 선택하세요.');
        return;
    }

    const totalDeducted = penaltyRecords.reduce((sum, p) => sum + p.xp_deducted, 0);
    const confirmMsg = `총 ${penaltyRecords.length}건 감점 적용: -${totalDeducted}% (${currentXP}% → ${currentXP - totalDeducted}%). 진행하시겠습니까?`;
    if (!confirm(confirmMsg)) return;

    const { error } = await db.from('penalties').insert(penaltyRecords);
    if (error) { alert('감점 적용 실패: ' + error.message); return; }

    await recalculateAndSaveXP(selectedStudentId);

    hidePenaltySection();
    await loadStudentEntries(selectedStudentId, selectedStudentName);
    await loadStudents();
}
