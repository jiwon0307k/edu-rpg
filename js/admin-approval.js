// Admin Approval Page Logic

let currentProfile = null;
let allValueTypes = [];

(async () => {
    currentProfile = await requireAuth(['admin']);
    if (!currentProfile) return;

    await loadValueTypes();
    await loadPendingEntries();
})();

async function loadValueTypes() {
    const { data } = await db
        .from('value_types')
        .select('*')
        .order('id');

    allValueTypes = data || [];
}

async function loadPendingEntries() {
    const { data: entries } = await db
        .from('daily_entries')
        .select('*, profiles!daily_entries_student_id_fkey(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    const container = document.getElementById('pending-list');
    container.innerHTML = '';

    if (!entries || entries.length === 0) {
        document.getElementById('no-pending').style.display = 'block';
        return;
    }
    document.getElementById('no-pending').style.display = 'none';

    // Load stamps for all pending entries
    const entryIds = entries.map(e => e.id);
    const { data: stamps } = await db
        .from('entry_value_stamps')
        .select('*')
        .in('entry_id', entryIds);

    // Load pending titles
    const { data: titles } = await db
        .from('titles')
        .select('*')
        .in('entry_id', entryIds)
        .eq('status', 'pending');

    entries.forEach(entry => {
        const studentName = entry.profiles?.name || '알 수 없음';
        const entryStamps = (stamps || []).filter(s => s.entry_id === entry.id);
        const entryTitles = (titles || []).filter(t => t.entry_id === entry.id);

        let xpItems = [];
        let totalXP = 0;

        if (entry.greetings) {
            xpItems.push('인사 3%');
            totalXP += 3;
        }

        entryStamps.forEach(s => {
            const count = s.count || 1;
            const stampXP = s.points * count;
            xpItems.push(count > 1 ? `${s.value_name} x${count} ${stampXP}%` : `${s.value_name} ${s.points}%`);
            totalXP += stampXP;
        });

        if (entry.assignments > 0) {
            const assignXP = entry.assignments * 5;
            xpItems.push(`과제 ${entry.assignments}개 ${assignXP}%`);
            totalXP += assignXP;
        }

        if (entry.writing_type === '5%') {
            xpItems.push('감사 일기 5%');
            totalXP += 5;
        } else if (entry.writing_type === '10%') {
            xpItems.push('주제 글쓰기 10%');
            totalXP += 10;
        }

        entryTitles.forEach(t => {
            xpItems.push(`칭호 "${t.title_name}" 20%`);
            totalXP += 20;
        });

        const card = document.createElement('div');
        card.className = 'approval-card';
        card.id = `entry-card-${entry.id}`;
        card.innerHTML = `
            <div class="approval-header">
                <div>
                    <strong>${studentName}</strong>
                    <span class="text-muted">${entry.date}</span>
                </div>
                <div class="approval-total">합계: ${totalXP}%</div>
            </div>
            <div class="approval-items">
                ${xpItems.map(item => `<span class="xp-chip">${item}</span>`).join('')}
            </div>
            <div class="approval-actions">
                <button class="btn btn-small btn-primary" onclick="approveEntry(${entry.id})">승인</button>
                <button class="btn btn-small btn-secondary" onclick="openEditModal(${entry.id})">수정</button>
                <button class="btn btn-small btn-danger" onclick="rejectEntry(${entry.id})">거절</button>
            </div>
        `;
        container.appendChild(card);
    });
}

const entriesInProgress = new Set();

function disableCardActions(entryId) {
    const card = document.getElementById(`entry-card-${entryId}`);
    if (card) {
        card.querySelectorAll('.approval-actions button').forEach(btn => btn.disabled = true);
    }
}

async function approveEntry(entryId) {
    if (entriesInProgress.has(entryId)) return;
    entriesInProgress.add(entryId);
    disableCardActions(entryId);

    const auditFields = { modified_at: getNowKST(), modified_by: currentProfile.id };

    // Approve entry
    await db
        .from('daily_entries')
        .update({ status: 'approved', ...auditFields })
        .eq('id', entryId);

    // Approve associated titles
    await db
        .from('titles')
        .update({ status: 'approved', ...auditFields })
        .eq('entry_id', entryId)
        .eq('status', 'pending');

    // Recalculate XP (also checks milestones internally)
    const { data: entry } = await db
        .from('daily_entries')
        .select('student_id')
        .eq('id', entryId)
        .single();

    if (entry) {
        await recalculateAndSaveXP(entry.student_id);
    }

    // Remove card from UI
    const card = document.getElementById(`entry-card-${entryId}`);
    if (card) {
        card.style.opacity = '0';
        setTimeout(() => {
            card.remove();
            checkEmpty();
        }, 300);
    }
}

async function rejectEntry(entryId) {
    if (entriesInProgress.has(entryId)) return;
    if (!confirm('이 항목을 거절하시겠습니까? 삭제됩니다.')) return;

    entriesInProgress.add(entryId);
    disableCardActions(entryId);

    // Get student_id before deleting
    const { data: entryData } = await db
        .from('daily_entries')
        .select('student_id')
        .eq('id', entryId)
        .single();

    // Delete stamps
    await db.from('entry_value_stamps').delete().eq('entry_id', entryId);

    // Delete associated titles
    await db.from('titles').delete().eq('entry_id', entryId);

    // Delete entry
    await db.from('daily_entries').delete().eq('id', entryId);

    // Recalculate XP
    if (entryData) {
        await recalculateAndSaveXP(entryData.student_id);
    }

    const card = document.getElementById(`entry-card-${entryId}`);
    if (card) {
        card.style.opacity = '0';
        setTimeout(() => {
            card.remove();
            checkEmpty();
        }, 300);
    }
}

let isApprovingAll = false;

async function approveAll() {
    if (isApprovingAll) return;
    if (!confirm('모든 대기 중인 항목을 승인하시겠습니까?')) return;

    isApprovingAll = true;
    const approveAllBtn = document.getElementById('approve-all-btn');
    if (approveAllBtn) approveAllBtn.disabled = true;

    try {
        await doApproveAll();
    } finally {
        isApprovingAll = false;
        if (approveAllBtn) approveAllBtn.disabled = false;
    }
}

async function doApproveAll() {
    // Get pending entries before approving (for XP recalculation)
    const { data: pendingEntries } = await db
        .from('daily_entries')
        .select('student_id')
        .eq('status', 'pending');

    const auditFields = { modified_at: getNowKST(), modified_by: currentProfile.id };

    await db
        .from('daily_entries')
        .update({ status: 'approved', ...auditFields })
        .eq('status', 'pending');

    await db
        .from('titles')
        .update({ status: 'approved', ...auditFields })
        .eq('status', 'pending');

    // Recalculate XP for each affected student (also checks milestones internally)
    if (pendingEntries) {
        const checked = new Set();
        for (const e of pendingEntries) {
            if (checked.has(e.student_id)) continue;
            checked.add(e.student_id);
            await recalculateAndSaveXP(e.student_id);
        }
    }

    await loadPendingEntries();
}

function checkEmpty() {
    const container = document.getElementById('pending-list');
    if (container.children.length === 0) {
        document.getElementById('no-pending').style.display = 'block';
    }
}

// --- Edit Modal ---
let editEntryData = null;

function addTitleInput() {
    const container = document.getElementById('title-inputs');
    const count = container.querySelectorAll('.title-row').length;
    if (count >= 5) {
        alert('칭호는 최대 5개까지 입력할 수 있습니다.');
        return;
    }
    const row = document.createElement('div');
    row.className = 'title-row';
    row.style.marginBottom = '6px';
    row.innerHTML = '<input type="text" name="title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline">';
    container.appendChild(row);
}

async function openEditModal(entryId) {
    const { data: entry } = await db
        .from('daily_entries')
        .select('*')
        .eq('id', entryId)
        .single();

    if (!entry) return;
    editEntryData = entry;

    document.getElementById('edit-entry-id').value = entryId;
    document.getElementById('edit-date').value = entry.date;
    document.getElementById('edit-greetings').checked = entry.greetings;
    document.getElementById('edit-assignments').value = entry.assignments || 0;
    document.getElementById('edit-writing').value = entry.writing_type;

    // Load stamps for this entry
    const { data: stamps } = await db
        .from('entry_value_stamps')
        .select('*')
        .eq('entry_id', entryId);

    const container = document.getElementById('edit-value-stamps');
    renderStampGroups(container, allValueTypes.filter(vt => vt.active), vt => {
        const existingStamp = (stamps || []).find(s => s.value_type_id === vt.id);
        const checked = !!existingStamp;
        const count = existingStamp ? (existingStamp.count || 1) : 1;
        return `
            <label class="checkbox-label">
                <input type="checkbox" name="edit-vt" value="${vt.id}" data-points="${vt.points}" data-name="${vt.name}" ${checked ? 'checked' : ''}
                    onchange="this.closest('.stamp-count-item').querySelector('.stamp-count').disabled = !this.checked;">
                <span>${vt.name}</span>
            </label>
            <input type="number" class="stamp-count input-small" min="1" max="20" value="${count}" ${checked ? '' : 'disabled'}
                data-vt-id="${vt.id}">
        `;
    });

    // Load titles for this entry
    const { data: titles } = await db
        .from('titles')
        .select('*')
        .eq('entry_id', entryId);

    const titleContainer = document.getElementById('title-inputs');
    titleContainer.innerHTML = '';

    if (titles && titles.length > 0) {
        titles.forEach(t => {
            const row = document.createElement('div');
            row.className = 'title-row';
            row.style.marginBottom = '6px';
            row.innerHTML = `<input type="text" name="title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline" value="${t.title_name}">`;
            titleContainer.appendChild(row);
        });
    } else {
        const row = document.createElement('div');
        row.className = 'title-row';
        row.style.marginBottom = '6px';
        row.innerHTML = '<input type="text" name="title-name" placeholder="칭호 이름 (없으면 비워두세요)" class="input-inline">';
        titleContainer.appendChild(row);
    }

    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    editEntryData = null;
}

let isSavingEdit = false;

async function saveEdit() {
    if (isSavingEdit) return;
    isSavingEdit = true;

    const saveBtn = document.getElementById('save-edit-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        await doSaveEdit();
    } finally {
        isSavingEdit = false;
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function doSaveEdit() {
    const entryId = parseInt(document.getElementById('edit-entry-id').value);
    const date = document.getElementById('edit-date').value;
    const greetings = document.getElementById('edit-greetings').checked;
    const assignments = parseInt(document.getElementById('edit-assignments').value) || 0;
    const writing = document.getElementById('edit-writing').value;

    const auditFields = { modified_at: getNowKST(), modified_by: currentProfile.id };

    // Update entry
    await db
        .from('daily_entries')
        .update({
            date: date,
            greetings: greetings,
            assignments: assignments,
            writing_type: writing,
            status: 'approved',
            ...auditFields
        })
        .eq('id', entryId);

    // Rebuild stamps: delete old, insert new
    await db.from('entry_value_stamps').delete().eq('entry_id', entryId);

    // Get student name
    const { data: entryWithProfile } = await db
        .from('daily_entries')
        .select('student_id, profiles!daily_entries_student_id_fkey(name)')
        .eq('id', entryId)
        .single();

    const studentName = entryWithProfile?.profiles?.name || '';

    const checkedStamps = document.querySelectorAll('input[name="edit-vt"]:checked');
    if (checkedStamps.length > 0) {
        const stampRecords = Array.from(checkedStamps).map(cb => {
            const countInput = cb.closest('.stamp-count-item').querySelector('.stamp-count');
            const count = parseInt(countInput.value) || 1;
            return {
                entry_id: entryId,
                value_type_id: parseInt(cb.value),
                date: date,
                student_name: studentName,
                value_name: cb.dataset.name,
                points: parseInt(cb.dataset.points),
                count: count,
                ...auditFields
            };
        });

        await db.from('entry_value_stamps').insert(stampRecords);
    }

    // Rebuild titles: delete old, insert new from edit inputs
    await db.from('titles').delete().eq('entry_id', entryId);

    const titleInputs = document.querySelectorAll('#title-inputs input[name="title-name"]');
    const titleNames = Array.from(titleInputs)
        .map(input => input.value.trim())
        .filter(name => name.length > 0);

    if (titleNames.length > 0) {
        const titleRecords = titleNames.map(name => ({
            student_id: editEntryData.student_id,
            entry_id: entryId,
            title_name: name,
            date_earned: date,
            status: 'approved',
            ...auditFields
        }));
        await db.from('titles').insert(titleRecords);
    }

    // Recalculate XP (also checks milestones internally)
    if (editEntryData) {
        await recalculateAndSaveXP(editEntryData.student_id);
    }

    closeEditModal();
    await loadPendingEntries();
}
