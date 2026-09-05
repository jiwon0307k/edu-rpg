// Admin Students Page Logic

let currentProfile = null;
let allValueTypes = [];
let allPenaltyTypes = [];
let selectedStudentId = null;
let selectedStudentName = null;

(async () => {
    currentProfile = await requireAuth(['admin']);
    if (!currentProfile) return;

    await loadPendingCount();
    await loadValueTypes();
    await loadPenaltyTypes();
    await loadStudents();
})();

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

    // Load admin value stamp checkboxes with count inputs
    const container = document.getElementById('admin-value-stamps');
    renderStampGroups(container, allValueTypes.filter(vt => vt.active), vt => `
        <label class="checkbox-label">
            <input type="checkbox" name="admin-vt" value="${vt.id}" data-points="${vt.points}" data-name="${vt.name}"
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
    const colCount = allValueTypes.length + 4;
    let headerHTML = '<tr><th style="min-width:120px;">날짜</th><th>인사</th>';
    allValueTypes.forEach(vt => {
        headerHTML += `<th${!vt.active ? ' class="inactive-col"' : ''}>${vt.name}</th>`;
    });
    headerHTML += '<th>과제</th><th>글쓰기</th><th style="min-width:120px;">칭호</th><th style="min-width:120px;">보너스</th><th>총 경험치</th><th>누적 경험치</th><th>상태</th></tr>';
    thead.innerHTML = headerHTML;

    const tbody = document.getElementById('detail-table-body');
    tbody.innerHTML = '';

    const hasEntries = entries && entries.length > 0;
    const hasPenalties = penalties && penalties.length > 0;

    if (!hasEntries && !hasPenalties) {
        tbody.innerHTML = '<tr><td colspan="20" class="text-center text-muted">기록이 없습니다.</td></tr>';
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

            let dailyXP = 0;
            let cells = `<td>${entry.date}</td>`;

            if (entry.greetings) { cells += '<td>3%</td>'; dailyXP += 3; }
            else { cells += '<td>-</td>'; }

            const entryStamps = (stamps || []).filter(s => s.entry_id === entry.id);
            allValueTypes.forEach(vt => {
                const stamp = entryStamps.find(s => s.value_type_id === vt.id);
                if (stamp) {
                    const count = stamp.count || 1;
                    const stampXP = stamp.points * count;
                    cells += `<td>${count > 1 ? stampXP + '% (x' + count + ')' : stamp.points + '%'}</td>`;
                    dailyXP += stampXP;
                }
                else { cells += '<td>-</td>'; }
            });

            if (entry.assignments > 0) {
                const assignXP = entry.assignments * 5;
                cells += `<td>${entry.assignments}개 (${assignXP}%)</td>`;
                dailyXP += assignXP;
            } else { cells += '<td>-</td>'; }

            if (entry.writing_type === '5%') { cells += '<td>5%</td>'; dailyXP += 5; }
            else if (entry.writing_type === '10%') { cells += '<td>10%</td>'; dailyXP += 10; }
            else { cells += '<td>-</td>'; }

            const entryTitles = (titles || []).filter(t => t.entry_id === entry.id);
            if (entryTitles.length > 0) {
                cells += `<td>${entryTitles.map(t => t.title_name).join(', ')} (${entryTitles.length * 20}%)</td>`;
                dailyXP += entryTitles.length * 20;
            } else { cells += '<td>-</td>'; }

            if (entry.bonus_points > 0) {
                cells += `<td>${entry.bonus_points}%${entry.bonus_reason ? ' (' + entry.bonus_reason + ')' : ''}</td>`;
                dailyXP += entry.bonus_points;
            } else { cells += '<td>-</td>'; }

            cells += `<td>${dailyXP}%</td>`;
            if (entry.status === 'approved') cumulativeXP += dailyXP;
            cells += `<td>${cumulativeXP}%</td>`;
            cells += `<td>${entry.status === 'approved'
                ? '<span class="badge badge-approved">승인</span>'
                : '<span class="badge badge-pending">대기중</span>'}</td>`;

            row.innerHTML = cells;
            // Newest entries first, while cumulative XP is still computed oldest-to-newest above
            tbody.insertBefore(row, tbody.firstChild);
        } else {
            const p = item.data;
            const row = document.createElement('tr');
            row.classList.add('penalty-row');

            const midCols = allValueTypes.length + 5;
            const noteText = p.note ? ` (${p.note})` : '';
            const countText = (p.count || 1) > 1 ? ` x${p.count}` : '';
            let cells = `<td>${p.date}</td>`;
            cells += `<td colspan="${midCols}" class="penalty-label">🚨 ${p.penalty_type_name}${countText}${noteText}</td>`;
            cells += `<td class="penalty-xp">-${p.xp_deducted}%</td>`;
            cumulativeXP -= p.xp_deducted;
            if (cumulativeXP < 0) cumulativeXP = 0;
            cells += `<td>${cumulativeXP}%</td>`;
            cells += `<td><span class="badge badge-danger">감점</span></td>`;

            row.innerHTML = cells;
            tbody.insertBefore(row, tbody.firstChild);
        }
    });

    const { level, remainder } = calculateLevel(cumulativeXP);
    document.getElementById('detail-level-badge').textContent = 'Lv.' + level;
    document.getElementById('detail-xp-text').textContent = remainder + '%';
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
