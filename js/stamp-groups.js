// Shared value-stamp category grouping ("생활 도장" / "학습 도장")
// Used by student-input.js, admin-students.js, admin-approval.js to split
// the flat value_types list into labeled mini-card sections.

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

    return [
        { title: '🌱 생활 도장', items: life },
        { title: '📖 학습 도장', items: study },
        { title: '기타 도장', items: other }
    ].filter(group => group.items.length > 0);
}

// Renders `valueTypes` into `container` as grouped mini-cards of tag chips.
// `buildItemHTML(vt)` returns the innerHTML for a single .stamp-count-item chip.
function renderStampGroups(container, valueTypes, buildItemHTML) {
    container.innerHTML = '';

    groupValueTypesByCategory(valueTypes).forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'stamp-group';

        const heading = document.createElement('h5');
        heading.textContent = group.title;
        groupEl.appendChild(heading);

        const grid = document.createElement('div');
        grid.className = 'stamp-group-grid';

        group.items.forEach(vt => {
            const item = document.createElement('div');
            item.className = 'stamp-count-item';
            item.innerHTML = buildItemHTML(vt);
            grid.appendChild(item);
        });

        groupEl.appendChild(grid);
        container.appendChild(groupEl);
    });
}
