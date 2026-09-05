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
    const active = await getDoubleXPDayActive();
    document.getElementById('double-day-toggle').checked = active;
    updateDoubleDayStatusText(active);
}

function updateDoubleDayStatusText(active) {
    document.getElementById('double-day-status').textContent = active
        ? '🔥 지금 2배 Day가 켜져 있습니다! 인사/가치 도장/과제/글쓰기 배점이 2배로 적용됩니다. (칭호·보너스·감점 제외)'
        : '꺼져 있습니다. 켜면 인사/가치 도장/과제/글쓰기 배점이 2배로 적용됩니다. (칭호·보너스·감점 제외)';
}

async function onDoubleDayToggle(checked) {
    const toggle = document.getElementById('double-day-toggle');
    toggle.disabled = true;

    const ok = await setDoubleXPDayActive(checked, currentProfile.id);
    if (!ok) {
        alert('설정 변경에 실패했습니다. 다시 시도해주세요.');
        toggle.checked = !checked;
    } else {
        updateDoubleDayStatusText(checked);
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
