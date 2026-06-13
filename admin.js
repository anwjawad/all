// ===================================================================
// ADMIN DASHBOARD — admin.js
// Manages course creation, participant tracking, and GAS sync.
// ===================================================================

// ----- Admin Credentials (hardcoded for static-site security) ------
const ADMIN_CREDENTIALS = [
    { name: 'jehad hawamdah', email: 'jehadgml@gmail.com', display: 'Jehad Hawamdah' }
];

// ----- Storage Keys ------------------------------------------------
const MC_COURSES_KEY       = 'mc_courses';
const MC_COMPLETIONS_KEY   = 'mc_all_completions';
const ANAPHYLAXIS_LOGS_KEY = 'anaphylaxis_course_logs';
const GAS_URL_KEY          = 'anaphylaxis_gas_url';
const ADMIN_SESSION_KEY    = 'admin_session';
const ADMIN_LOGIN_LOG_KEY  = 'admin_login_log';
const DEFAULT_GAS_URL      = 'https://script.google.com/macros/s/AKfycbzJFbq1qoQZD6ERUyexNi438u0gQmw2DyrSN0LQau5dUdvne1tFSBIh-XQsVQyyKyLUhQ/exec';

// ----- State -------------------------------------------------------
let adminUser        = null;
let allCourses       = [];
let allParticipants  = [];
let editingCourseId  = null;
let gasWebhookUrl    = '';
let examQCounter     = 0;
let pageCounter      = 0;

// ===================================================================
// COURSE TEMPLATES
// ===================================================================
const COURSE_TEMPLATES = [
    {
        id: 'blank',
        icon: 'fa-solid fa-file-circle-plus',
        color: '#6b7280',
        name: 'Blank Course',
        description: 'Start from scratch with a completely empty course.',
        data: { title: '', description: '', duration: '', certSubtitle: '', type: 'content', passScore: 80, contentPages: [], examQuestions: [] }
    },
    {
        id: 'hand-hygiene',
        icon: 'fa-solid fa-hands-bubbles',
        color: '#0891b2',
        name: 'Hand Hygiene',
        description: 'WHO 5 Moments for Hand Hygiene — ready-to-customize content.',
        data: {
            title: 'Hand Hygiene Compliance Training',
            description: 'Evidence-based training on the WHO 5 Moments for Hand Hygiene to prevent healthcare-associated infections.',
            duration: '30-Minute Online Training',
            certSubtitle: '0.5 Contact Hour | WHO Guidelines',
            type: 'content',
            passScore: 80,
            contentPages: [
                { title: 'Introduction to Hand Hygiene', content: '<h3>Why Hand Hygiene Matters</h3><p>Hand hygiene is the single most important practice to prevent healthcare-associated infections (HAIs). The WHO estimates that 15% of hospital patients suffer from a preventable infection during their stay.</p><ul><li>Up to 80% of infections are transmitted by hands</li><li>Proper hand hygiene can reduce HAI rates by up to 50%</li><li>Both patients and healthcare workers benefit</li></ul>', imageUrl: '' },
                { title: 'The WHO 5 Moments', content: '<h3>The 5 Critical Moments</h3><p>The WHO identifies five key moments when hand hygiene must be performed:</p><ul><li><strong>Moment 1:</strong> Before touching a patient</li><li><strong>Moment 2:</strong> Before a clean or aseptic procedure</li><li><strong>Moment 3:</strong> After body fluid exposure risk</li><li><strong>Moment 4:</strong> After touching a patient</li><li><strong>Moment 5:</strong> After touching patient surroundings</li></ul>', imageUrl: '' },
                { title: 'Correct Hand Hygiene Technique', content: '<h3>How to Perform Hand Hygiene</h3><p>Alcohol-based hand rub (ABHR) is the preferred method when hands are not visibly soiled.</p><ul><li>Apply enough product to cover all surfaces</li><li>Rub hands together for 20–30 seconds</li><li>Ensure all areas: palm, back, fingers, thumbs, and wrists are covered</li></ul><p>Use soap and water when hands are visibly dirty, after contact with spores (e.g., C. difficile), or after using the toilet.</p>', imageUrl: '' }
            ],
            examQuestions: [
                { id: 1, text: 'According to the WHO, what is the most important single practice to prevent healthcare-associated infections?', options: [{key:'A',text:'Wearing gloves at all times'},{key:'B',text:'Hand hygiene'},{key:'C',text:'Using PPE'},{key:'D',text:'Isolating infected patients'}], correct: 'B' },
                { id: 2, text: 'According to the WHO 5 Moments, when should hand hygiene be performed?', options: [{key:'A',text:'Only before procedures'},{key:'B',text:'Only after touching a patient'},{key:'C',text:'Before and after patient contact and after body fluid exposure'},{key:'D',text:'Only when hands are visibly dirty'}], correct: 'C' },
                { id: 3, text: 'Which method is preferred for hand hygiene when hands are not visibly soiled?', options: [{key:'A',text:'Soap and water for 60 seconds'},{key:'B',text:'Alcohol-based hand rub (ABHR)'},{key:'C',text:'Dry wipes'},{key:'D',text:'Gloves alone'}], correct: 'B' },
                { id: 4, text: 'How long should you rub hands when using an alcohol-based hand rub?', options: [{key:'A',text:'5–10 seconds'},{key:'B',text:'10–15 seconds'},{key:'C',text:'20–30 seconds'},{key:'D',text:'60–90 seconds'}], correct: 'C' }
            ]
        }
    },
    {
        id: 'medication-safety',
        icon: 'fa-solid fa-pills',
        color: '#7c3aed',
        name: 'Medication Safety',
        description: 'The 5 Rights of Medication Administration — ready to use.',
        data: {
            title: 'Medication Safety: The 5 Rights',
            description: 'Training on safe medication administration practices to prevent medication errors in clinical settings.',
            duration: '45-Minute Online Training',
            certSubtitle: '0.75 Contact Hour | Medication Safety Guidelines',
            type: 'content',
            passScore: 80,
            contentPages: [
                { title: 'Medication Errors: The Problem', content: '<h3>Why Medication Safety Matters</h3><p>Medication errors are among the most common preventable adverse events in healthcare. They can occur at any stage: prescribing, dispensing, or administration.</p><ul><li>Approximately 1 in 10 patients are harmed while receiving hospital care</li><li>Medication errors are a leading cause of preventable patient harm</li><li>Most errors are preventable with systematic checks</li></ul>', imageUrl: '' },
                { title: 'The 5 Rights of Medication Administration', content: '<h3>The 5 Rights</h3><p>Before administering any medication, verify all five rights:</p><ul><li><strong>Right Patient</strong> — Check two patient identifiers</li><li><strong>Right Medication</strong> — Verify the drug name matches the order</li><li><strong>Right Dose</strong> — Confirm the dose and calculate if needed</li><li><strong>Right Route</strong> — Ensure the correct administration route</li><li><strong>Right Time</strong> — Administer at the correct scheduled time</li></ul>', imageUrl: '' },
                { title: 'High-Alert Medications', content: '<h3>High-Alert Medications</h3><p>Some medications carry a higher risk of causing significant harm when used in error. These require extra precautions:</p><ul><li>Anticoagulants (heparin, warfarin)</li><li>Concentrated electrolytes (KCl, hypertonic saline)</li><li>Insulin</li><li>Opioids</li><li>Chemotherapy agents</li></ul><p>Always use double-check procedures for high-alert medications.</p>', imageUrl: '' }
            ],
            examQuestions: [
                { id: 1, text: 'How many patient identifiers should be checked before administering medication?', options: [{key:'A',text:'One (name only)'},{key:'B',text:'Two identifiers'},{key:'C',text:'Three identifiers'},{key:'D',text:'It is not required'}], correct: 'B' },
                { id: 2, text: 'Which of the following is NOT one of the 5 Rights of medication administration?', options: [{key:'A',text:'Right Patient'},{key:'B',text:'Right Dose'},{key:'C',text:'Right Nurse'},{key:'D',text:'Right Route'}], correct: 'C' },
                { id: 3, text: 'When are double-check procedures especially important?', options: [{key:'A',text:'For all oral medications'},{key:'B',text:'Only for pediatric patients'},{key:'C',text:'For high-alert medications'},{key:'D',text:'Only during night shifts'}], correct: 'C' },
                { id: 4, text: 'A patient refuses a medication. What should the nurse do first?', options: [{key:'A',text:'Administer it anyway'},{key:'B',text:'Document the refusal and notify the prescriber'},{key:'C',text:'Give the medication later without documentation'},{key:'D',text:'Crush it and mix with food'}], correct: 'B' }
            ]
        }
    },
    {
        id: 'falls-prevention',
        icon: 'fa-solid fa-person-falling-burst',
        color: '#dc2626',
        name: 'Falls Prevention',
        description: 'Inpatient fall risk assessment and prevention strategies.',
        data: {
            title: 'Falls Prevention in Inpatient Settings',
            description: 'Training on identifying fall risk factors and implementing evidence-based prevention strategies to keep patients safe.',
            duration: '30-Minute Online Training',
            certSubtitle: '0.5 Contact Hour | Patient Safety Standards',
            type: 'content',
            passScore: 80,
            contentPages: [
                { title: 'The Scope of the Problem', content: '<h3>Why Falls Prevention Matters</h3><p>Falls are the most common adverse event in hospitalized patients. They result in injury, extended stays, and significant costs.</p><ul><li>An estimated 700,000 to 1 million patient falls occur each year in U.S. hospitals</li><li>30–35% of falls result in injury</li><li>Falls are largely preventable with systematic assessment</li></ul>', imageUrl: '' },
                { title: 'Identifying Fall Risk Factors', content: '<h3>Common Risk Factors</h3><p>Assess each patient for modifiable and non-modifiable fall risk factors:</p><ul><li><strong>Intrinsic:</strong> Age ≥65, history of falls, altered mental status, urinary incontinence</li><li><strong>Medication-related:</strong> Sedatives, opioids, diuretics, antihypertensives</li><li><strong>Environmental:</strong> Wet floors, poor lighting, bed height, clutter</li></ul><p>Use a validated tool (e.g., Morse Fall Scale, STRATIFY) on admission and after any change in condition.</p>', imageUrl: '' },
                { title: 'Prevention Strategies', content: '<h3>Key Prevention Interventions</h3><p>Implement a bundle of interventions tailored to each patient\'s risk level:</p><ul><li>Keep bed in lowest position with brakes locked</li><li>Ensure call light is within reach</li><li>Orient patients to their environment</li><li>Hourly rounding</li><li>Non-slip footwear</li><li>Review and reduce fall-risk medications when possible</li></ul>', imageUrl: '' }
            ],
            examQuestions: [
                { id: 1, text: 'When should a fall risk assessment be performed for a hospitalized patient?', options: [{key:'A',text:'Only on admission'},{key:'B',text:'On admission and after any change in condition'},{key:'C',text:'Once per week'},{key:'D',text:'Only if the patient is elderly'}], correct: 'B' },
                { id: 2, text: 'Which class of medications is a common modifiable fall risk factor?', options: [{key:'A',text:'Antibiotics'},{key:'B',text:'Antacids'},{key:'C',text:'Sedatives and opioids'},{key:'D',text:'Vitamins'}], correct: 'C' },
                { id: 3, text: 'What is the correct bed position for a fall-risk patient at rest?', options: [{key:'A',text:'Highest position for easy nurse access'},{key:'B',text:'Trendelenburg position'},{key:'C',text:'Lowest position with brakes locked'},{key:'D',text:'Position does not matter'}], correct: 'C' },
                { id: 4, text: 'Hourly rounding is primarily intended to:', options: [{key:'A',text:'Monitor vital signs'},{key:'B',text:'Proactively address patient needs to prevent unsupervised attempts to get up'},{key:'C',text:'Document nursing notes'},{key:'D',text:'Administer medications on time'}], correct: 'B' }
            ]
        }
    },
    {
        id: 'infection-control',
        icon: 'fa-solid fa-shield-virus',
        color: '#059669',
        name: 'Infection Control',
        description: 'Standard and transmission-based precautions training.',
        data: {
            title: 'Infection Control: Standard Precautions',
            description: 'Comprehensive training on standard and transmission-based precautions to prevent the spread of infection in healthcare settings.',
            duration: '45-Minute Online Training',
            certSubtitle: '0.75 Contact Hour | CDC/WHO Infection Control Standards',
            type: 'content',
            passScore: 80,
            contentPages: [
                { title: 'Standard Precautions Overview', content: '<h3>What Are Standard Precautions?</h3><p>Standard precautions are the minimum infection prevention practices that apply to ALL patient care, regardless of suspected or confirmed infection status. They are based on the principle that all blood, body fluids, secretions, and excretions may be infectious.</p><ul><li>Hand hygiene</li><li>Use of PPE (gloves, gown, mask, eye protection)</li><li>Safe injection practices</li><li>Respiratory hygiene / cough etiquette</li></ul>', imageUrl: '' },
                { title: 'Transmission-Based Precautions', content: '<h3>Three Categories</h3><p>Transmission-based precautions are used in addition to standard precautions for patients with known or suspected infections that require extra precautions:</p><ul><li><strong>Contact Precautions:</strong> Direct or indirect contact transmission (e.g., MRSA, C. diff, VRE). Requires gown and gloves.</li><li><strong>Droplet Precautions:</strong> Large droplets (>5 µm) within 3 feet (e.g., influenza, COVID-19). Requires surgical mask.</li><li><strong>Airborne Precautions:</strong> Airborne particles (e.g., TB, measles, chickenpox). Requires N95 respirator and negative pressure room.</li></ul>', imageUrl: '' },
                { title: 'PPE: Donning and Doffing', content: '<h3>Correct PPE Use</h3><p>Improper PPE removal is a leading cause of self-contamination. Follow the correct sequence:</p><p><strong>Donning order:</strong> Gown → Mask/Respirator → Eye protection → Gloves</p><p><strong>Doffing order (most contaminated items first):</strong></p><ul><li>Gloves (pull inside-out)</li><li>Eye protection (handle by headband)</li><li>Gown (roll outside in)</li><li>Mask (handle by ties/loops only)</li></ul><p>Perform hand hygiene after each step of doffing.</p>', imageUrl: '' }
            ],
            examQuestions: [
                { id: 1, text: 'Standard precautions apply to:', options: [{key:'A',text:'Only patients with confirmed infections'},{key:'B',text:'Only patients who are immunocompromised'},{key:'C',text:'All patients regardless of infection status'},{key:'D',text:'Only patients in isolation'}], correct: 'C' },
                { id: 2, text: 'A patient is diagnosed with active pulmonary tuberculosis. Which precaution type is required?', options: [{key:'A',text:'Contact precautions only'},{key:'B',text:'Droplet precautions'},{key:'C',text:'Airborne precautions with N95 and negative pressure room'},{key:'D',text:'Standard precautions are sufficient'}], correct: 'C' },
                { id: 3, text: 'What is the correct order for DOFFING PPE?', options: [{key:'A',text:'Mask → Gown → Gloves → Eye protection'},{key:'B',text:'Gloves → Eye protection → Gown → Mask'},{key:'C',text:'Gown → Gloves → Mask → Eye protection'},{key:'D',text:'Order does not matter'}], correct: 'B' },
                { id: 4, text: 'Droplet precautions require which PPE at minimum?', options: [{key:'A',text:'N95 respirator'},{key:'B',text:'Surgical mask'},{key:'C',text:'Full face shield only'},{key:'D',text:'No additional PPE beyond standard'}], correct: 'B' }
            ]
        }
    }
];

// ===================================================================
// INIT
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
    initGasConfig();
    checkAdminSession();
});

// ===================================================================
// AUTHENTICATION
// ===================================================================
function checkAdminSession() {
    try {
        const session = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || 'null');
        if (session && session.email) {
            const cred = ADMIN_CREDENTIALS.find(c => c.email === session.email);
            if (cred) {
                adminUser = cred;
                showDashboard();
                return;
            }
        }
    } catch(e) {}
    showLoginPage();
}

function showLoginPage() {
    document.getElementById('admin-login-page').style.display = 'flex';
    document.getElementById('admin-dashboard-page').style.display = 'none';
}

function showDashboard() {
    document.getElementById('admin-login-page').style.display = 'none';
    document.getElementById('admin-dashboard-page').style.display = 'flex';
    document.getElementById('admin-display-name').textContent = adminUser.display;
    document.getElementById('admin-welcome-msg').textContent = `Welcome, ${adminUser.display}`;
    recordAdminLogin(adminUser.display, adminUser.email);
    loadAllData();
    renderSettingsAdminList();
    initSettingsGasUrl();
}

function adminLogin() {
    const name  = document.getElementById('al-name').value.trim().toLowerCase();
    const email = document.getElementById('al-email').value.trim().toLowerCase();
    const cred  = ADMIN_CREDENTIALS.find(c => c.name === name && c.email === email);

    if (cred) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ email: cred.email }));
        adminUser = cred;
        document.getElementById('al-error').style.display = 'none';
        showDashboard();
    } else {
        document.getElementById('al-error').style.display = 'block';
        document.getElementById('al-name').value = '';
        document.getElementById('al-email').value = '';
        document.getElementById('al-name').focus();
    }
}

function adminLogout() {
    if (confirm('Log out of the Admin Portal?')) {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        adminUser = null;
        showLoginPage();
    }
}

function recordAdminLogin(name, email) {
    let logins = [];
    try { logins = JSON.parse(localStorage.getItem(ADMIN_LOGIN_LOG_KEY) || '[]'); } catch(e) {}
    logins.push({ name, email, time: new Date().toLocaleString() });
    localStorage.setItem(ADMIN_LOGIN_LOG_KEY, JSON.stringify(logins));
}

// ===================================================================
// NAVIGATION TABS
// ===================================================================
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

    const tabEl = document.getElementById('tab-' + tabName);
    const linkEl = document.getElementById('tab-link-' + tabName);
    if (tabEl) tabEl.classList.add('active');
    if (linkEl) linkEl.classList.add('active');

    const titles = { overview: 'Dashboard Overview', courses: 'Course Management', participants: 'All Participants', settings: 'Settings', 'course-editor': 'Course Editor' };
    document.getElementById('topbar-title').textContent = titles[tabName] || 'Admin Panel';

    if (tabName === 'participants') syncParticipantsDisplay();
    if (tabName === 'overview')     renderOverview();
}

function toggleSidebar() {
    document.getElementById('admin-sidebar').classList.toggle('collapsed');
}

// ===================================================================
// DATA LOADING
// ===================================================================
function loadAllData() {
    loadCourses();
    loadParticipants();
    if (gasWebhookUrl) fetchGasData();
}

function loadCourses() {
    allCourses = getCourses();
    renderCoursesTable();
    renderOverview();
    populateCourseFilter();
}

function getCourses() {
    const stored = [];
    try {
        const raw = localStorage.getItem(MC_COURSES_KEY);
        if (raw) stored.push(...JSON.parse(raw));
    } catch(e) {}

    // Always include the legacy anaphylaxis course
    const hasAna = stored.find(c => c.slug === 'anaphylaxis');
    if (!hasAna) {
        stored.unshift({
            courseId:    'anaphylaxis',
            slug:        'anaphylaxis',
            title:       'Anaphylaxis Recognition & Management',
            description: 'Web-based clinical training on anaphylaxis recognition and emergency management.',
            duration:    '1-Hour Online Training',
            type:        'legacy',
            certTitle:   'Anaphylaxis Recognition & Management',
            certSubtitle:'1.0 Contact Hour | Current Clinical Guidelines',
            videoUrl:    'https://www.youtube.com/embed/yJnOgcba-To',
            passScore:   80,
            status:      'published',
            createdAt:   '2026-01-01',
            examQuestions: []
        });
    }
    return stored;
}

function saveCourses(courses) {
    // Always save ALL courses (including legacy anaphylaxis in the list)
    localStorage.setItem(MC_COURSES_KEY, JSON.stringify(courses));
}

function loadParticipants() {
    allParticipants = [];

    // Pull from cross-course completions
    try {
        const raw = localStorage.getItem(MC_COMPLETIONS_KEY);
        if (raw) {
            const comps = JSON.parse(raw);
            comps.forEach(c => {
                allParticipants.push({
                    name:       c.employeeName || c.name || '',
                    course:     c.courseTitle  || 'Unknown',
                    courseSlug: c.courseSlug   || '',
                    department: c.department   || '—',
                    jobTitle:   c.jobTitle     || '—',
                    score:      c.score        || '—',
                    status:     c.status       || '—',
                    date:       c.completedAt  || c.date || '—',
                    rating:     c.rating       || 'N/A',
                    feedback:   c.feedback     || 'N/A',
                    certId:     c.certId       || 'N/A'
                });
            });
        }
    } catch(e) {}

    // Also pull legacy anaphylaxis logs
    try {
        const raw = localStorage.getItem(ANAPHYLAXIS_LOGS_KEY);
        if (raw) {
            JSON.parse(raw).forEach(l => {
                const exists = allParticipants.find(p =>
                    p.name === l.name && p.courseSlug === 'anaphylaxis' && p.certId === (l.certId || 'N/A'));
                if (!exists) {
                    allParticipants.push({
                        name:       l.name       || '',
                        course:     'Anaphylaxis Recognition & Management',
                        courseSlug: 'anaphylaxis',
                        department: l.department || '—',
                        jobTitle:   l.jobTitle   || '—',
                        score:      l.score      || '—',
                        status:     l.status     || '—',
                        date:       l.date       || '—',
                        rating:     l.rating     || 'N/A',
                        feedback:   l.feedback   || 'N/A',
                        certId:     l.certId     || 'N/A'
                    });
                }
            });
        }
    } catch(e) {}
}

// ===================================================================
// OVERVIEW TAB
// ===================================================================
function renderOverview() {
    // Stats
    const published = allCourses.filter(c => c.status === 'published').length;
    const total     = allParticipants.length;
    const passed    = allParticipants.filter(p => p.status === 'Passed').length;
    const passRate  = total > 0 ? Math.round((passed / total) * 100) : 0;

    document.getElementById('stat-total-courses').textContent     = published;
    document.getElementById('stat-total-participants').textContent = total;
    document.getElementById('stat-total-certs').textContent       = passed;
    document.getElementById('stat-overall-pass-rate').textContent = passRate + '%';

    // Course cards
    const grid = document.getElementById('overview-courses-grid');
    const published_ = allCourses.filter(c => c.status === 'published');
    if (published_.length === 0) {
        grid.innerHTML = '<div class="breakdown-empty">No published courses yet.</div>';
    } else {
        grid.innerHTML = published_.map(c => {
            const cParts  = allParticipants.filter(p => p.courseSlug === c.slug);
            const cPassed = cParts.filter(p => p.status === 'Passed').length;
            const cRate   = cParts.length > 0 ? Math.round((cPassed / cParts.length) * 100) : 0;
            const link    = buildCourseLink(c.slug);
            const typeLabel = { legacy: 'Legacy (Slides)', slides: 'Slides', content: 'Content' }[c.type] || c.type;
            return `
            <div class="course-overview-card glassmorphism">
                <div class="coc-header">
                    <i class="fa-solid fa-book-medical"></i>
                    <span class="coc-type-badge">${escapeHtml(typeLabel)}</span>
                </div>
                <h4>${escapeHtml(c.title)}</h4>
                <p>${escapeHtml(c.description || '')}</p>
                <div class="coc-stats">
                    <span><strong>${cParts.length}</strong> participants</span>
                    <span><strong>${cRate}%</strong> pass rate</span>
                </div>
                <div class="coc-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openShareLinkModal('${escapeHtml(c.slug)}')">
                        <i class="fa-solid fa-link"></i> Share Link
                    </button>
                    <a href="${escapeHtml(link)}" target="_blank" class="btn btn-primary btn-sm">
                        <i class="fa-solid fa-eye"></i> Preview
                    </a>
                </div>
            </div>`;
        }).join('');
    }

    // Analytics
    renderJobBreakdown('overview-job-breakdown');
    renderScoreDistribution('overview-score-bars');
    renderLoginLog('overview-login-log');
}

function renderJobBreakdown(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (allParticipants.length === 0) {
        container.innerHTML = '<div class="breakdown-empty">No data yet</div>';
        return;
    }
    const counts = { Nurse: 0, Physician: 0, Others: 0 };
    allParticipants.forEach(l => {
        const jt = l.jobTitle || 'Others';
        if (counts.hasOwnProperty(jt)) counts[jt]++;
        else counts['Others']++;
    });
    const total  = allParticipants.length;
    const colors = { Nurse: '#0d9488', Physician: '#3b82f6', Others: '#f59e0b' };
    const icons  = { Nurse: 'fa-user-nurse', Physician: 'fa-user-doctor', Others: 'fa-user' };
    container.innerHTML = Object.entries(counts).map(([label, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `
        <div class="breakdown-row">
            <div class="breakdown-label">
                <i class="fa-solid ${icons[label]}" style="color:${colors[label]}"></i>
                <span>${label}</span>
                <strong>${count}</strong>
            </div>
            <div class="breakdown-bar-track">
                <div class="breakdown-bar-fill" style="width:${pct}%;background:${colors[label]}"></div>
            </div>
            <span class="breakdown-pct">${pct}%</span>
        </div>`;
    }).join('');
}

function renderScoreDistribution(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (allParticipants.length === 0) {
        container.innerHTML = '<div class="breakdown-empty">No data yet</div>';
        return;
    }
    const scoreCounts = { '0/5':0, '1/5':0, '2/5':0, '3/5':0, '4/5':0, '5/5':0 };
    allParticipants.forEach(l => {
        const s = (l.score || '0/5').split('/')[0] + '/5';
        if (scoreCounts.hasOwnProperty(s)) scoreCounts[s]++;
    });
    const max = Math.max(...Object.values(scoreCounts), 1);
    container.innerHTML = Object.entries(scoreCounts).map(([score, count]) => {
        const pct = Math.round((count / max) * 100);
        const color = parseInt(score) >= 4 ? '#059669' : '#dc2626';
        return `
        <div class="breakdown-row">
            <div class="breakdown-label" style="min-width:42px"><span style="font-weight:700">${score}</span></div>
            <div class="breakdown-bar-track">
                <div class="breakdown-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <span class="breakdown-pct">${count}</span>
        </div>`;
    }).join('');
}

function renderLoginLog(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let logins = [];
    try { logins = JSON.parse(localStorage.getItem(ADMIN_LOGIN_LOG_KEY) || '[]'); } catch(e) {}
    if (logins.length === 0) {
        container.innerHTML = '<div class="breakdown-empty">No logins recorded</div>';
        return;
    }
    container.innerHTML = logins.slice().reverse().slice(0, 10).map(l => `
        <div class="login-entry">
            <i class="fa-solid fa-circle-user" style="color:var(--primary-color)"></i>
            <div class="login-entry-body">
                <strong>${escapeHtml(l.name)}</strong>
                <span>${escapeHtml(l.email)}</span>
            </div>
            <span class="login-time">${escapeHtml(l.time)}</span>
        </div>`).join('');
}

// ===================================================================
// COURSES TABLE
// ===================================================================
function renderCoursesTable() {
    const tbody = document.getElementById('courses-table-body');
    if (!tbody) return;
    if (allCourses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">No courses yet. Click "Create New Course" to begin.</td></tr>`;
        return;
    }
    tbody.innerHTML = allCourses.map((c, idx) => {
        const cParts  = allParticipants.filter(p => p.courseSlug === c.slug);
        const cPassed = cParts.filter(p => p.status === 'Passed').length;
        const rate    = cParts.length > 0 ? Math.round((cPassed / cParts.length) * 100) : 0;
        const statusBadge = c.status === 'published'
            ? `<span class="badge badge-success">Published</span>`
            : `<span class="badge" style="background:#fef3c7;color:#b45309;font-weight:700;">Draft</span>`;
        const typeLabel = { legacy: 'Legacy', slides: 'Slides', content: 'Content' }[c.type] || c.type;
        const isLegacy  = c.type === 'legacy';
        return `
        <tr>
            <td style="color:var(--text-muted);font-size:0.8rem">${idx + 1}</td>
            <td><strong>${escapeHtml(c.title)}</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">/${escapeHtml(c.slug)}</span></td>
            <td><span class="job-badge" style="background:rgba(17,94,89,0.08);color:var(--primary-color);border:1px solid rgba(17,94,89,0.15)">${escapeHtml(typeLabel)}</span></td>
            <td>${statusBadge}</td>
            <td style="text-align:center;font-weight:700">${cParts.length}</td>
            <td style="text-align:center;font-weight:700">${rate}%</td>
            <td style="font-size:0.82rem;white-space:nowrap">${escapeHtml(c.createdAt || '—')}</td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="openShareLinkModal('${escapeHtml(c.slug)}')" title="Copy course link">
                        <i class="fa-solid fa-link"></i>
                    </button>
                    ${!isLegacy ? `<button class="btn btn-secondary btn-sm" onclick="openEditCourseModal('${escapeHtml(c.courseId)}')" title="Edit course">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>` : ''}
                    ${!isLegacy ? `<button class="btn btn-danger btn-sm" onclick="deleteCourse('${escapeHtml(c.courseId)}')" title="Delete course">
                        <i class="fa-solid fa-trash"></i>
                    </button>` : ''}
                    ${c.status !== 'published' ? `<button class="btn btn-success btn-sm" onclick="publishCourse('${escapeHtml(c.courseId)}')" title="Publish">
                        <i class="fa-solid fa-globe"></i> Publish
                    </button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ===================================================================
// PARTICIPANTS TABLE
// ===================================================================
function syncParticipantsDisplay() {
    loadParticipants();

    const total  = allParticipants.length;
    const passed = allParticipants.filter(p => p.status === 'Passed').length;
    const rate   = total > 0 ? Math.round((passed / total) * 100) : 0;
    const rated  = allParticipants.filter(p => p.rating && p.rating !== 'N/A');
    const avg    = rated.length > 0
        ? (rated.reduce((s, l) => s + parseFloat(l.rating), 0) / rated.length).toFixed(1)
        : '—';

    document.getElementById('part-stat-total').textContent  = total;
    document.getElementById('part-stat-passed').textContent = passed;
    document.getElementById('part-stat-rate').textContent   = rate + '%';
    document.getElementById('part-stat-rating').textContent = avg !== '—' ? avg + '/4' : '—';

    filterParticipantsTable();
}

function filterParticipantsTable() {
    const search       = (document.getElementById('part-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('part-filter-status')?.value || '';
    const courseFilter = document.getElementById('part-filter-course')?.value  || '';

    const filtered = allParticipants.filter(p => {
        const matchSearch = !search || (p.name || '').toLowerCase().includes(search) || (p.department || '').toLowerCase().includes(search);
        const matchStatus = !statusFilter || p.status === statusFilter;
        const matchCourse = !courseFilter || p.courseSlug === courseFilter;
        return matchSearch && matchStatus && matchCourse;
    });

    renderParticipantsTable(filtered);
}

function renderParticipantsTable(logs) {
    const tbody     = document.getElementById('participants-table-body');
    const countLabel= document.getElementById('participants-count-label');
    if (!tbody) return;

    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:2rem;font-style:italic;">No participants found matching your filters.</td></tr>`;
        if (countLabel) countLabel.textContent = '';
        return;
    }

    tbody.innerHTML = logs.slice().reverse().map((p, idx) => {
        const badgeClass = p.status === 'Passed' ? 'badge-success' : 'badge-danger';
        const certUrl    = buildCertLinkFromLog(p);
        const certCell   = certUrl
            ? `<a href="${certUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;background:rgba(17,94,89,0.08);color:var(--primary-color);font-size:0.78rem;font-weight:700;text-decoration:none;border:1px solid rgba(17,94,89,0.2);"><i class="fa-solid fa-certificate"></i> View</a>`
            : '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>';
        return `
        <tr>
            <td style="color:var(--text-muted);font-size:0.8rem">${logs.length - idx}</td>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td style="font-size:0.82rem">${escapeHtml(p.course || '—')}</td>
            <td style="font-size:0.85rem">${escapeHtml(p.department || '—')}</td>
            <td><span class="job-badge" style="background:rgba(17,94,89,0.08);color:var(--primary-color);border:1px solid rgba(17,94,89,0.15)">${escapeHtml(p.jobTitle || '—')}</span></td>
            <td style="font-weight:700;text-align:center">${escapeHtml(p.score)}</td>
            <td><span class="badge ${badgeClass}">${escapeHtml(p.status)}</span></td>
            <td style="font-size:0.82rem;white-space:nowrap">${escapeHtml(p.date)}</td>
            <td style="text-align:center;font-weight:600">${p.rating !== 'N/A' && p.rating ? parseFloat(p.rating).toFixed(1) + '/4' : '—'}</td>
            <td style="text-align:center">${certCell}</td>
        </tr>`;
    }).join('');

    if (countLabel) countLabel.textContent = `Showing ${logs.length} of ${allParticipants.length} participant(s)`;
}

function populateCourseFilter() {
    const sel = document.getElementById('part-filter-course');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">All Courses</option>' +
        allCourses.map(c => `<option value="${escapeHtml(c.slug)}" ${current === c.slug ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('');
}

// ===================================================================
// COURSE EDITOR (full-page)
// ===================================================================
function openCourseEditor(courseId) {
    editingCourseId = courseId || null;
    examQCounter = 0;
    pageCounter  = 0;

    const isNew = !courseId;
    document.getElementById('editor-page-title').textContent    = isNew ? 'New Course' : 'Edit Course';
    document.getElementById('editor-page-subtitle').textContent = isNew ? 'Start with a template or build from scratch' : 'Update course details and content';
    document.getElementById('templates-section').style.display  = isNew ? 'block' : 'none';

    // Clear all fields
    document.getElementById('cf-id').value           = '';
    document.getElementById('cf-title').value        = '';
    document.getElementById('cf-slug').value         = '';
    document.getElementById('cf-description').value  = '';
    document.getElementById('cf-duration').value     = '';
    document.getElementById('cf-type').value         = 'content';
    document.getElementById('cf-pass-score').value   = 80;
    document.getElementById('cf-video').value        = '';
    document.getElementById('cf-cert-title').value   = '';
    document.getElementById('cf-cert-subtitle').value= '';
    document.getElementById('cf-slides-path').value  = '';
    document.getElementById('cf-total-slides').value = '';
    document.getElementById('cf-audio-path').value   = '';
    document.getElementById('cf-audio-count').value  = '';
    document.getElementById('exam-questions-list').innerHTML =
        '<div id="exam-questions-empty" class="empty-state-box" style="display:flex;"><i class="fa-solid fa-circle-question"></i><p>No questions yet.<br>Click <strong>"Add Question"</strong> to build the exam.</p></div>';
    document.getElementById('content-pages-list').innerHTML =
        '<div id="content-pages-empty" class="empty-state-box" style="display:flex;"><i class="fa-solid fa-file-circle-plus"></i><p>No pages yet.<br>Click <strong>"Add Page"</strong> to start building your course content.</p></div>';
    const videoPrevEl = document.getElementById('video-preview-container');
    if (videoPrevEl) videoPrevEl.style.display = 'none';

    onCourseTypeChange();
    updateCertPreview();

    if (isNew) {
        renderTemplatesGrid();
    } else {
        const course = allCourses.find(c => c.courseId === courseId);
        if (!course) return;

        document.getElementById('cf-id').value           = course.courseId;
        document.getElementById('cf-title').value        = course.title || '';
        document.getElementById('cf-slug').value         = course.slug  || '';
        document.getElementById('cf-description').value  = course.description || '';
        document.getElementById('cf-duration').value     = course.duration || '';
        document.getElementById('cf-type').value         = course.type || 'content';
        document.getElementById('cf-pass-score').value   = course.passScore || 80;
        document.getElementById('cf-video').value        = course.videoUrl || '';
        document.getElementById('cf-cert-title').value   = course.certTitle || '';
        document.getElementById('cf-cert-subtitle').value= course.certSubtitle || '';
        document.getElementById('cf-slides-path').value  = course.slidesPath || '';
        document.getElementById('cf-total-slides').value = course.totalSlides || '';
        document.getElementById('cf-audio-path').value   = course.audioPath || '';
        document.getElementById('cf-audio-count').value  = course.audioCount || '';

        onCourseTypeChange();
        updateVideoPreview();
        updateCertPreview();

        // Rebuild content pages
        (course.contentPages || []).forEach(p => addContentPage(p));
        // Rebuild exam questions
        (course.examQuestions || []).forEach(q => addExamQuestion(q));
    }

    showEditorTab('info');
    showTab('course-editor');
}

function closeCourseEditor() {
    editingCourseId = null;
    showTab('courses');
}

// Legacy aliases so any remaining onclick="openCreateCourseModal()" or openEditCourseModal() still works
function openCreateCourseModal() { openCourseEditor(null); }
function openEditCourseModal(id)  { openCourseEditor(id); }
function closeCourseModal()       { closeCourseEditor(); }

function showEditorTab(tabName) {
    document.querySelectorAll('.editor-tab-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.editor-tab-btn').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById('etab-' + tabName);
    const btn   = document.getElementById('etab-btn-' + tabName);
    if (panel) panel.style.display = 'block';
    if (btn)   btn.classList.add('active');
}

function renderTemplatesGrid() {
    const grid = document.getElementById('templates-grid');
    if (!grid) return;
    grid.innerHTML = COURSE_TEMPLATES.map(t => `
        <div class="template-card" onclick="applyTemplate('${t.id}')">
            <div class="tc-icon" style="background:${t.color}20;color:${t.color}">
                <i class="${t.icon}"></i>
            </div>
            <div class="tc-body">
                <strong>${t.name}</strong>
                <p>${t.description}</p>
            </div>
            <div class="tc-apply"><i class="fa-solid fa-arrow-right"></i></div>
        </div>`).join('');
}

function applyTemplate(templateId) {
    const tmpl = COURSE_TEMPLATES.find(t => t.id === templateId);
    if (!tmpl) return;
    const d = tmpl.data;

    document.getElementById('cf-title').value        = d.title;
    document.getElementById('cf-slug').value         = d.title ? d.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') : '';
    document.getElementById('cf-description').value  = d.description;
    document.getElementById('cf-duration').value     = d.duration;
    document.getElementById('cf-cert-subtitle').value= d.certSubtitle;
    document.getElementById('cf-type').value         = d.type;
    document.getElementById('cf-pass-score').value   = d.passScore;

    examQCounter = 0;
    pageCounter  = 0;
    document.getElementById('exam-questions-list').innerHTML =
        '<div id="exam-questions-empty" class="empty-state-box" style="display:flex;"><i class="fa-solid fa-circle-question"></i><p>No questions yet.<br>Click <strong>"Add Question"</strong> to build the exam.</p></div>';
    document.getElementById('content-pages-list').innerHTML =
        '<div id="content-pages-empty" class="empty-state-box" style="display:flex;"><i class="fa-solid fa-file-circle-plus"></i><p>No pages yet.<br>Click <strong>"Add Page"</strong> to start building your course content.</p></div>';

    (d.contentPages || []).forEach(p => addContentPage(p));
    (d.examQuestions || []).forEach(q => addExamQuestion(q));

    onCourseTypeChange();
    updateCertPreview();

    // Scroll to the Basic Info tab and hide templates
    document.getElementById('templates-section').style.display = 'none';
    showEditorTab('info');
}

function autoFillSlug() {
    const title    = document.getElementById('cf-title').value;
    const slugInput= document.getElementById('cf-slug');
    if (!editingCourseId) {
        slugInput.value = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    updateCertPreview();
}

function updateVideoPreview() {
    const raw = document.getElementById('cf-video').value.trim();
    const container = document.getElementById('video-preview-container');
    const frame     = document.getElementById('video-preview-frame');
    if (!raw) { container.style.display = 'none'; return; }

    let embedUrl = raw;
    // Convert watch URL to embed URL
    const watchMatch = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (watchMatch) embedUrl = `https://www.youtube.com/embed/${watchMatch[1]}`;

    frame.src = embedUrl;
    container.style.display = 'block';
}

function updateCertPreview() {
    const title    = document.getElementById('cf-cert-title')?.value.trim()   || document.getElementById('cf-title')?.value.trim() || 'Course Title';
    const subtitle = document.getElementById('cf-cert-subtitle')?.value.trim() || 'Certificate Subtitle';
    const titleEl  = document.getElementById('cert-preview-title');
    const subEl    = document.getElementById('cert-preview-subtitle');
    if (titleEl) titleEl.textContent = title    || 'Course Title';
    if (subEl)   subEl.textContent   = subtitle || 'Certificate Subtitle';
}

function updateContentPageCount() {
    const list  = document.getElementById('content-pages-list');
    const count = list ? list.querySelectorAll('.content-page-block').length : 0;
    const el    = document.getElementById('content-page-count');
    if (el) el.textContent = count === 1 ? '1 page' : `${count} pages`;
}

function updateExamQuestionCount() {
    const list  = document.getElementById('exam-questions-list');
    const count = list ? list.querySelectorAll('.exam-question-block').length : 0;
    const el    = document.getElementById('exam-question-count');
    if (el) el.textContent = count === 1 ? '1 question' : `${count} questions`;
}

function togglePageBlock(id) {
    const block = document.getElementById(id);
    if (!block) return;
    const body = block.querySelector('.cpb-body');
    const icon = block.querySelector('.cpb-toggle-icon');
    if (!body) return;
    const isCollapsed = body.style.display === 'none';
    body.style.display    = isCollapsed ? '' : 'none';
    if (icon) icon.className = isCollapsed ? 'fa-solid fa-chevron-up cpb-toggle-icon' : 'fa-solid fa-chevron-down cpb-toggle-icon';
}

function setCorrectAnswer(qBlockId, letter) {
    const block = document.getElementById(qBlockId);
    if (!block) return;
    // Update hidden input
    block.querySelector('[data-correct-input]').value = letter;
    // Update visual highlight
    block.querySelectorAll('.eq-option-row').forEach(row => {
        const isCorrect = row.dataset.letter === letter;
        row.classList.toggle('eq-option-correct', isCorrect);
        row.querySelector('.eq-letter-badge').classList.toggle('eq-letter-correct', isCorrect);
        const btn = row.querySelector('.eq-correct-btn');
        if (btn) btn.classList.toggle('eq-correct-active', isCorrect);
    });
}

function rteCmd(pageId, cmd, value) {
    const editor = document.querySelector(`#page-${pageId} .rte-editor`);
    if (!editor) return;
    editor.focus();
    document.execCommand(cmd, false, value || null);
}

function onCourseTypeChange() {
    const type = document.getElementById('cf-type').value;
    const slidesEl   = document.getElementById('slides-config-section');
    const noticeEl   = document.getElementById('content-type-notice');
    const builderEl  = document.getElementById('content-pages-builder');
    if (slidesEl)  slidesEl.style.display  = (type === 'slides')  ? 'block' : 'none';
    if (noticeEl)  noticeEl.style.display  = (type === 'slides')  ? 'block' : 'none';
    if (builderEl) builderEl.style.display = (type === 'content') ? 'block' : 'none';
}

function addContentPage(data) {
    const list     = document.getElementById('content-pages-list');
    const emptyBox = document.getElementById('content-pages-empty');
    if (emptyBox) emptyBox.style.display = 'none';

    pageCounter++;
    const pid = pageCounter;
    const id  = `page-${pid}`;
    const div = document.createElement('div');
    div.className = 'content-page-block';
    div.id = id;

    div.innerHTML = `
        <div class="cpb-header" onclick="togglePageBlock('${id}')">
            <span class="cpb-page-num">Page ${pid}</span>
            <span class="cpb-page-title-preview">${escapeHtml(data?.title || 'Untitled Page')}</span>
            <div style="display:flex;gap:8px;margin-left:auto;" onclick="event.stopPropagation()">
                <button type="button" class="btn btn-danger btn-sm" onclick="removePage('${id}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
                <i class="fa-solid fa-chevron-up cpb-toggle-icon" style="align-self:center;cursor:pointer;color:var(--text-muted);" onclick="togglePageBlock('${id}')"></i>
            </div>
        </div>
        <div class="cpb-body">
            <div class="form-group" style="margin-bottom:1rem;">
                <label>Page Title</label>
                <input type="text" class="page-title-input" data-pageid="${id}"
                    value="${escapeHtml(data?.title || '')}"
                    placeholder="e.g., Introduction to the Topic"
                    oninput="this.closest('.content-page-block').querySelector('.cpb-page-title-preview').textContent = this.value || 'Untitled Page'">
            </div>
            <div class="form-group" style="margin-bottom:1rem;">
                <label>Page Content</label>
                <div class="rte-toolbar">
                    <button type="button" title="Bold"        onclick="rteCmd(${pid},'bold')"><b>B</b></button>
                    <button type="button" title="Italic"      onclick="rteCmd(${pid},'italic')"><i>I</i></button>
                    <button type="button" title="Underline"   onclick="rteCmd(${pid},'underline')"><u>U</u></button>
                    <span class="rte-sep"></span>
                    <button type="button" title="Heading"     onclick="rteCmd(${pid},'formatBlock','H3')">H3</button>
                    <button type="button" title="Bullet list" onclick="rteCmd(${pid},'insertUnorderedList')"><i class="fa-solid fa-list-ul"></i></button>
                    <button type="button" title="Numbered list" onclick="rteCmd(${pid},'insertOrderedList')"><i class="fa-solid fa-list-ol"></i></button>
                    <span class="rte-sep"></span>
                    <button type="button" title="Clear formatting" onclick="rteCmd(${pid},'removeFormat')" style="font-size:0.75rem;padding:2px 7px;"><i class="fa-solid fa-eraser"></i></button>
                </div>
                <div class="rte-editor" contenteditable="true" data-pageid="${id}">${data?.content || ''}</div>
            </div>
            <div class="form-group" style="margin:0;">
                <label>Image URL <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
                <input type="text" class="page-image-input" data-pageid="${id}"
                    value="${escapeHtml(data?.imageUrl || '')}"
                    placeholder="https://... or assets/resources/image.jpg">
            </div>
        </div>`;

    list.appendChild(div);
    updateContentPageCount();
}

function removePage(id) {
    document.getElementById(id)?.remove();
    updateContentPageCount();
    const list = document.getElementById('content-pages-list');
    if (list && list.querySelectorAll('.content-page-block').length === 0) {
        document.getElementById('content-pages-empty').style.display = 'flex';
    }
}

function addExamQuestion(data) {
    const list     = document.getElementById('exam-questions-list');
    const emptyBox = document.getElementById('exam-questions-empty');
    if (emptyBox) emptyBox.style.display = 'none';

    examQCounter++;
    const qNum = examQCounter;
    const id   = `eq-${qNum}`;
    const div  = document.createElement('div');
    div.className = 'exam-question-block';
    div.id = id;

    const opts     = ['A', 'B', 'C', 'D'];
    const existOpts = data?.options || [];
    const correct  = data?.correct || 'A';

    div.innerHTML = `
        <div class="eqb-header">
            <span class="eq-number-badge">Q${qNum}</span>
            <span style="font-size:0.82rem;color:var(--text-muted);margin-left:4px;">Click <i class="fa-solid fa-check" style="color:#059669"></i> on an option to mark it correct</span>
            <button type="button" class="btn btn-danger btn-sm" style="margin-left:auto;" onclick="removeQuestion('${id}')">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
        <div class="eqb-body">
            <div class="form-group" style="margin-bottom:1rem;">
                <label>Question Text</label>
                <textarea class="eq-text" data-qid="${id}" rows="2" placeholder="Type the question here…">${escapeHtml(data?.text || '')}</textarea>
            </div>
            <input type="hidden" class="eq-correct-hidden" data-correct-input value="${correct}">
            <div class="eq-options-grid">
                ${opts.map((opt, i) => {
                    const isCorrect = opt === correct;
                    return `
                    <div class="eq-option-row ${isCorrect ? 'eq-option-correct' : ''}" data-letter="${opt}">
                        <span class="eq-letter-badge ${isCorrect ? 'eq-letter-correct' : ''}">${opt}</span>
                        <input type="text" class="eq-option-input" data-letter="${opt}"
                            value="${escapeHtml(existOpts[i]?.text || '')}"
                            placeholder="Option ${opt}…">
                        <button type="button" class="eq-correct-btn ${isCorrect ? 'eq-correct-active' : ''}"
                            title="Mark as correct answer"
                            onclick="setCorrectAnswer('${id}', '${opt}')">
                            <i class="fa-solid fa-check"></i>
                        </button>
                    </div>`;
                }).join('')}
            </div>
        </div>`;

    list.appendChild(div);
    updateExamQuestionCount();
}

function removeQuestion(id) {
    document.getElementById(id)?.remove();
    updateExamQuestionCount();
    const list = document.getElementById('exam-questions-list');
    if (list && list.querySelectorAll('.exam-question-block').length === 0) {
        document.getElementById('exam-questions-empty').style.display = 'flex';
    }
}

function removeElement(id) {
    document.getElementById(id)?.remove();
}

function saveCourse(forceStatus) {
    const id          = document.getElementById('cf-id').value;
    const title       = document.getElementById('cf-title').value.trim();
    const slug        = document.getElementById('cf-slug').value.trim().toLowerCase();
    const description = document.getElementById('cf-description').value.trim();
    const duration    = document.getElementById('cf-duration').value.trim();
    const type        = document.getElementById('cf-type').value;
    const passScore   = parseInt(document.getElementById('cf-pass-score').value) || 80;
    const videoUrl    = normalizeVideoUrl(document.getElementById('cf-video').value.trim());
    const certTitle   = document.getElementById('cf-cert-title').value.trim() || title;
    const certSubtitle= document.getElementById('cf-cert-subtitle').value.trim();

    if (!title || !slug) { alert('Please fill in the Course Title and URL Key (Basic Info tab).'); return; }
    if (slug === 'anaphylaxis' && !id) { alert('The slug "anaphylaxis" is reserved for the built-in course.'); return; }

    const existing = allCourses.find(c => c.slug === slug && c.courseId !== id);
    if (existing) { alert(`The URL key "${slug}" is already in use. Please choose a different one.`); return; }

    // Collect content pages from new RTE builder
    const contentPages = [];
    document.querySelectorAll('#content-pages-list .content-page-block').forEach(block => {
        const titleInp   = block.querySelector('.page-title-input');
        const rteEditor  = block.querySelector('.rte-editor');
        const imageInp   = block.querySelector('.page-image-input');
        contentPages.push({
            title:    titleInp  ? titleInp.value.trim()  : '',
            content:  rteEditor ? rteEditor.innerHTML    : '',
            imageUrl: imageInp  ? imageInp.value.trim()  : ''
        });
    });

    // Collect exam questions from new visual builder
    const examQuestions = [];
    document.querySelectorAll('#exam-questions-list .exam-question-block').forEach(block => {
        const textArea  = block.querySelector('.eq-text');
        const correctEl = block.querySelector('[data-correct-input]');
        const text      = textArea ? textArea.value.trim() : '';
        if (!text) return;
        examQuestions.push({
            id:      examQuestions.length + 1,
            text,
            options: ['A', 'B', 'C', 'D'].map(opt => {
                const inp = block.querySelector(`.eq-option-input[data-letter="${opt}"]`);
                return { key: opt, text: inp ? inp.value.trim() : '' };
            }),
            correct: correctEl ? correctEl.value : 'A'
        });
    });

    const courses    = getCourses();
    const prevCourse = courses.find(c => c.courseId === id);

    // Determine status
    let status;
    if (forceStatus) {
        status = forceStatus;
    } else if (prevCourse) {
        status = prevCourse.status; // preserve existing status when saving as draft
    } else {
        status = 'draft';
    }

    const course = {
        courseId:     id || generateId(),
        slug,
        title,
        description,
        duration,
        type,
        passScore,
        passThreshold: passScore,
        videoUrl,
        certTitle,
        certSubtitle,
        contentPages,
        examQuestions,
        status,
        createdAt:    prevCourse?.createdAt || todayStr(),
        updatedAt:    todayStr()
    };

    if (type === 'slides') {
        course.slidesPath  = document.getElementById('cf-slides-path').value.trim();
        course.totalSlides = parseInt(document.getElementById('cf-total-slides').value) || 0;
        course.audioPath   = document.getElementById('cf-audio-path').value.trim();
        course.audioCount  = parseInt(document.getElementById('cf-audio-count').value) || 0;
    }

    const idx = courses.findIndex(c => c.courseId === course.courseId);
    if (idx >= 0) { courses[idx] = course; } else { courses.push(course); }

    saveCourses(courses.filter(c => c.slug !== 'anaphylaxis' || c.type !== 'legacy'));
    allCourses = getCourses();
    syncCourseToGAS(course);
    renderCoursesTable();
    renderOverview();
    populateCourseFilter();

    const statusLabel = status === 'published' ? 'published' : 'saved as draft';
    showToast(`"${title}" ${statusLabel} successfully!`, 'success');

    if (status === 'published') {
        closeCourseEditor();
        openShareLinkModal(slug);
    } else {
        closeCourseEditor();
    }
}

function normalizeVideoUrl(raw) {
    if (!raw) return '';
    const m = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) return `https://www.youtube.com/embed/${m[1]}`;
    return raw;
}

function publishCourse(courseId) {
    const courses = getCourses();
    const c = courses.find(c => c.courseId === courseId);
    if (!c) return;
    if (c.type === 'legacy') { alert('The built-in Anaphylaxis course is always published.'); return; }
    c.status = 'published';
    saveCourses(courses.filter(c => c.slug !== 'anaphylaxis' || c.type !== 'legacy'));
    allCourses = getCourses();
    syncCourseToGAS(c);
    renderCoursesTable();
    renderOverview();
    openShareLinkModal(c.slug);
}

function deleteCourse(courseId) {
    const c = allCourses.find(c => c.courseId === courseId);
    if (!c) return;
    if (c.type === 'legacy') { alert('The built-in Anaphylaxis course cannot be deleted.'); return; }
    if (!confirm(`Delete course "${c.title}"? This cannot be undone. Participant records will remain.`)) return;
    const courses = getCourses().filter(cc => cc.courseId !== courseId && cc.slug !== 'anaphylaxis');
    saveCourses(courses);
    allCourses = getCourses();
    renderCoursesTable();
    renderOverview();
}

// ===================================================================
// SHARE LINK MODAL
// ===================================================================
function openShareLinkModal(slug) {
    const link = buildCourseLink(slug);
    document.getElementById('share-link-input').value = link;
    document.getElementById('link-modal').style.display = 'flex';
    document.getElementById('copy-link-btn').innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
}

function closeLinkModal() {
    document.getElementById('link-modal').style.display = 'none';
}

function copyShareLink() {
    const input = document.getElementById('share-link-input');
    input.select();
    input.setSelectionRange(0, 99999);
    try {
        navigator.clipboard.writeText(input.value).then(() => {
            document.getElementById('copy-link-btn').innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            setTimeout(() => {
                document.getElementById('copy-link-btn').innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
            }, 2500);
        });
    } catch(e) {
        document.execCommand('copy');
        document.getElementById('copy-link-btn').innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    }
}

function buildCourseLink(slug) {
    const base = window.location.href.split('admin.html')[0];
    return `${base}index.html?course=${encodeURIComponent(slug)}`;
}

function buildCertLinkFromLog(log) {
    if (!log.certId || log.certId === 'N/A' || log.status !== 'Passed') return '';
    const base = window.location.href.split('admin.html')[0];
    const params = new URLSearchParams({
        certId: log.certId,
        name:   log.name,
        date:   log.date || '',
        course: log.courseSlug || 'anaphylaxis'
    });
    return `${base}index.html?${params.toString()}`;
}

// ===================================================================
// GOOGLE SHEETS SYNC
// ===================================================================
function initGasConfig() {
    const saved = localStorage.getItem(GAS_URL_KEY);
    gasWebhookUrl = saved || DEFAULT_GAS_URL;
    const input  = document.getElementById('gas-url');
    if (input) input.value = gasWebhookUrl;
    updateGasStatus(!!gasWebhookUrl, gasWebhookUrl ? 'Connected' : 'Not Configured');
}

function initSettingsGasUrl() {
    const input = document.getElementById('settings-gas-url');
    if (input) input.value = gasWebhookUrl || '';
    if (gasWebhookUrl) {
        document.getElementById('settings-gas-status').textContent = 'Google Sheets sync is configured.';
    }
}

function updateGasStatus(connected, message) {
    const icon = document.getElementById('gas-status-icon');
    const text = document.getElementById('gas-status-text');
    if (icon) {
        icon.style.backgroundColor = connected ? '#10b981' : '#f59e0b';
        icon.style.boxShadow       = connected ? '0 0 8px #10b981' : '0 0 8px #f59e0b';
    }
    if (text) text.textContent = message;
}

function saveGasConfig() {
    const url = document.getElementById('gas-url')?.value.trim();
    if (!url) { alert('Please enter a GAS URL.'); return; }
    localStorage.setItem(GAS_URL_KEY, url);
    gasWebhookUrl = url;
    updateGasStatus(true, 'Connected');
    alert('Google Sheets URL saved!');
}

function saveGasConfigFromSettings() {
    const url = document.getElementById('settings-gas-url')?.value.trim();
    if (!url) { alert('Please enter a GAS URL.'); return; }
    localStorage.setItem(GAS_URL_KEY, url);
    gasWebhookUrl = url;
    updateGasStatus(true, 'Connected');
    document.getElementById('settings-gas-status').textContent = 'URL saved. Google Sheets sync is now active.';
    document.getElementById('gas-url').value = url;
}

function testGasConnection() {
    const url = document.getElementById('settings-gas-url')?.value.trim();
    if (!url) { alert('Enter a GAS URL first.'); return; }
    document.getElementById('settings-gas-status').textContent = 'Testing connection…';
    fetch(url, { redirect: 'follow', credentials: 'omit' })
        .then(r => r.json())
        .then(j => {
            document.getElementById('settings-gas-status').textContent = `✅ Connected — Response: ${JSON.stringify(j).substring(0, 80)}`;
        })
        .catch(err => {
            document.getElementById('settings-gas-status').textContent = `❌ Connection failed: ${err.message}`;
        });
}

function disconnectGas() {
    if (!confirm('Remove Google Sheets sync?')) return;
    localStorage.removeItem(GAS_URL_KEY);
    gasWebhookUrl = '';
    document.getElementById('gas-url').value = '';
    updateGasStatus(false, 'Not Configured');
}

function syncCourseToGAS(course) {
    if (!gasWebhookUrl) return;
    fetch(gasWebhookUrl, {
        method: 'POST',
        mode:   'no-cors',
        body:   JSON.stringify({ action: 'syncCourse', course })
    }).catch(err => console.warn('GAS course sync error:', err));
}

function fetchGasData() {
    if (!gasWebhookUrl) return;
    updateGasStatus(true, 'Syncing…');
    fetch(`${gasWebhookUrl}?action=getData`, { redirect: 'follow', credentials: 'omit' })
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(response => {
            if (response.success && Array.isArray(response.logs)) {
                // Merge GAS data with locally known participants
                const gasNames = new Set(response.logs.map(l => l.name + '|' + (l.certId || '')));
                response.logs.forEach(l => {
                    const key = l.name + '|' + (l.certId || '');
                    const exists = allParticipants.find(p => p.name + '|' + (p.certId || '') === key);
                    if (!exists) {
                        allParticipants.push({
                            name:       l.name       || '',
                            course:     'Anaphylaxis Recognition & Management',
                            courseSlug: 'anaphylaxis',
                            department: l.department || '—',
                            jobTitle:   l.jobTitle   || '—',
                            score:      l.score      || '—',
                            status:     l.status     || '—',
                            date:       l.date       || '—',
                            rating:     l.rating     || 'N/A',
                            feedback:   l.feedback   || 'N/A',
                            certId:     l.certId     || 'N/A'
                        });
                    }
                });
                const count = allParticipants.length;
                updateGasStatus(true, `Connected — ${count} record${count !== 1 ? 's' : ''}`);
                filterParticipantsTable();
                renderOverview();
            } else {
                updateGasStatus(true, 'Connected — 0 records');
            }
        })
        .catch(err => {
            console.error('GAS fetch failed:', err);
            updateGasStatus(true, 'Connected (read failed)');
        });
}

// ===================================================================
// EXPORT
// ===================================================================
function getLogsDataArray() {
    return allParticipants;
}

function exportToExcel() {
    const logs = getLogsDataArray();
    if (logs.length === 0) { alert('No data to export.'); return; }
    const data = logs.map(l => ({
        'Name': l.name, 'Course': l.course, 'Department': l.department,
        'Job Title': l.jobTitle, 'Score': l.score, 'Status': l.status,
        'Date': l.date, 'Certificate ID': l.certId,
        'Eval Rating': l.rating, 'Comments': l.feedback
    }));
    try {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'All Participants');
        XLSX.writeFile(wb, 'Training_Portal_Logs.xlsx');
    } catch(e) {
        exportToCSV();
    }
}

function exportToCSV() {
    const logs = getLogsDataArray();
    if (logs.length === 0) { alert('No data to export.'); return; }
    let csv = '﻿"Name","Course","Department","Job Title","Score","Status","Date","Certificate ID","Eval Rating","Comments"\n';
    logs.forEach(l => {
        const c = v => (v || 'N/A').replace(/"/g, '""');
        csv += `"${c(l.name)}","${c(l.course)}","${c(l.department)}","${c(l.jobTitle)}","${c(l.score)}","${c(l.status)}","${c(l.date)}","${c(l.certId)}","${c(l.rating)}","${c(l.feedback)}"\n`;
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'Training_Portal_Logs.csv';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ===================================================================
// SETTINGS
// ===================================================================
function renderSettingsAdminList() {
    const el = document.getElementById('settings-admin-list');
    if (!el) return;
    el.innerHTML = ADMIN_CREDENTIALS.map(c => `
        <div style="display:flex;align-items:center;gap:10px;padding:0.6rem 1rem;background:rgba(17,94,89,0.05);border-radius:8px;font-size:0.88rem;">
            <i class="fa-solid fa-user-shield" style="color:var(--primary-color);"></i>
            <div>
                <strong>${escapeHtml(c.display)}</strong>
                <span style="color:var(--text-muted);margin-left:8px;">${escapeHtml(c.email)}</span>
            </div>
        </div>`).join('');
}

function clearAllLogs() {
    if (!confirm('Delete ALL local data permanently? Remote Google Sheets records are not affected.')) return;
    localStorage.removeItem(ANAPHYLAXIS_LOGS_KEY);
    localStorage.removeItem(MC_COMPLETIONS_KEY);
    localStorage.removeItem(ADMIN_LOGIN_LOG_KEY);
    allParticipants = [];
    renderOverview();
    filterParticipantsTable();
    alert('All local data cleared.');
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

function generateId() {
    return 'crs-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

function showToast(message, type) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;bottom:2rem;right:2rem;z-index:9999;display:flex;flex-direction:column;gap:10px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const color  = type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : '#0891b2';
    toast.style.cssText = `background:white;border-left:4px solid ${color};padding:1rem 1.4rem;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.12);font-size:0.9rem;font-weight:600;max-width:360px;animation:slideInRight 0.3s ease;`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}" style="color:${color};margin-right:8px;"></i>${escapeHtml(message)}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; setTimeout(() => toast.remove(), 400); }, 3500);
}
