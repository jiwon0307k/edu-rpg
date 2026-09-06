// Admin Batch Entry Modal Logic
// Relies on globals already set up by admin-students.js / xp-service.js /
// date-util.js / double-day.js: db, currentProfile, allValueTypes,
// allPenaltyTypes, isDoubleDay, getTodayISO, getNowKST,
// recalculateAndSaveXP, loadStudents, xpMultiplier.

let batchStudentsCache = [];

async function showBatchEntryModal() {
    document.getElementById('batch-date').value = getTodayISO();
    document.getElementById('batch-master-greetings').checked = false;
    document.getElementById('batch-master-assignments').value = 0;
    document.getElementById('batch-master-writing').value = 'none';

    const { data: students } = await db
        .from('profiles')
        .select('id, name')
        .eq('role', 'student')
        .order('name');

    batchStudentsCache = students || [];
    renderBatchStudentRows();

    document.getElementById('batch-entry-modal').style.display = 'flex';
}

function hideBatchEntryModal() {
    document.getElementById('batch-entry-modal').style.display = 'none';
    document.getElementById('batch-student-rows').innerHTML = '';
}

function renderBatchStudentRows() {
    const tbody = document.getElementById('batch-student-rows');
    tbody.innerHTML = '';

    if (batchStudentsCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">등록된 학생이 없습니다.</td></tr>';
        return;
    }

    batchStudentsCache.forEach((s, idx) => {
        const row = document.createElement('tr');
        row.dataset.studentId = s.id;
        row.dataset.studentName = s.name;
        row.innerHTML = `
            <td>${idx + 1}</td>
            <td>${s.name}</td>
            <td><input type="checkbox" class="batch-row-greetings"></td>
            <td><input type="number" class="batch-row-assignments input-small" min="0" max="20" value="0"></td>
            <td>
                <select class="batch-row-writing">
                    <option value="none">없음</option>
                    <option value="5%">감사 일기</option>
                    <option value="10%">주제 글쓰기</option>
                </select>
            </td>
            <td>
                <div class="batch-row-actions">
                    <button type="button" class="btn-batch-exc" onclick="toggleBatchException('${s.id}', 'stamp')">+도장</button>
                    <button type="button" class="btn-batch-exc" onclick="toggleBatchException('${s.id}', 'title')">+칭호</button>
                    <button type="button" class="btn-batch-exc" onclick="toggleBatchException('${s.id}', 'bonus')">+보너스</button>
                    <button type="button" class="btn-batch-exc btn-batch-exc-danger" onclick="toggleBatchException('${s.id}', 'penalty')">-감점</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);

        const excRow = document.createElement('tr');
        excRow.className = 'batch-exception-row';
        excRow.id = `batch-exc-${s.id}`;
        excRow.style.display = 'none';
        excRow.innerHTML = `
            <td colspan="6">
                <div class="batch-exception-panel">
                    <div class="batch-exc-section" id="batch-stamp-section-${s.id}" style="display:none;">
                        <div class="batch-exc-section-label">🏷️ 가치 도장 추가</div>
                        <div class="batch-stamp-list" id="batch-stamp-list-${s.id}"></div>
                        <button type="button" class="btn btn-small btn-secondary" onclick="addBatchStampLine('${s.id}')" style="align-self:flex-start;">+ 도장 추가</button>
                    </div>
                    <div class="batch-exc-section" id="batch-title-section-${s.id}" style="display:none;">
                        <div class="batch-exc-section-label">🏆 칭호 추가</div>
                        <div class="batch-title-list" id="batch-title-list-${s.id}"></div>
                        <button type="button" class="btn btn-small btn-secondary" onclick="addBatchTitleLine('${s.id}')" style="align-self:flex-start;">+ 칭호 추가</button>
                    </div>
                    <div class="batch-exc-section" id="batch-bonus-section-${s.id}" style="display:none;">
                        <div class="batch-exc-section-label">🎁 보너스</div>
                        <div class="batch-bonus-line">
                            <input type="number" class="batch-bonus-points input-small" min="0" value="0">
                            <span>%</span>
                            <input type="text" class="batch-bonus-reason input-inline" placeholder="사유">
                        </div>
                    </div>
                    <div class="batch-exc-section" id="batch-penalty-section-${s.id}" style="display:none;">
                        <div class="batch-exc-section-label">🚨 감점 추가</div>
                        <div class="batch-penalty-list" id="batch-penalty-list-${s.id}"></div>
                        <button type="button" class="btn btn-small btn-secondary" onclick="addBatchPenaltyLine('${s.id}')" style="align-self:flex-start;">+ 감점 추가</button>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(excRow);
    });
}

function applyMasterToAllRows() {
    const greetings = document.getElementById('batch-master-greetings').checked;
    const assignments = document.getElementById('batch-master-assignments').value;
    const writing = document.getElementById('batch-master-writing').value;

    document.querySelectorAll('.batch-row-greetings').forEach(el => { el.checked = greetings; });
    document.querySelectorAll('.batch-row-assignments').forEach(el => { el.value = assignments; });
    document.querySelectorAll('.batch-row-writing').forEach(el => { el.value = writing; });
}

function toggleBatchException(studentId, type) {
    const excRow = document.getElementById(`batch-exc-${studentId}`);
    const section = document.getElementById(`batch-${type}-section-${studentId}`);
    if (!excRow || !section) return;

    const wasHidden = section.style.display === 'none';
    section.style.display = wasHidden ? 'flex' : 'none';

    // Auto-add a first line when opening an empty list-type section
    if (wasHidden) {
        if (type === 'stamp' && document.getElementById(`batch-stamp-list-${studentId}`).children.length === 0) {
            addBatchStampLine(studentId);
        } else if (type === 'title' && document.getElementById(`batch-title-list-${studentId}`).children.length === 0) {
            addBatchTitleLine(studentId);
        } else if (type === 'penalty' && document.getElementById(`batch-penalty-list-${studentId}`).children.length === 0) {
            addBatchPenaltyLine(studentId);
        }
    }

    const anyVisible = Array.from(excRow.querySelectorAll('.batch-exc-section'))
        .some(el => el.style.display !== 'none');
    excRow.style.display = anyVisible ? 'table-row' : 'none';
}

function addBatchStampLine(studentId) {
    const list = document.getElementById(`batch-stamp-list-${studentId}`);
    const options = allValueTypes.filter(vt => vt.active)
        .map(vt => `<option value="${vt.id}">${vt.name} (${vt.points}%)</option>`).join('');

    const line = document.createElement('div');
    line.className = 'batch-stamp-line';
    line.innerHTML = `
        <select class="batch-stamp-type">${options}</select>
        <input type="number" class="batch-stamp-count input-small" min="1" max="20" value="1">
        <button type="button" class="btn-batch-line-remove" onclick="this.closest('.batch-stamp-line').remove()">✕</button>
    `;
    list.appendChild(line);
}

function addBatchTitleLine(studentId) {
    const list = document.getElementById(`batch-title-list-${studentId}`);
    const line = document.createElement('div');
    line.className = 'batch-title-line';
    line.innerHTML = `
        <input type="text" class="batch-title-name input-inline" placeholder="칭호 이름">
        <button type="button" class="btn-batch-line-remove" onclick="this.closest('.batch-title-line').remove()">✕</button>
    `;
    list.appendChild(line);
}

function addBatchPenaltyLine(studentId) {
    const list = document.getElementById(`batch-penalty-list-${studentId}`);
    const options = allPenaltyTypes.filter(pt => pt.active).map(pt => {
        const typeLabel = pt.is_reset ? ' [초기화]' : pt.is_rate ? ' [비율형]' : '';
        return `<option value="${pt.id}" data-percent="${pt.percent}" data-reset="${pt.is_reset}" data-rate="${pt.is_rate}" data-rate-unit-count="${pt.rate_unit_count || 1}">${pt.name} (${pt.percent}%)${typeLabel}</option>`;
    }).join('');

    const line = document.createElement('div');
    line.className = 'batch-penalty-line';
    line.innerHTML = `
        <select class="batch-penalty-type">${options}</select>
        <input type="number" class="batch-penalty-count input-small" min="1" value="1" title="횟수 (비율형은 단위 수)">
        <input type="text" class="batch-penalty-note input-inline" placeholder="사유 (선택)">
        <button type="button" class="btn-batch-line-remove" onclick="this.closest('.batch-penalty-line').remove()">✕</button>
    `;
    list.appendChild(line);
}

// --- Collect helpers (read the current DOM state for one student row) ---
function collectBatchStamps(row) {
    const list = document.getElementById(`batch-stamp-list-${row.dataset.studentId}`);
    if (!list) return [];
    return Array.from(list.querySelectorAll('.batch-stamp-line')).map(line => {
        const select = line.querySelector('.batch-stamp-type');
        const vt = allValueTypes.find(v => v.id === parseInt(select.value));
        const count = parseInt(line.querySelector('.batch-stamp-count').value) || 1;
        return vt ? { valueTypeId: vt.id, name: vt.name, points: vt.points, count } : null;
    }).filter(Boolean);
}

function collectBatchTitles(row) {
    const list = document.getElementById(`batch-title-list-${row.dataset.studentId}`);
    if (!list) return [];
    return Array.from(list.querySelectorAll('.batch-title-name'))
        .map(input => input.value.trim())
        .filter(name => name.length > 0);
}

function collectBatchBonus(row) {
    const section = document.getElementById(`batch-bonus-section-${row.dataset.studentId}`);
    if (!section || section.style.display === 'none') return { points: 0, reason: '' };
    const points = parseInt(section.querySelector('.batch-bonus-points').value) || 0;
    const reason = section.querySelector('.batch-bonus-reason').value.trim();
    return { points, reason };
}

function collectBatchPenaltyLines(row) {
    const list = document.getElementById(`batch-penalty-list-${row.dataset.studentId}`);
    if (!list) return [];
    return Array.from(list.querySelectorAll('.batch-penalty-line')).map(line => {
        const select = line.querySelector('.batch-penalty-type');
        const opt = select.options[select.selectedIndex];
        if (!opt || !opt.value) return null;

        const isReset = opt.dataset.reset === 'true';
        const isRate = opt.dataset.rate === 'true';
        const percent = parseInt(opt.dataset.percent);
        const count = parseInt(line.querySelector('.batch-penalty-count').value) || 1;
        const note = line.querySelector('.batch-penalty-note').value.trim() || null;
        const rateUnitCount = parseInt(opt.dataset.rateUnitCount) || 1;

        const percentPerCount = isRate ? Math.floor((count / rateUnitCount) * percent) : percent;

        return {
            penaltyTypeId: parseInt(opt.value),
            name: opt.textContent.split(' (')[0],
            isReset,
            percentPerCount,
            count: isReset ? 1 : count,
            note
        };
    }).filter(Boolean);
}

// --- Save ---
let isSavingBatch = false;

async function saveBatchEntries() {
    if (isSavingBatch) return;
    isSavingBatch = true;

    const saveBtn = document.getElementById('batch-save-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        await doSaveBatchEntries();
    } catch (err) {
        console.error('Batch save failed:', err);
        alert('일괄 저장 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
    } finally {
        isSavingBatch = false;
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function doSaveBatchEntries() {
    const date = document.getElementById('batch-date').value;
    if (!date) { alert('날짜를 선택하세요.'); return; }

    const rows = Array.from(document.querySelectorAll('#batch-student-rows tr[data-student-id]'));
    if (rows.length === 0) { alert('저장할 학생이 없습니다.'); return; }

    const mult = xpMultiplier(isDoubleDay);
    const affectedStudentIds = new Set();
    let entryCount = 0;
    let penaltyCount = 0;

    for (const row of rows) {
        const studentId = row.dataset.studentId;
        const studentName = row.dataset.studentName;

        const greetings = row.querySelector('.batch-row-greetings').checked;
        const assignments = parseInt(row.querySelector('.batch-row-assignments').value) || 0;
        const writing = row.querySelector('.batch-row-writing').value;

        const stamps = collectBatchStamps(row);
        const titleNames = collectBatchTitles(row);
        const bonus = collectBatchBonus(row);
        const penaltyLines = collectBatchPenaltyLines(row);

        const hasEntry = greetings || assignments > 0 || writing !== 'none' ||
            stamps.length > 0 || titleNames.length > 0 || bonus.points > 0;

        if (hasEntry) {
            const { data: entry, error } = await db
                .from('daily_entries')
                .insert({
                    student_id: studentId,
                    date,
                    greetings,
                    assignments,
                    writing_type: writing,
                    bonus_points: bonus.points,
                    bonus_reason: bonus.reason,
                    status: 'approved',
                    is_double_day: isDoubleDay,
                    modified_at: getNowKST(),
                    modified_by: currentProfile.id
                })
                .select()
                .single();

            if (error) {
                console.error('Batch entry insert failed for', studentName, error);
            } else {
                if (stamps.length > 0) {
                    const stampRecords = stamps.map(s => ({
                        entry_id: entry.id,
                        value_type_id: s.valueTypeId,
                        date,
                        student_name: studentName,
                        value_name: s.name,
                        points: s.points * mult,
                        count: s.count,
                        modified_at: getNowKST(),
                        modified_by: currentProfile.id
                    }));
                    await db.from('entry_value_stamps').insert(stampRecords);
                }

                if (titleNames.length > 0) {
                    const titleRecords = titleNames.map(name => ({
                        student_id: studentId,
                        entry_id: entry.id,
                        title_name: name,
                        date_earned: date,
                        status: 'approved',
                        modified_at: getNowKST(),
                        modified_by: currentProfile.id
                    }));
                    await db.from('titles').insert(titleRecords);
                }

                affectedStudentIds.add(studentId);
                entryCount++;
            }
        }

        if (penaltyLines.length > 0) {
            const { data: profile } = await db
                .from('profiles')
                .select('total_xp')
                .eq('id', studentId)
                .single();

            let remaining = profile?.total_xp || 0;
            const penaltyRecords = penaltyLines.map(p => {
                let deduction = p.isReset ? remaining : p.percentPerCount * p.count;
                if (deduction > remaining) deduction = remaining;
                remaining -= deduction;
                if (remaining < 0) remaining = 0;

                return {
                    student_id: studentId,
                    student_name: studentName,
                    penalty_type_id: p.penaltyTypeId,
                    penalty_type_name: p.name,
                    penalty_percent: p.isReset ? 100 : p.percentPerCount,
                    xp_deducted: deduction,
                    count: p.count,
                    note: p.note,
                    date,
                    modified_at: getNowKST(),
                    modified_by: currentProfile.id
                };
            });

            const { error: penaltyError } = await db.from('penalties').insert(penaltyRecords);
            if (penaltyError) {
                console.error('Batch penalty insert failed for', studentName, penaltyError);
            } else {
                affectedStudentIds.add(studentId);
                penaltyCount += penaltyRecords.length;
            }
        }
    }

    for (const id of affectedStudentIds) {
        await recalculateAndSaveXP(id);
    }

    showToast(`✅ ${affectedStudentIds.size}명 저장 완료 (기록 ${entryCount}건, 감점 ${penaltyCount}건)`);
    hideBatchEntryModal();
    await loadStudents();
}

// --- Toast ---
function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) { alert(message); return; }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 250);
    }, 2500);
}
