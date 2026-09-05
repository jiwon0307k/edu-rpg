// Auth utilities

// Check if user is logged in and get their profile
async function getProfile() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return null;

    // If token is expired, sign out cleanly instead of auto-refreshing
    const expiresAt = session.expires_at;
    if (expiresAt && expiresAt * 1000 < Date.now()) {
        await db.auth.signOut();
        return null;
    }

    const user = session.user;

    const { data: profile } = await db
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    return profile;
}

// Route guard: redirect if not logged in or wrong role
async function requireAuth(allowedRoles) {
    const profile = await getProfile();
    if (!profile) {
        window.location.href = 'index.html';
        return null;
    }
    if (allowedRoles && !allowedRoles.includes(profile.role)) {
        if (profile.role === 'admin') {
            window.location.href = 'admin-students.html';
        } else {
            window.location.href = 'student.html';
        }
        return null;
    }

    // Initialize notification bell if present
    if (typeof initNotificationBell === 'function') {
        await initNotificationBell(profile.id);
    }

    return profile;
}

// Logout
async function logout() {
    await db.auth.signOut();
    window.location.href = 'index.html';
}

// Login page logic
if (document.getElementById('login-form')) {
    // If already logged in, redirect
    (async () => {
        try {
            const profile = await getProfile();
            if (profile) {
                window.location.href = profile.role === 'admin' ? 'admin-students.html' : 'student.html';
            }
        } catch (err) {
            console.error('Auto-login check failed:', err);
        }
    })();

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('login-error');
        errorEl.style.display = 'none';

        const submitBtn = document.querySelector('#login-form button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const { data, error } = await db.auth.signInWithPassword({ email, password });

            if (error) {
                errorEl.textContent = '로그인에 실패했습니다. 아이디와 비밀번호를 확인하세요.';
                errorEl.style.display = 'block';
                return;
            }

            const profile = await getProfile();
            if (profile) {
                window.location.href = profile.role === 'admin' ? 'admin-students.html' : 'student.html';
            } else {
                errorEl.textContent = '프로필 정보를 찾을 수 없습니다.';
                errorEl.style.display = 'block';
            }
        } catch (err) {
            console.error('Login error:', err);
            errorEl.textContent = '로그인 중 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.';
            errorEl.style.display = 'block';
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}
