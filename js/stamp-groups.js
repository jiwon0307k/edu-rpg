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
