// Notification Bell UI
let notifDropdownOpen = false;

async function initNotificationBell(userId) {
    const bellBtn = document.getElementById('notif-bell');
    const dropdown = document.getElementById('notif-dropdown');
    if (!bellBtn || !dropdown) return;

    if (!userId) return;
    window._notifUserId = userId;

    await refreshNotifBadge();

    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdownOpen = !notifDropdownOpen;
        if (notifDropdownOpen) {
            dropdown.classList.add('open');
            loadNotifications();
        } else {
            dropdown.classList.remove('open');
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        if (notifDropdownOpen) {
            notifDropdownOpen = false;
            dropdown.classList.remove('open');
        }
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

async function refreshNotifBadge() {
    const badge = document.getElementById('notif-count');
    console.log("refreshNotifBadge initialized");
    console.log(window._notifUserId);
    if (!badge || !window._notifUserId) return;

    const { count } = await db
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', window._notifUserId)
        .eq('status', 'sent');
    console.log(count);

    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

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

    list.innerHTML = data.map(n => {
        const time = new Date(n.created_at).toLocaleDateString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const unread = n.status === 'sent' ? 'unread' : '';
        const readBtn = n.status === 'sent'
            ? `<button class="notif-read-btn" onclick="markAsRead(${n.id})">읽음</button>`
            : '';
        return `
            <div class="notif-item ${unread}" id="notif-${n.id}">
                <div class="notif-content">
                    <div class="notif-msg">${n.message}</div>
                    <div class="notif-time">${time}</div>
                </div>
                ${readBtn}
            </div>
        `;
    }).join('');
}

async function markAsRead(notifId) {
    await db
        .from('notifications')
        .update({ status: 'read' })
        .eq('id', notifId);

    const item = document.getElementById(`notif-${notifId}`);
    if (item) {
        item.classList.remove('unread');
        const btn = item.querySelector('.notif-read-btn');
        if (btn) btn.remove();
    }

    await refreshNotifBadge();
}

async function markAllAsRead() {
    if (!window._notifUserId) return;

    await db
        .from('notifications')
        .update({ status: 'read' })
        .eq('recipient_id', window._notifUserId)
        .eq('status', 'sent');

    document.querySelectorAll('.notif-item.unread').forEach(item => {
        item.classList.remove('unread');
        const btn = item.querySelector('.notif-read-btn');
        if (btn) btn.remove();
    });

    await refreshNotifBadge();
}
