// Date utility — returns dates in Asia/Seoul timezone

function getTodayISO() {
    const parts = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

function getTodayLocale() {
    return new Date().toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Returns this week's Monday 00:00 in KST as an ISO timestamp string
// (matches getNowKST()'s +09:00 format), for "once per week" queries.
function getMondayKSTISO() {
    const todayISO = getTodayISO();
    const weekdayShort = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        weekday: 'short'
    }).format(new Date());
    const daysSinceMonday = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekdayShort];

    const [y, m, d] = todayISO.split('-').map(Number);
    const monday = new Date(Date.UTC(y, m - 1, d));
    monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);

    const mm = String(monday.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(monday.getUTCDate()).padStart(2, '0');
    return `${monday.getUTCFullYear()}-${mm}-${dd}T00:00:00+09:00`;
}

function getNowKST() {
    const parts = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+09:00`;
}