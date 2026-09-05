// Student Input Form Logic

let currentProfile = null;
let activeValueTypes = [];
let isDoubleDay = false;

(async () => {
    currentProfile = await requireAuth(['student']);
    if (!currentProfile) return;

    document.getElementById('user-name').textContent = currentProfile.name;

    // Set default date to today
    document.getElementById('entry-date').value = getTodayISO();

    isDoubleDay = await getDoubleXPDayActive();
    applyDoubleDayLabels();

    await loadValueTypes();
    setupFormListeners();
})();

// Titles, bonus, and penalties are never doubled - only greetings, value
// stamps, assignments, and writing are affected by 2x Day.
function applyDoubleDayLabels() {
    const mult = xpMultiplier(isDoubleDay);
    const fire = isDoubleDay ? ' 🔥' : '';
    document.getElementById('insa-title').textContent = `인사 (${3 * mult}%${fire})`;
    document.getElementById('stamp-title').textContent = `가치 도장 (각 ${5 * mult}%${fire})`;
    document.getElementById('assignment-title').textContent = `과제 (각 ${5 * mult}%${fire})`;
    document.getElementById('writing-5-label').textContent = `감사 일기 (${5 * mult}%${fire})`;
    document.getElementById('writing-10-label').textContent = `주제 글쓰기 (${10 * mult}%${fire})`;
}

async function loadValueTypes() {
    const { data } = await db
        .from('value_types')
        .select('*')
        .eq('active', true)
        .order('id');

    activeValueTypes = data || [];
    const container = document.getElementById('value-stamps-container');
    const mult = xpMultiplier(isDoubleDay);

    renderStampGroups(container, activeValueTypes, vt => `
        <label class="checkbox-label">
            <input type="checkbox" name="value-stamp" value="${vt.id}" data-points="${vt.points * mult}" data-name="${vt.name}"
                onchange="this.closest('.stamp-count-item').querySelector('.stamp-count').disabled = !this.checked; updatePreview();">
            <span>${vt.name}</span>
        </label>
        <input type="number" class="stamp-count input-small" min="1" max="20" value="1" disabled
            data-vt-id="${vt.id}" oninput="updatePreview();">
    `);
}

function setupFormListeners() {
    // Live XP preview
    const form = document.getElementById('xp-form');
    form.addEventListener('change', updatePreview);
    form.addEventListener('input', updatePreview);

    // Submit
    form.addEventListener('submit', handleSubmit);
}

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
    row.innerHTML = '<input type="text" name="title-name" placeholder="칭호 이름" class="input-inline">';
    container.appendChild(row);
    if (container.querySelectorAll('.title-row').length >= 5) {
        document.getElementById('add-title-btn').style.display = 'none';
    }
}

function calculateFormXP() {
    let total = 0;
    const details = [];
    const mult = xpMultiplier(isDoubleDay);
    const fire = isDoubleDay ? ' 🔥' : '';

    // Greetings
    if (document.getElementById('greetings').checked) {
        const insaXP = 3 * mult;
        total += insaXP;
        details.push(`인사: ${insaXP}%${fire}`);
    }

    // Value stamps (data-points is already doubled when 2x Day is on)
    document.querySelectorAll('input[name="value-stamp"]:checked').forEach(cb => {
        const points = parseInt(cb.dataset.points);
        const countInput = cb.closest('.stamp-count-item').querySelector('.stamp-count');
        const count = parseInt(countInput.value) || 1;
        const stampXP = points * count;
        total += stampXP;
        details.push(count > 1 ? `${cb.dataset.name} x${count}: ${stampXP}%${fire}` : `${cb.dataset.name}: ${points}%${fire}`);
    });

    // Assignments
    const assignments = parseInt(document.getElementById('assignments').value) || 0;
    if (assignments > 0) {
        const assignXP = assignments * 5 * mult;
        total += assignXP;
        details.push(`과제 ${assignments}개: ${assignXP}%${fire}`);
    }

    // Writing
    const writing = document.querySelector('input[name="writing"]:checked').value;
    if (writing === '5%') {
        const writeXP = 5 * mult;
        total += writeXP;
        details.push(`감사 일기: ${writeXP}%${fire}`);
    } else if (writing === '10%') {
        const writeXP = 10 * mult;
        total += writeXP;
        details.push(`주제 글쓰기: ${writeXP}%${fire}`);
    }

    // Titles
    const titleInputs = document.querySelectorAll('input[name="title-name"]');
    titleInputs.forEach(input => {
        const name = input.value.trim();
        if (name) {
            total += 20;
            details.push(`칭호 "${name}": 20%`);
        }
    });

    return { total, details };
}

function updatePreview() {
    const { total, details } = calculateFormXP();
    const summary = document.getElementById('form-summary');
    const summaryText = document.getElementById('summary-text');

    if (total > 0) {
        summary.style.display = 'block';
        summaryText.innerHTML = details.join('<br>') + `<br><strong>합계: ${total}%</strong>`;
    } else {
        summary.style.display = 'none';
    }
}

let isSubmitting = false;

async function handleSubmit(e) {
    e.preventDefault();

    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = document.querySelector('#xp-form button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        await submitEntry();
    } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function submitEntry() {
    const date = document.getElementById('entry-date').value;
    const greetings = document.getElementById('greetings').checked;
    const assignments = parseInt(document.getElementById('assignments').value) || 0;
    const writing = document.querySelector('input[name="writing"]:checked').value;

    // Collect title names (non-empty only)
    const titleNames = [];
    document.querySelectorAll('input[name="title-name"]').forEach(input => {
        const name = input.value.trim();
        if (name) titleNames.push(name);
    });

    // Insert daily entry
    const { data: entry, error: entryError } = await db
        .from('daily_entries')
        .insert({
            student_id: currentProfile.id,
            date: date,
            greetings: greetings,
            assignments: assignments,
            writing_type: writing,
            status: 'pending',
            is_double_day: isDoubleDay,
            modified_at: getNowKST(),
            modified_by: currentProfile.id
        })
        .select()
        .single();

    if (entryError) {
        alert('제출에 실패했습니다: ' + entryError.message);
        return;
    }

    // Insert value stamps
    const checkedStamps = document.querySelectorAll('input[name="value-stamp"]:checked');
    if (checkedStamps.length > 0) {
        const stampRecords = Array.from(checkedStamps).map(cb => {
            const countInput = cb.closest('.stamp-count-item').querySelector('.stamp-count');
            const count = parseInt(countInput.value) || 1;
            return {
                entry_id: entry.id,
                value_type_id: parseInt(cb.value),
                date: date,
                student_name: currentProfile.name,
                value_name: cb.dataset.name,
                points: parseInt(cb.dataset.points),
                count: count,
                modified_at: getNowKST(),
                modified_by: currentProfile.id
            };
        });

        const { error: stampError } = await db
            .from('entry_value_stamps')
            .insert(stampRecords);

        if (stampError) {
            console.error('Stamp insert error:', stampError);
        }
    }

    // Insert titles if applicable
    if (titleNames.length > 0) {
        const titleRecords = titleNames.map(name => ({
            student_id: currentProfile.id,
            entry_id: entry.id,
            title_name: name,
            date_earned: date,
            status: 'pending',
            modified_at: getNowKST(),
            modified_by: currentProfile.id
        }));

        const { error: titleError } = await db
            .from('titles')
            .insert(titleRecords);

        if (titleError) {
            console.error('Title insert error:', titleError);
        }
    }

    // Show success modal
    const { total, details } = calculateFormXP();
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
        <p>${details.join('<br>')}</p>
        <p class="modal-total">오늘 획득 경험치: <strong>${total}%</strong></p>
        <p class="text-muted">선생님의 승인을 기다려주세요!</p>
    `;
    document.getElementById('success-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('success-modal').style.display = 'none';
    window.location.href = 'student.html';
}
