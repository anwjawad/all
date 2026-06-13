// ===================================================================
// VIEW CERTIFICATES — certificates.js
// Allows employees to log in and view all their earned certificates.
// ===================================================================

// ----- Storage Keys ------------------------------------------------
const ANAPHYLAXIS_LOGS_KEY = 'anaphylaxis_course_logs';
const MC_COMPLETIONS_KEY   = 'mc_all_completions';
const GAS_URL_KEY          = 'anaphylaxis_gas_url';
const CERT_SESSION_KEY     = 'cert_portal_user';

// ----- State -------------------------------------------------------
let currentUser        = null;
let userCompletions    = [];
let gasWebhookUrl      = '';
let activeCertData     = null;

// ===================================================================
// INIT
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
    const _defaultGasUrl = 'https://script.google.com/macros/s/AKfycbzJFbq1qoQZD6ERUyexNi438u0gQmw2DyrSN0LQau5dUdvne1tFSBIh-XQsVQyyKyLUhQ/exec';
    gasWebhookUrl = localStorage.getItem(GAS_URL_KEY) || _defaultGasUrl;

    // Check for deep-link: ?certId=...&name=...&date=...&course=...
    const params = new URLSearchParams(window.location.search);
    if (params.get('certId') && params.get('name')) {
        showDeepLinkedCertificate(params);
        return;
    }

    // Check session
    const session = sessionStorage.getItem(CERT_SESSION_KEY);
    if (session) {
        try {
            currentUser = JSON.parse(session);
            if (currentUser && currentUser.name) {
                loadAndShowCertificates(currentUser.name, currentUser.password);
                return;
            }
        } catch(e) {}
    }

    // Show login
    showLoginSection();
});

// ===================================================================
// AUTHENTICATION
// ===================================================================
function showLoginSection() {
    document.getElementById('cert-login-section').style.display = 'block';
    document.getElementById('cert-display-section').style.display = 'none';
    document.getElementById('btn-logout-cert').style.display = 'none';
}

async function certLogin() {
    const name     = document.getElementById('cl-name').value.trim();
    const password = document.getElementById('cl-password').value.trim();
    const errorEl  = document.getElementById('cl-error');
    const submitBtn= document.getElementById('cl-submit-btn');

    if (!name || !password) { errorEl.style.display = 'block'; return; }

    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching…';

    const matched = await findUserCompletions(name, password);

    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Find My Certificates';

    if (matched !== null) {
        currentUser = { name, password };
        sessionStorage.setItem(CERT_SESSION_KEY, JSON.stringify(currentUser));
        loadAndShowCertificates(name, password);
    } else {
        errorEl.style.display = 'block';
    }
}

async function findUserCompletions(name, password) {
    const allCompletions = [];
    const nameLower = name.toLowerCase();

    // 1. Check cross-course completions
    try {
        const raw = localStorage.getItem(MC_COMPLETIONS_KEY);
        if (raw) {
            JSON.parse(raw).forEach(c => {
                if ((c.employeeName || c.name || '').toLowerCase() === nameLower) {
                    allCompletions.push(c);
                }
            });
        }
    } catch(e) {}

    // 2. Check legacy anaphylaxis logs
    try {
        const raw = localStorage.getItem(ANAPHYLAXIS_LOGS_KEY);
        if (raw) {
            JSON.parse(raw).forEach(l => {
                if ((l.name || '').toLowerCase() === nameLower && l.status === 'Passed') {
                    // Avoid duplicates
                    const dup = allCompletions.find(c =>
                        (c.certId || 'N/A') === (l.certId || 'N/A') &&
                        (c.courseSlug || '') === 'anaphylaxis');
                    if (!dup) {
                        allCompletions.push({
                            completionId: l.certId || 'legacy',
                            courseId:     'anaphylaxis',
                            courseSlug:   'anaphylaxis',
                            courseTitle:  'Anaphylaxis Recognition & Management',
                            certSubtitle: '1.0 Contact Hour | Current Clinical Guidelines',
                            employeeName: l.name,
                            department:   l.department || '',
                            jobTitle:     l.jobTitle   || '',
                            score:        l.score      || '',
                            status:       'Passed',
                            certId:       l.certId     || 'N/A',
                            completedAt:  l.date       || '',
                            date:         l.date       || '',
                            password:     l.password   || '',
                            rating:       l.rating     || ''
                        });
                    }
                }
            });
        }
    } catch(e) {}

    if (allCompletions.length === 0) return null;

    // Verify password against at least one record
    // Support both plain-text (legacy) and SHA-256 hashed passwords
    const hash = await sha256(password);
    const verified = allCompletions.find(c => {
        if (!c.password && !c.passwordHash) return true; // no password set, allow
        if (c.password  && c.password  === password) return true;
        if (c.passwordHash && c.passwordHash === hash) return true;
        if (c.password  && c.password  === hash)     return true; // already stored as hash
        return false;
    });

    if (!verified) return null;
    return allCompletions;
}

function loadAndShowCertificates(name, password) {
    findUserCompletions(name, password).then(completions => {
        if (!completions) {
            showLoginSection();
            return;
        }
        userCompletions = completions;
        renderCertificates();
        document.getElementById('cert-login-section').style.display  = 'none';
        document.getElementById('cert-display-section').style.display= 'block';
        document.getElementById('btn-logout-cert').style.display     = 'block';

        // User info bar
        const first = completions[0] || {};
        document.getElementById('display-user-name').textContent =
            first.employeeName || first.name || name;
        const dept = first.department || first.jobTitle || '';
        document.getElementById('display-user-dept').textContent =
            dept || 'Clinical Staff';
    });
}

function logoutCertPortal() {
    sessionStorage.removeItem(CERT_SESSION_KEY);
    currentUser     = null;
    userCompletions = [];
    showLoginSection();
    document.getElementById('cl-name').value     = '';
    document.getElementById('cl-password').value = '';
    document.getElementById('cl-error').style.display = 'none';
}

// ===================================================================
// RENDER CERTIFICATES
// ===================================================================
function renderCertificates() {
    const grid  = document.getElementById('certs-grid');
    const label = document.getElementById('cert-count-label');
    const passed = userCompletions.filter(c => c.status === 'Passed');

    if (label) {
        label.textContent = passed.length === 1
            ? '1 certificate'
            : `${passed.length} certificates`;
    }

    if (passed.length === 0) {
        grid.innerHTML = `
        <div class="empty-certs" style="grid-column:1/-1;">
            <i class="fa-solid fa-certificate"></i>
            <h3>No Certificates Yet</h3>
            <p>You haven't completed any courses yet. Complete a course and pass the exam to earn your certificate.</p>
            <a href="index.html" class="btn btn-primary" style="margin-top:1rem;">
                <i class="fa-solid fa-graduation-cap"></i> Go to Course Portal
            </a>
        </div>`;
        return;
    }

    grid.innerHTML = passed.map(c => {
        const courseTitle  = c.courseTitle  || 'Training Course';
        const certSubtitle = c.certSubtitle || '';
        const date         = c.completedAt  || c.date || '—';
        const certId       = c.certId       || 'N/A';
        const score        = c.score        || '—';
        const name         = c.employeeName || c.name || currentUser.name;
        const dataStr      = encodeURIComponent(JSON.stringify({ courseTitle, certSubtitle, date, certId, score, name }));

        return `
        <div class="cert-card animate-fade-in">
            <div class="cert-card-header">
                <div class="cert-badge-small"><i class="fa-solid fa-award"></i> Certificate of Completion</div>
                <div class="course-name">${escapeHtml(courseTitle)}</div>
            </div>
            <div class="cert-card-body">
                <div class="cert-meta-row">
                    <i class="fa-solid fa-user"></i>
                    <span>${escapeHtml(name)}</span>
                </div>
                <div class="cert-meta-row">
                    <i class="fa-regular fa-calendar"></i>
                    <span>Completed: <strong>${escapeHtml(date)}</strong></span>
                </div>
                <div class="cert-meta-row">
                    <i class="fa-solid fa-hashtag"></i>
                    <span>ID: <strong style="font-size:0.78rem;letter-spacing:0.04em;">${escapeHtml(certId)}</strong></span>
                </div>
                ${score && score !== '—' ? `
                <div class="cert-meta-row">
                    <i class="fa-solid fa-star"></i>
                    <span>Score: <strong>${escapeHtml(score)}</strong></span>
                </div>` : ''}
            </div>
            <div class="cert-card-actions">
                <button class="btn btn-primary btn-sm" style="flex:1;" onclick='openCertModal(${dataStr})'>
                    <i class="fa-solid fa-eye"></i> View &amp; Print
                </button>
            </div>
        </div>`;
    }).join('');
}

// ===================================================================
// CERTIFICATE MODAL
// ===================================================================
function openCertModal(data) {
    activeCertData = data;
    document.getElementById('modal-cert-name').textContent    = data.name    || '—';
    document.getElementById('modal-cert-course').textContent  = data.courseTitle || '—';
    document.getElementById('modal-cert-subtitle').textContent= data.certSubtitle || '';
    document.getElementById('modal-cert-date').textContent    = data.date    || '—';
    document.getElementById('modal-cert-id').textContent      = data.certId  || '—';
    document.getElementById('cert-view-modal').style.display  = 'flex';
}

function closeCertModal() {
    document.getElementById('cert-view-modal').style.display = 'none';
    activeCertData = null;
}

function printModalCertificate() {
    window.print();
}

// ===================================================================
// DEEP LINK (direct certificate view from ?certId=...&name=...)
// ===================================================================
function showDeepLinkedCertificate(params) {
    const certId  = params.get('certId');
    const name    = params.get('name');
    const date    = params.get('date') || '';
    const course  = params.get('course') || 'anaphylaxis';

    // Look up course title/subtitle from stored courses
    let courseTitle  = 'Anaphylaxis Recognition & Management';
    let certSubtitle = '1.0 Contact Hour | Current Clinical Guidelines';

    try {
        const coursesRaw = localStorage.getItem('mc_courses');
        if (coursesRaw) {
            const courses = JSON.parse(coursesRaw);
            const found   = courses.find(c => c.slug === course);
            if (found) {
                courseTitle  = found.certTitle   || found.title   || courseTitle;
                certSubtitle = found.certSubtitle || certSubtitle;
            }
        }
    } catch(e) {}

    document.getElementById('cert-login-section').style.display  = 'none';
    document.getElementById('cert-display-section').style.display= 'none';
    openCertModal({ name, courseTitle, certSubtitle, date, certId });
}

// ===================================================================
// PASSWORD HASHING (SHA-256 via Web Crypto API)
// ===================================================================
async function sha256(message) {
    try {
        const msgBuffer  = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray  = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch(e) {
        // Fallback for environments where SubtleCrypto is unavailable (plain text)
        return message;
    }
}

// ===================================================================
// UTILITY
// ===================================================================
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
