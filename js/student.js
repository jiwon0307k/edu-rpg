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
    const headerRow = thead.querySelector('tr');
    const allValueTypes = valueTypes || [];
    const orderedValueTypes = orderValueTypesForDisplay(allValueTypes);

    let headerHTML = '<th style="min-width:120px;">날짜</th><th>총 경험치</th><th>상태</th><th>인사</th>';
    orderedValueTypes.forEach(vt => {
        headerHTML += `<th${!vt.active ? ' class="inactive-col"' : ''}>${vt.name}</th>`;
    });
    headerHTML += '<th>과제</th><th>글쓰기</th><th style="min-width:120px;">칭호</th><th style="min-width:120px;">보너스</th><th>총 경험치</th><th>누적 경험치</th>';
    headerRow.innerHTML = headerHTML;

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
            let dailyXP = 0;
            if (entry.greetings) dailyXP += 3;
            orderedValueTypes.forEach(vt => {
                const stamp = entryStamps.find(s => s.value_type_id === vt.id);
                if (stamp) dailyXP += stamp.points * (stamp.count || 1);
            });
            if (entry.assignments > 0) dailyXP += entry.assignments * 5;
            if (entry.writing_type === '5%') dailyXP += 5;
            else if (entry.writing_type === '10%') dailyXP += 10;
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
            greetCell.textContent = entry.greetings ? '3%' : '-';
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
                ? `${entry.assignments}개 (${entry.assignments * 5}%)`
                : '-';
            row.appendChild(assignCell);

            const writeCell = document.createElement('td');
            if (entry.writing_type === '5%') {
                writeCell.textContent = '5%';
            } else if (entry.writing_type === '10%') {
                writeCell.textContent = '10%';
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
