// Shared value-stamp category grouping ("생활 도장" / "학습 도장")
// Used by student-input.js, admin-students.js, admin-approval.js to lay out
// the flat value_types list as one 3-column grid, with a thin dashed rule
// separating the life-stamp segment from the study-stamp segment.

const STAMP_GROUP_LIFE = ['봉사', '예의', '양보', '성실', '질서', '책임', '행복', '청결', '협동', '센스', '열정'];
const STAMP_GROUP_STUDY = ['발표', '수업 태도', '창의력', '바른 글씨', '노력', '국어', '수학', '사회', '과학', '음악', '미술'];

function groupValueTypesByCategory(valueTypes) {
    const life = [];
    const study = [];
    const other = [];

    valueTypes.forEach(vt => {
        if (STAMP_GROUP_LIFE.includes(vt.name)) life.push(vt);
        else if (STAMP_GROUP_STUDY.includes(vt.name)) study.push(vt);
        else other.push(vt);
    });

    return [life, study, other];
}

// Returns `valueTypes` reordered to the canonical life-then-study display order
// (used for table columns), falling back to original order for any unmatched names.
function orderValueTypesForDisplay(valueTypes) {
    const byName = new Map(valueTypes.map(vt => [vt.name, vt]));
    const used = new Set();
    const ordered = [];

    [...STAMP_GROUP_LIFE, ...STAMP_GROUP_STUDY].forEach(name => {
        const vt = byName.get(name);
        if (vt) {
            ordered.push(vt);
            used.add(vt.id);
        }
    });

    valueTypes.forEach(vt => {
        if (!used.has(vt.id)) ordered.push(vt);
    });

    return ordered;
}

// Renders `valueTypes` into `container` as one 3-column grid of tag chips.
// `buildItemHTML(vt)` returns the innerHTML for a single .stamp-count-item chip.
function renderStampGroups(container, valueTypes, buildItemHTML) {
    container.innerHTML = '';
    container.classList.add('stamp-group-grid');

    const segments = groupValueTypesByCategory(valueTypes).filter(seg => seg.length > 0);

    segments.forEach((segment, index) => {
        if (index > 0) {
            const hr = document.createElement('hr');
            hr.style.cssText = 'border: none; border-top: 1px dashed #E5D7BE; margin: 16px 0; grid-column: 1 / -1;';
            container.appendChild(hr);
        }

        segment.forEach(vt => {
            const item = document.createElement('div');
            item.className = 'stamp-count-item';
            item.innerHTML = buildItemHTML(vt);
            container.appendChild(item);
        });
    });
}

// --- Collected Stamps Showcase ("모은 도장") ---
// One chip per value type, showing its lifetime approved-only stamp count
// and a color tier based on that count. Counts only stamps whose parent
// daily_entries row is 'approved' - pending/rejected stamps never show up
// here, so there's no ghost data before a teacher approves anything.
// Callers pass in entries/stamps they've already fetched for the page (no
// extra query here), so re-running this after any load/recalculate call
// keeps it in sync with every edit/delete/approve.
function stampShowcaseTier(count) {
    if (count >= 30) return 'tier-4';
    if (count >= 20) return 'tier-3';
    if (count >= 10) return 'tier-2';
    if (count >= 1) return 'tier-1';
    return 'tier-0';
}

function renderStampShowcase(container, valueTypes, entries, stamps) {
    if (!container) return;

    const approvedEntryIds = new Set(
        (entries || []).filter(e => e.status === 'approved').map(e => e.id)
    );

    const countByTypeId = {};
    (stamps || []).forEach(s => {
        if (!approvedEntryIds.has(s.entry_id)) return;
        countByTypeId[s.value_type_id] = (countByTypeId[s.value_type_id] || 0) + (s.count || 1);
    });

    const ordered = orderValueTypesForDisplay(valueTypes || []);

    container.innerHTML = ordered.map(vt => {
        const count = countByTypeId[vt.id] || 0;
        return `<span class="stamp-showcase-chip ${stampShowcaseTier(count)}">${vt.name} ${count}</span>`;
    }).join('');
}
