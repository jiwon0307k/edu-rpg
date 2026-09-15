// Admin Dashboard Logic (Management Settings)

let currentProfile = null;
let allValueTypes = [];
let allPenaltyTypes = [];

(async () => {
    currentProfile = await requireAuth(['admin']);
    if (!currentProfile) return;

    await loadPendingCount();
    await initDoubleDayToggle();
    await loadValueTypes();
    await loadPenaltyTypes();
})();

// --- 2x XP Day Toggle ---
async function initDoubleDayToggle() {
    const toggle = document.getElementById('double-day-toggle');

    try {
        const active = await getDoubleXPDayActive();
        toggle.checked = active;
        updateDoubleDayStatusText(active);
    } catch (err) {
        console.error('Failed to load 2x day state:', err);
        toggle.checked = false;
        updateDoubleDayStatusText(false);
    }

    // Bind here (instead of an inline onchange=""), so the handler is always
    // attached to the live function even if the script re-runs or is cached.
    toggle.addEventListener('change', (e) => onDoubleDayToggle(e.target.checked));
}

function updateDoubleDayStatusText(active) {
    document.getElementById('double-day-status').textContent = active
        ? '🔥 활성화 중! 인사/가치 도장/과제/글쓰기 배점이 2배로 적용됩니다. (칭호·보너스·감점 제외)'
        : '비활성화 (평상시 모드)';
}

async function onDoubleDayToggle(checked) {
    const toggle = document.getElementById('double-day-toggle');
    toggle.disabled = true;

    try {
        const ok = await setDoubleXPDayActive(checked, currentProfile.id);
        if (!ok) {
            alert('설정 변경에 실패했습니다. 다시 시도해주세요.');
            toggle.checked = !checked;
        } else {
            updateDoubleDayStatusText(checked);
        }
    } catch (err) {
        console.error('Failed to update 2x day state:', err);
        alert('설정 변경 중 오류가 발생했습니다. 다시 시도해주세요.');
        toggle.checked = !checked;
    }

    toggle.disabled = false;
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

// --- Value Type Management ---
async function loadValueTypes() {
    const { data } = await db
        .from('value_types')
        .select('*')
        .order('id');

    allValueTypes = data || [];
    renderValueTypes();
}

function renderValueTypes() {
    const tbody = document.getElementById('value-types-body');
    tbody.innerHTML = '';

    allValueTypes.forEach(vt => {
        const row = document.createElement('tr');
        if (!vt.active) row.classList.add('inactive-row');
        row.innerHTML = `
            <td>${vt.name}</td>
            <td>
                <input type="number" value="${vt.points}" min="1" max="100"
                    class="input-small" onchange="updatePoints(${vt.id}, this.value)">%
            </td>
            <td>${vt.active ? '<span class="badge badge-approved">활성</span>' : '<span class="badge badge-pending">비활성</span>'}</td>
            <td>
                ${vt.active
                    ? `<button class="btn btn-small btn-danger" onclick="toggleValueType(${vt.id}, false)">비활성화</button>`
                    : `<button class="btn btn-small btn-primary" onclick="toggleValueType(${vt.id}, true)">활성화</button>`
                }
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showAddValueType() {
    document.getElementById('add-value-type-form').style.display = 'flex';
}

function hideAddValueType() {
    document.getElementById('add-value-type-form').style.display = 'none';
    document.getElementById('new-vt-name').value = '';
    document.getElementById('new-vt-points').value = '5';
}

async function addValueType() {
    const name = document.getElementById('new-vt-name').value.trim();
    const points = parseInt(document.getElementById('new-vt-points').value);

    if (!name) { alert('가치 이름을 입력하세요.'); return; }

    const { error } = await db
        .from('value_types')
        .insert({ name, points, active: true });

    if (error) { alert('추가 실패: ' + error.message); return; }

    hideAddValueType();
    await loadValueTypes();
}

async function updatePoints(id, newPoints) {
    await db
        .from('value_types')
        .update({ points: parseInt(newPoints) })
        .eq('id', id);
}

async function toggleValueType(id, active) {
    await db
        .from('value_types')
        .update({ active })
        .eq('id', id);

    await loadValueTypes();
}

// --- Penalty Type Management ---
async function loadPenaltyTypes() {
    const { data } = await db
        .from('penalty_types')
        .select('*')
        .order('id');

    allPenaltyTypes = data || [];
    renderPenaltyTypes();
}

function getPenaltyTypeLabel(pt) {
    if (pt.is_reset) return '초기화';
    if (pt.is_rate) return `비율형 (${pt.rate_unit_count}${pt.rate_unit || ''} 기준)`;
    return '일반';
}

function renderPenaltyTypes() {
    const tbody = document.getElementById('penalty-types-body');
    tbody.innerHTML = '';

    allPenaltyTypes.forEach(pt => {
        const row = document.createElement('tr');
        if (!pt.active) row.classList.add('inactive-row');
        row.innerHTML = `
            <td>${pt.name}</td>
            <td>${getPenaltyTypeLabel(pt)}</td>
            <td>
                ${pt.is_reset ? '-' : `<input type="number" value="${pt.percent}" min="1" max="100"
                    class="input-small" onchange="updatePenaltyPercent(${pt.id}, this.value)">%`}
            </td>
            <td>${pt.active ? '<span class="badge badge-approved">활성</span>' : '<span class="badge badge-pending">비활성</span>'}</td>
            <td>
                ${pt.active
                    ? `<button class="btn btn-small btn-danger" onclick="togglePenaltyType(${pt.id}, false)">비활성화</button>`
                    : `<button class="btn btn-small btn-primary" onclick="togglePenaltyType(${pt.id}, true)">활성화</button>`
                }
            </td>
        `;
        tbody.appendChild(row);
    });
}

function onNewPenaltyTypeChange() {
    const type = document.getElementById('new-pt-type').value;
    const percentGroup = document.getElementById('new-pt-percent-group');
    const rateGroup = document.getElementById('new-pt-rate-group');

    if (type === 'reset') {
        percentGroup.style.display = 'none';
        rateGroup.style.display = 'none';
    } else if (type === 'rate') {
        percentGroup.style.display = '';
        rateGroup.style.display = 'flex';
    } else {
        percentGroup.style.display = '';
        rateGroup.style.display = 'none';
    }
}

function showAddPenaltyType() {
    document.getElementById('add-penalty-type-form').style.display = 'flex';
}

function hideAddPenaltyType() {
    document.getElementById('add-penalty-type-form').style.display = 'none';
    document.getElementById('new-pt-name').value = '';
    document.getElementById('new-pt-percent').value = '5';
    document.getElementById('new-pt-type').value = 'normal';
    document.getElementById('new-pt-rate-unit').value = '';
    document.getElementById('new-pt-rate-unit-count').value = '10';
    onNewPenaltyTypeChange();
}

async function addPenaltyType() {
    const name = document.getElementById('new-pt-name').value.trim();
    const type = document.getElementById('new-pt-type').value;
    const percent = type === 'reset' ? 100 : parseInt(document.getElementById('new-pt-percent').value);

    if (!name) { alert('감점 이름을 입력하세요.'); return; }

    const record = {
        name,
        percent,
        is_reset: type === 'reset',
        is_rate: type === 'rate',
        rate_unit: type === 'rate' ? (document.getElementById('new-pt-rate-unit').value.trim() || null) : null,
        rate_unit_count: type === 'rate' ? (parseInt(document.getElementById('new-pt-rate-unit-count').value) || null) : null,
        active: true
    };

    const { error } = await db
        .from('penalty_types')
        .insert(record);

    if (error) { alert('추가 실패: ' + error.message); return; }

    hideAddPenaltyType();
    await loadPenaltyTypes();
}

async function updatePenaltyPercent(id, newPercent) {
    await db
        .from('penalty_types')
        .update({ percent: parseInt(newPercent) })
        .eq('id', id);
}

async function togglePenaltyType(id, active) {
    await db
        .from('penalty_types')
        .update({ active })
        .eq('id', id);

    await loadPenaltyTypes();
}

// --- Stamp Request ("도장 조르기") Review, merged into the shared bell ---
// A student's request now creates a real `notifications` row addressed to
// the admin (value_type_name='stamp_request', stamp_request_id set) at
// submit time (js/student.js submitStampRequest()), the same way a milestone
// creates one for both student and admin. That means the shared
// #notif-bell/#notif-dropdown wiring and refreshNotifBadge() from
// notifications.js already work as-is for these - no badge-count override
// needed here anymore. loadNotifications() is redeclared (admin.js loads
// after notifications.js, so this global function replaces that one, on
// admin.html only) purely to render stamp_request-type rows differently:
// clicking the row opens the approval modal (and marks it read); the 읽음
// button still just calls the same shared markAsRead().
async function loadNotifications() {
    const list = document.getElementById('notif-list');
    if (!list || !window._notifUserId) return;

    const { data } = await db
        .from('notifications')
        .select('*')
        .eq('recipient_id', window._notifUserId)
        .order('created_at', { ascending: false })
        .limit(20);

    if (!data || data.length === 0) {
        list.innerHTML = '<div class="notif-empty">알림이 없습니다.</div>';
        return;
    }

    let stampRequestIndex = 0;
    list.innerHTML = data.map(n => {
        const time = new Date(n.created_at).toLocaleDateString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const unread = n.status === 'sent' ? 'unread' : '';
        const isStampRequest = n.value_type_name === 'stamp_request';

        let msg = n.message;
        if (isStampRequest) {
            stampRequestIndex += 1;
            msg = `${String(stampRequestIndex).padStart(2, '0')} ${msg}`;
        }

        const readBtnOnclick = isStampRequest
            ? `event.stopPropagation(); markAsRead(${n.id})`
            : `markAsRead(${n.id})`;
        const readBtn = n.status === 'sent'
            ? `<button class="notif-read-btn" onclick="${readBtnOnclick}">읽음</button>`
            : '';
        const rowOnclick = isStampRequest
            ? ` onclick="openStampRequestReviewModal(); markAsRead(${n.id});"`
            : '';
        const rowClass = isStampRequest ? `notif-item stamp-request-notif-item ${unread}` : `notif-item ${unread}`;

        return `
            <div class="${rowClass}" id="notif-${n.id}"${rowOnclick}>
                <div class="notif-content">
                    <div class="notif-msg">${msg}</div>
                    <div class="notif-time">${time}</div>
                </div>
                ${readBtn}
            </div>
        `;
    }).join('');
}

async function openStampRequestReviewModal() {
    // Close the notification dropdown first, in case this was opened by
    // clicking a stamp-request row inside it
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.classList.remove('open');
    notifDropdownOpen = false;

    await loadStampRequestCards();
    document.getElementById('stamp-request-review-modal').style.display = 'flex';
}

function closeStampRequestReviewModal() {
    document.getElementById('stamp-request-review-modal').style.display = 'none';
}

async function loadStampRequestCards() {
    const list = document.getElementById('stamp-request-review-list');
    const empty = document.getElementById('stamp-request-review-empty');

    const { data } = await db
        .from('stamp_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (!data || data.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.innerHTML = data.map(r => {
        const time = new Date(r.created_at).toLocaleDateString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        return `
            <div class="stamp-request-card" id="stamp-request-${r.id}">
                <div class="stamp-request-card-header">
                    <strong>${r.student_name} · ${r.stamp_type}</strong>
                    <span class="text-muted">${time}</span>
                </div>
                <p class="stamp-request-reason">${r.reason}</p>
                <div class="form-actions">
                    <button class="btn btn-small btn-primary" onclick="approveStampRequest('${r.id}')">승인</button>
                    <button class="btn btn-small btn-secondary" onclick="rejectStampRequest('${r.id}')">거절</button>
                </div>
            </div>
        `;
    }).join('');
}

let stampRequestsBeingApproved = new Set();

async function approveStampRequest(requestId) {
    if (stampRequestsBeingApproved.has(requestId)) return;
    stampRequestsBeingApproved.add(requestId);

    const card = document.getElementById(`stamp-request-${requestId}`);
    if (card) card.querySelectorAll('button').forEach(b => b.disabled = true);

    try {
        const { data: request } = await db
            .from('stamp_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (!request) return;

        const valueType = allValueTypes.find(vt => vt.name === request.stamp_type);
        if (!valueType) {
            alert(`'${request.stamp_type}' 가치 종류를 찾을 수 없습니다. 관리 설정에서 확인해주세요.`);
            return;
        }

        const isDoubleDay = await getDoubleXPDayActive();
        const auditFields = { modified_at: getNowKST(), modified_by: currentProfile.id };
        const today = getTodayISO();

        // Grant the stamp the same way every other XP source works: a real
        // approved daily_entries row + entry_value_stamps row, then let
        // recalculateAndSaveXP re-sum everything from scratch
        const { data: entry, error: entryError } = await db
            .from('daily_entries')
            .insert({
                student_id: request.user_id,
                date: today,
                greetings: false,
                assignments: 0,
                writing_type: 'none',
                status: 'approved',
                is_double_day: isDoubleDay,
                ...auditFields
            })
            .select()
            .single();

        if (entryError) throw entryError;

        const { error: stampError } = await db
            .from('entry_value_stamps')
            .insert({
                entry_id: entry.id,
                value_type_id: valueType.id,
                date: today,
                student_name: request.student_name,
                value_name: valueType.name,
                points: valueType.points,
                count: 1,
                ...auditFields
            });

        if (stampError) throw stampError;

        const { error: statusError } = await db
            .from('stamp_requests')
            .update({ status: 'approved' })
            .eq('id', requestId);

        if (statusError) throw statusError;

        await recalculateAndSaveXP(request.user_id);

        // Let the student know, and clear the admin's own "new request" alert
        // for this request (milestone_level: 0 keeps reconcileMilestoneNotifications
        // from ever mistaking this for a stale value-type milestone and deleting it)
        await db.from('notifications').insert({
            recipient_id: request.user_id,
            student_id: request.user_id,
            value_type_name: 'stamp_request',
            milestone_level: 0,
            message: `[${valueType.name}] 가치도장 획득! 도장 조르기 요청이 승인되었어요.`
        });

        await db.from('notifications')
            .update({ status: 'read' })
            .eq('stamp_request_id', requestId)
            .eq('status', 'sent');

        if (card) card.remove();
        await refreshNotifBadge();

        const list = document.getElementById('stamp-request-review-list');
        if (list && list.children.length === 0) {
            document.getElementById('stamp-request-review-empty').style.display = 'block';
        }
    } catch (err) {
        console.error('Stamp request approval failed:', err);
        alert('승인 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
        if (card) card.querySelectorAll('button').forEach(b => b.disabled = false);
    } finally {
        stampRequestsBeingApproved.delete(requestId);
    }
}

async function rejectStampRequest(requestId) {
    if (stampRequestsBeingApproved.has(requestId)) return;
    stampRequestsBeingApproved.add(requestId);

    const card = document.getElementById(`stamp-request-${requestId}`);
    if (card) card.querySelectorAll('button').forEach(b => b.disabled = true);

    try {
        const { error } = await db
            .from('stamp_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        if (error) throw error;

        await db.from('notifications')
            .update({ status: 'read' })
            .eq('stamp_request_id', requestId)
            .eq('status', 'sent');

        if (card) card.remove();
        await refreshNotifBadge();

        const list = document.getElementById('stamp-request-review-list');
        if (list && list.children.length === 0) {
            document.getElementById('stamp-request-review-empty').style.display = 'block';
        }
    } catch (err) {
        console.error('Stamp request rejection failed:', err);
        alert('거절 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
        if (card) card.querySelectorAll('button').forEach(b => b.disabled = false);
    } finally {
        stampRequestsBeingApproved.delete(requestId);
    }
}
