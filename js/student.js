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

    let headerHTML = '<th style="min-width:120px;">날짜</th><th>인사</th>';
    allValueTypes.forEach(vt => {
        headerHTML += `<th${!vt.active ? ' class="inactive-col"' : ''}>${vt.name}</th>`;
    });
    headerHTML += '<th>과제</th><th>글쓰기</th><th style="min-width:120px;">칭호</th><th style="min-width:120px;">보너스</th><th>총 경험치</th><th>누적 경험치</th><th>상태</th>';
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

    timeline.forEach(item => {
        if (item.type === 'entry') {
            const entry = item.data;
            const row = document.createElement('tr');
            if (entry.status === 'pending') row.classList.add('pending-row');

            let dailyXP = 0;

            const dateCell = document.createElement('td');
            dateCell.textContent = entry.date;
            row.appendChild(dateCell);

            const greetCell = document.createElement('td');
            if (entry.greetings) {
                greetCell.textContent = '3%';
                dailyXP += 3;
            } else {
                greetCell.textContent = '-';
            }
            row.appendChild(greetCell);

            const entryStamps = (stamps || []).filter(s => s.entry_id === entry.id);
            allValueTypes.forEach(vt => {
                const stampCell = document.createElement('td');
                const stamp = entryStamps.find(s => s.value_type_id === vt.id);
                if (stamp) {
                    const count = stamp.count || 1;
                    const stampXP = stamp.points * count;
                    stampCell.textContent = count > 1 ? `${stampXP}% (x${count})` : stamp.points + '%';
                    dailyXP += stampXP;
                } else {
                    stampCell.textContent = '-';
                }
                row.appendChild(stampCell);
            });

            const assignCell = document.createElement('td');
            if (entry.assignments > 0) {
                const assignXP = entry.assignments * 5;
                assignCell.textContent = `${entry.assignments}개 (${assignXP}%)`;
                dailyXP += assignXP;
            } else {
                assignCell.textContent = '-';
            }
            row.appendChild(assignCell);

            const writeCell = document.createElement('td');
            if (entry.writing_type === '5%') {
                writeCell.textContent = '5%';
                dailyXP += 5;
            } else if (entry.writing_type === '10%') {
                writeCell.textContent = '10%';
                dailyXP += 10;
            } else {
                writeCell.textContent = '-';
            }
            row.appendChild(writeCell);

            const titleCell = document.createElement('td');
            const entryTitles = (titles || []).filter(t => t.entry_id === entry.id);
            if (entryTitles.length > 0) {
                const titleNames = entryTitles.map(t => t.title_name);
                titleCell.textContent = titleNames.join(', ') + ' (' + (entryTitles.length * 20) + '%)';
                dailyXP += entryTitles.length * 20;
            } else {
                titleCell.textContent = '-';
            }
            row.appendChild(titleCell);

            const bonusCell = document.createElement('td');
            if (entry.bonus_points > 0) {
                bonusCell.textContent = entry.bonus_points + '%' + (entry.bonus_reason ? ' (' + entry.bonus_reason + ')' : '');
                dailyXP += entry.bonus_points;
            } else {
                bonusCell.textContent = '-';
            }
            row.appendChild(bonusCell);

            const totalCell = document.createElement('td');
            totalCell.textContent = dailyXP + '%';
            row.appendChild(totalCell);

            if (entry.status === 'approved') {
                cumulativeXP += dailyXP;
            }
            const cumCell = document.createElement('td');
            cumCell.textContent = cumulativeXP + '%';
            row.appendChild(cumCell);

            const statusCell = document.createElement('td');
            if (entry.status === 'approved') {
                statusCell.innerHTML = '<span class="badge badge-approved">승인</span>';
            } else {
                statusCell.innerHTML = '<span class="badge badge-pending">대기중</span>';
            }
            row.appendChild(statusCell);

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

            const descCell = document.createElement('td');
            descCell.colSpan = colCount;
            descCell.className = 'penalty-label';
            descCell.textContent = `🚨 ${p.penalty_type_name}`;
            row.appendChild(descCell);

            const xpCell = document.createElement('td');
            xpCell.className = 'penalty-xp';
            xpCell.textContent = `-${p.xp_deducted}%`;
            row.appendChild(xpCell);

            cumulativeXP -= p.xp_deducted;
            if (cumulativeXP < 0) cumulativeXP = 0;

            const cumCell = document.createElement('td');
            cumCell.textContent = cumulativeXP + '%';
            row.appendChild(cumCell);

            const statusCell = document.createElement('td');
            statusCell.innerHTML = '<span class="badge badge-danger">감점</span>';
            row.appendChild(statusCell);

            tbody.insertBefore(row, tbody.firstChild);
        }
    });

    // Update level display
        const { level, remainder } = calculateLevel(cumulativeXP);
    document.getElementById('level-badge').textContent = 'Lv.' + level;
    document.getElementById('xp-bar').style.width = remainder + '%';
    document.getElementById('xp-text').textContent = remainder + '%';
}
