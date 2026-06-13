// ---- Multi-Course Routing ----------------------------------------
// Read ?course= URL param. Default: 'anaphylaxis' (legacy behavior).
// Dynamic (non-legacy) courses load their config from localStorage.
const MC_COMPLETIONS_KEY = 'mc_all_completions';
const MC_COURSES_KEY     = 'mc_courses';

const _urlParams_    = new URLSearchParams(window.location.search);
const currentCourseSlug = (_urlParams_.get('course') || 'anaphylaxis').toLowerCase();

// Load dynamic course config (for non-anaphylaxis courses).
// For 'anaphylaxis' / 'legacy' type, this stays null and existing hardcoded logic runs unchanged.
let dynamicCourseConfig = null;
if (currentCourseSlug !== 'anaphylaxis') {
    try {
        const raw = localStorage.getItem(MC_COURSES_KEY);
        if (raw) {
            const courses = JSON.parse(raw);
            dynamicCourseConfig = courses.find(c => c.slug === currentCourseSlug) || null;
        }
    } catch(e) {}
}

// State Management
let currentView = 'register';
let studentData = {
    name: '',
    department: '',
    jobTitle: '',
    password: '',
    score: null,
    status: '',
    certId: '',
    dateCompleted: '',
    rating: null,
    feedback: '',
    // Supabase ID representation
    id: null
};

// Supabase Database Connection
let supabaseClient = null;
let useSupabase = false;
const CONFIG_KEY_URL = 'anaphylaxis_supabase_url';
const CONFIG_KEY_KEY = 'anaphylaxis_supabase_key';
const CONFIG_KEY_GAS = 'anaphylaxis_gas_url';
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzJFbq1qoQZD6ERUyexNi438u0gQmw2DyrSN0LQau5dUdvne1tFSBIh-XQsVQyyKyLUhQ/exec';
let gasWebhookUrl = DEFAULT_GAS_URL;

// Activity Completion States
let activityDragDone = false;
let activityMcqDone = false;
let activityOrderDone = false;

// Course Slides Configuration
const totalSlides = 24;
let currentSlide = 1;
let viewedSlides = new Set();
let audioPlayer = new Audio();
let isMuted = false;
let isAudioPlaying = false;

// Audio Mapping: Slide i -> media[i].m4a for 1 <= i <= 23. Slide 24 has no audio.
function getAudioPath(slideNum) {
    if (slideNum >= 1 && slideNum <= 23) {
        return `assets/audio/media${slideNum}.m4a`;
    }
    return null; // Slide 24
}

// Exam Questions Data
const examQuestions = [
    {
        id: 1,
        text: "A patient receiving the first infusion of paclitaxel suddenly develops flushing, itching, wheezing, and shortness of breath within 10 minutes of starting the infusion. What is the priority first action?",
        options: [
            { key: "A", text: "Give antihistamine and continue infusion slowly" },
            { key: "B", text: "Stop the infusion and assess ABCDE" },
            { key: "C", text: "Wait to see if symptoms improve" },
            { key: "D", text: "Send the patient for chest X-ray" }
        ],
        correct: "B"
    },
    {
        id: 2,
        text: "A patient receiving nivolumab develops fever, chills, rash, hypotension, and dyspnea shortly after infusion. Which statement is MOST correct?",
        options: [
            { key: "A", text: "This is always a mild infusion reaction" },
            { key: "B", text: "Epinephrine should be delayed until rash appears" },
            { key: "C", text: "Immunotherapy reactions may mimic anaphylaxis and require rapid assessment" },
            { key: "D", text: "Oxygen is contraindicated in immunotherapy reactions" }
        ],
        correct: "C"
    },
    {
        id: 3,
        text: "A patient receives IV ceftriaxone and after a few minutes develops throat tightness, hoarse voice, hypotension, and urticaria. What is the first-line medication?",
        options: [
            { key: "A", text: "Hydrocortisone IV" },
            { key: "B", text: "Diphenhydramine IV" },
            { key: "C", text: "Epinephrine IM" },
            { key: "D", text: "Salbutamol nebulizer only" }
        ],
        correct: "C"
    },
    {
        id: 4,
        text: "During CT contrast administration, a patient develops nausea, flushing, wheezing, and low oxygen saturation. Which finding indicates a severe reaction requiring immediate emergency management?",
        options: [
            { key: "A", text: "Warm sensation only" },
            { key: "B", text: "Mild nausea" },
            { key: "C", text: "Wheezing with hypoxia" },
            { key: "D", text: "Anxiety before procedure" }
        ],
        correct: "C"
    },
    {
        id: 5,
        text: "A patient with chemotherapy-induced anaphylaxis received two doses of IM epinephrine and IV fluids but remains hypotensive and hypoxic. What is the NEXT best step?",
        options: [
            { key: "A", text: "Discharge the patient after observation" },
            { key: "B", text: "Start oral antihistamines only" },
            { key: "C", text: "Call critical care and consider epinephrine infusion" },
            { key: "D", text: "Restart chemotherapy slowly" }
        ],
        correct: "C"
    }
];

// Initialize Web App
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Supabase configuration
    initSupabase();
    initGasConfig();

    // Set initial view state — detect direct certificate link from query params
    const _qCertId = _urlParams_.get('certId');
    const _qName   = _urlParams_.get('name');
    const _qDate   = _urlParams_.get('date');

    if (_qCertId && _qName) {
        // Direct certificate link
        studentData.name          = _qName;
        studentData.certId        = _qCertId;
        studentData.dateCompleted = _qDate || '';
        document.getElementById('cert-participant-name').innerText = _qName;
        document.getElementById('cert-issue-date').innerText       = _qDate || '—';
        document.getElementById('cert-unique-id').innerText        = _qCertId;

        // Apply dynamic course cert text if this cert belongs to a dynamic course
        if (dynamicCourseConfig) {
            const titleEl = document.querySelector('.cert-course-title');
            const metaEl  = document.querySelector('.cert-course-meta');
            if (titleEl) titleEl.textContent = dynamicCourseConfig.certTitle   || dynamicCourseConfig.title   || '';
            if (metaEl)  metaEl.textContent  = dynamicCourseConfig.certSubtitle || '';
        }
        switchView('certificate');
    } else if (currentCourseSlug !== 'anaphylaxis' && !dynamicCourseConfig) {
        // Unknown course slug — show friendly error
        document.getElementById('view-register').innerHTML = `
            <div class="card glassmorphism animate-fade-in" style="max-width:480px;margin:0 auto;text-align:center;padding:2.5rem;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:3rem;color:#f59e0b;margin-bottom:1rem;"></i>
                <h2 style="color:#b45309;margin-bottom:0.5rem;">Course Not Found</h2>
                <p style="color:var(--text-muted);">The course link you opened (<strong>${currentCourseSlug}</strong>) does not exist or has been removed.</p>
                <p style="color:var(--text-muted);margin-top:0.5rem;">Please contact your administrator for a valid course link.</p>
            </div>`;
        switchView('register');
    } else {
        // Normal course flow
        // Update header title for dynamic courses
        if (dynamicCourseConfig) {
            const logoH1 = document.querySelector('.logo-text h1');
            if (logoH1) logoH1.textContent = dynamicCourseConfig.title || logoH1.textContent;
        }
        switchView('register');
    }
    
    // Set up audio player event listeners
    audioPlayer.addEventListener('timeupdate', updateTimeline);
    audioPlayer.addEventListener('ended', onAudioEnded);
    audioPlayer.addEventListener('loadedmetadata', () => {
        document.getElementById('audio-duration-display').innerText = `0:00 / ${formatTime(audioPlayer.duration)}`;
    });

    // Load dynamic exam questions
    renderExamQuestions();

    // Initialize interactive activity drag and drop
    initDragActivity();

    // Default viewed state for slide 1
    viewedSlides.add(1);
});

// -----------------------------------------
// DATABASE STATUS & CONFIGURATION HANDLERS
// -----------------------------------------
function initSupabase() {
    const savedUrl = localStorage.getItem(CONFIG_KEY_URL);
    const savedKey = localStorage.getItem(CONFIG_KEY_KEY);
    
    // Auto-fill configuration fields if values exist
    const urlInput = document.getElementById('supabase-url');
    const keyInput = document.getElementById('supabase-key');
    if (urlInput && savedUrl) urlInput.value = savedUrl;
    if (keyInput && savedKey) keyInput.value = savedKey;

    if (savedUrl && savedKey && window.supabase) {
        try {
            const { createClient } = window.supabase;
            supabaseClient = createClient(savedUrl, savedKey);
            useSupabase = true;
            updateDbStatus(true, "Connected to Supabase");
            console.log("Supabase Client initialized successfully.");
        } catch (e) {
            console.error("Supabase client connection failed:", e);
            useSupabase = false;
            updateDbStatus(false, "Connection Error (Fallback Active)");
        }
    } else {
        useSupabase = false;
        updateDbStatus(false, "Local Storage Fallback");
    }
}

function updateDbStatus(connected, message) {
    const icon = document.getElementById('db-status-icon');
    const text = document.getElementById('db-status-text');
    if (icon) {
        icon.style.backgroundColor = connected ? '#10b981' : '#dc2626';
        icon.style.boxShadow = connected ? '0 0 8px #10b981' : '0 0 8px #dc2626';
    }
    if (text) {
        text.textContent = message;
    }
}

function saveDatabaseConfig() {
    const url = document.getElementById('supabase-url').value.trim();
    const key = document.getElementById('supabase-key').value.trim();

    if (!url || !key) {
        alert("Please provide both Supabase URL and Anon Key.");
        return;
    }

    localStorage.setItem(CONFIG_KEY_URL, url);
    localStorage.setItem(CONFIG_KEY_KEY, key);

    initSupabase();

    if (useSupabase) {
        alert("Database connected successfully! Real-time sync enabled.");
        if (currentView === 'admin') {
            loadAdminDashboard();
        }
    } else {
        alert("Could not connect to Supabase. Check key format and network/console details.");
    }
}

function disconnectDatabase() {
    if (confirm("Disconnect from Supabase? Student logs will be loaded from local browser cache instead.")) {
        localStorage.removeItem(CONFIG_KEY_URL);
        localStorage.removeItem(CONFIG_KEY_KEY);

        const urlInput = document.getElementById('supabase-url');
        const keyInput = document.getElementById('supabase-key');
        if (urlInput) urlInput.value = '';
        if (keyInput) keyInput.value = '';

        supabaseClient = null;
        useSupabase = false;
        updateDbStatus(false, "Local Storage Fallback");
        
        alert("Successfully disconnected from Supabase Cloud.");
        if (currentView === 'admin') {
            loadAdminDashboard();
        }
    }
}

// -----------------------------------------
// GOOGLE SHEETS SYNC MODULE
// -----------------------------------------
function initGasConfig() {
    const saved = localStorage.getItem(CONFIG_KEY_GAS);
    const active = saved || DEFAULT_GAS_URL;
    const input = document.getElementById('gas-url');
    if (input) input.value = active;
    gasWebhookUrl = active;
    updateGasStatus(true, 'Connected');
}

function updateGasStatus(connected, message) {
    const icon = document.getElementById('gas-status-icon');
    const text = document.getElementById('gas-status-text');
    if (icon) {
        icon.style.backgroundColor = connected ? '#10b981' : '#f59e0b';
        icon.style.boxShadow = connected ? '0 0 8px #10b981' : '0 0 8px #f59e0b';
    }
    if (text) text.textContent = message;
}

function saveGasConfig() {
    const url = document.getElementById('gas-url').value.trim();
    if (!url) {
        alert('Please enter the Google Apps Script Web App URL.');
        return;
    }
    localStorage.setItem(CONFIG_KEY_GAS, url);
    gasWebhookUrl = url;
    updateGasStatus(true, 'Connected');
    alert('Google Sheets sync URL saved successfully!');
}

function disconnectGas() {
    if (confirm('Remove Google Sheets sync URL? Data will no longer be synced automatically.')) {
        localStorage.removeItem(CONFIG_KEY_GAS);
        gasWebhookUrl = '';
        const input = document.getElementById('gas-url');
        if (input) input.value = '';
        updateGasStatus(false, 'Not Configured');
    }
}

function syncToGoogleSheet(data) {
    if (!gasWebhookUrl) return;
    fetch(gasWebhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify(data)
    }).catch(err => console.warn('Google Sheets sync error:', err));
}

function fetchGasData() {
    if (!gasWebhookUrl) return;
    updateGasStatus(true, 'Syncing...');
    fetch(`${gasWebhookUrl}?action=getData`, { redirect: 'follow', credentials: 'omit' })
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(response => {
            if (response.success && Array.isArray(response.logs)) {
                allLogs = response.logs;
                renderStatsCards();
                renderJobBreakdown();
                renderScoreDistribution();
                renderTable(allLogs);
                const count = allLogs.length;
                updateGasStatus(true, `Connected — ${count} record${count !== 1 ? 's' : ''}`);
            } else {
                updateGasStatus(true, 'Connected — 0 records');
            }
        })
        .catch(err => {
            console.error('Google Sheets fetch failed:', err);
            updateGasStatus(true, 'Connected (read failed)');
        });
}

// View Navigation State Machine
function switchView(viewName) {
    currentView = viewName;
    
    // Hide all views
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show active view
    const activeSection = document.getElementById(`view-${viewName}`);
    if (activeSection) {
        activeSection.classList.add('active');
    }

    // Update header step highlight
    document.querySelectorAll('.step-indicator .step').forEach(step => {
        step.classList.remove('active', 'completed');
    });

    const steps = ['register', 'presentation', 'video', 'activity', 'exam', 'evaluation', 'certificate'];
    const currentIndex = steps.indexOf(viewName);

    for (let i = 0; i < steps.length; i++) {
        const stepEl = document.getElementById(`step-${steps[i]}`);
        if (stepEl) {
            if (i < currentIndex) {
                stepEl.classList.add('completed');
            } else if (i === currentIndex) {
                stepEl.classList.add('active');
            }
        }
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Show/hide logout button in header
    const logoutBtn = document.getElementById('header-logout-btn');
    if (logoutBtn) {
        if (viewName === 'register' || viewName === 'admin') {
            logoutBtn.style.display = 'none';
        } else {
            logoutBtn.style.display = 'block';
        }
    }

    // Handle view-specific initializations
    if (viewName !== 'presentation') {
        pauseAudio();
    }

    // Stop YouTube video when leaving the video section
    const defaultVideoSrc = (dynamicCourseConfig && dynamicCourseConfig.videoUrl)
        ? dynamicCourseConfig.videoUrl
        : 'https://www.youtube.com/embed/yJnOgcba-To';
    if (viewName !== 'video') {
        const ytPlayer = document.getElementById('youtube-player');
        if (ytPlayer && ytPlayer.src) {
            if (!ytPlayer.dataset.origSrc) ytPlayer.dataset.origSrc = defaultVideoSrc;
            ytPlayer.src = '';
        }
    } else {
        const ytPlayer = document.getElementById('youtube-player');
        if (ytPlayer) {
            const origSrc = ytPlayer.dataset.origSrc || defaultVideoSrc;
            if (!ytPlayer.src || ytPlayer.src === window.location.href) ytPlayer.src = origSrc;
        }
    }

    // Populate evaluation info fields when entering evaluation
    if (viewName === 'evaluation') {
        const nameEl = document.getElementById('eval-participant-name');
        const dateEl = document.getElementById('eval-date');
        if (nameEl) nameEl.textContent = studentData.name || '—';
        if (dateEl) dateEl.textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }
}

// -----------------------------------------
// REGISTRATION & LOGIN MODULE
// -----------------------------------------
function switchAuthTab(tab) {
    const registerSection = document.getElementById('auth-register-section');
    const loginSection = document.getElementById('auth-login-section');
    const tabs = document.querySelectorAll('.auth-tab');
    
    if (tab === 'register') {
        registerSection.style.display = 'block';
        loginSection.style.display = 'none';
        tabs[0].classList.add('active');
        tabs[0].style.borderBottomColor = 'var(--primary-color)';
        tabs[0].style.color = 'var(--primary-color)';
        tabs[1].classList.remove('active');
        tabs[1].style.borderBottomColor = 'transparent';
        tabs[1].style.color = 'var(--text-muted)';
    } else {
        registerSection.style.display = 'none';
        loginSection.style.display = 'block';
        tabs[0].classList.remove('active');
        tabs[0].style.borderBottomColor = 'transparent';
        tabs[0].style.color = 'var(--text-muted)';
        tabs[1].classList.add('active');
        tabs[1].style.borderBottomColor = 'var(--primary-color)';
        tabs[1].style.color = 'var(--primary-color)';
    }
}

function submitRegistration() {
    const firstName = document.getElementById('reg-first-name').value.trim();
    const middleName = document.getElementById('reg-middle-name').value.trim();
    const lastName = document.getElementById('reg-last-name').value.trim();
    const deptInput = document.getElementById('reg-dept').value.trim();
    const jobTitleInput = document.getElementById('reg-job-title').value;
    const passwordInput = document.getElementById('reg-password').value.trim();

    if (!firstName || !lastName || !deptInput || !jobTitleInput || !passwordInput) {
        alert("Please fill in all required registration fields.");
        return;
    }

    // Combine separate name fields into a single full name (conditionally including middle name)
    const fullName = firstName + (middleName ? ' ' + middleName : '') + ' ' + lastName;

    studentData.name = fullName;
    studentData.department = deptInput;
    studentData.jobTitle = jobTitleInput;
    studentData.password = passwordInput;
    studentData.id = null; // Clear old ID

    // Insert into Supabase if connected
    if (useSupabase) {
        supabaseClient
            .from('participants')
            .insert([{ 
                name: fullName, 
                department: deptInput, 
                job_title: jobTitleInput, 
                password: passwordInput 
            }])
            .select()
            .then(({ data, error }) => {
                if (error) {
                    console.error("Failed to register in Supabase:", error);
                } else if (data && data.length > 0) {
                    studentData.id = data[0].id;
                    console.log("Registered in Supabase. ID:", studentData.id);
                }
            });
    }

    // Transition to Course Presentation
    switchView('presentation');
    if (dynamicCourseConfig && dynamicCourseConfig.type === 'content') {
        loadContentPage(1);
    } else {
        loadSlide(1);
    }
}

function loginUser() {
    const name = document.getElementById('login-name').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (!name || !password) {
        alert("Please enter both your name and password.");
        return;
    }

    if (useSupabase) {
        // Query Supabase for participant and their completions
        supabaseClient
            .from('participants')
            .select(`
                id,
                name,
                department,
                job_title,
                password,
                course_completions (
                    exam_score,
                    status,
                    cert_id,
                    date_completed
                )
            `)
            .ilike('name', name)
            .then(({ data, error }) => {
                if (error) {
                    console.error("Supabase login query error:", error);
                    performLocalLogin(name, password);
                } else if (data && data.length > 0) {
                    // Try to match password
                    const user = data.find(u => u.password === password);
                    if (!user) {
                        alert("Incorrect password for this user name. Please try again.");
                        return;
                    }

                    const completions = user.course_completions || [];
                    const passRecord = completions.find(c => c.status === 'Passed');

                    if (passRecord) {
                        studentData.id = user.id;
                        studentData.name = user.name;
                        studentData.department = user.department;
                        studentData.jobTitle = user.job_title;
                        studentData.password = user.password;
                        studentData.score = passRecord.exam_score + '/5';
                        studentData.dateCompleted = new Date(passRecord.date_completed).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        });
                        studentData.certId = passRecord.cert_id;

                        // Populate Certificate Card directly
                        document.getElementById('cert-participant-name').innerText = studentData.name;
                        document.getElementById('cert-issue-date').innerText = studentData.dateCompleted;
                        document.getElementById('cert-unique-id').innerText = studentData.certId;

                        // Skip immediately to certificate view
                        switchView('certificate');

                        // Clear login fields
                        document.getElementById('login-name').value = '';
                        document.getElementById('login-password').value = '';
                    } else {
                        // Log them in as a participant and take them to the course presentation slides to continue/finish
                        studentData.id = user.id;
                        studentData.name = user.name;
                        studentData.department = user.department;
                        studentData.jobTitle = user.job_title;
                        studentData.password = user.password;
                        
                        alert(`Welcome back, ${studentData.name}! Logging you in to continue the course.`);
                        
                        // Transition to Course Presentation
                        switchView('presentation');
                        loadSlide(1);

                        // Clear login fields
                        document.getElementById('login-name').value = '';
                        document.getElementById('login-password').value = '';
                    }
                } else {
                    // Fall back to local search
                    performLocalLogin(name, password);
                }
            });
    } else {
        performLocalLogin(name, password);
    }
}

function performLocalLogin(name, password) {
    // Search in logs for completed course
    let logs = [];
    try {
        const rawLogs = localStorage.getItem('anaphylaxis_course_logs');
        if (rawLogs) {
            logs = JSON.parse(rawLogs);
        }
    } catch(e) {}

    // Find a passing record for this name
    const userLog = logs.find(log => log.name.toLowerCase() === name.toLowerCase() && log.status === 'Passed');

    if (userLog) {
        if (userLog.password && userLog.password !== password) {
            alert("Incorrect password for this user name. Please try again.");
            return;
        }

        // Reconstruct student data
        studentData.name = userLog.name;
        studentData.department = userLog.department;
        studentData.jobTitle = userLog.jobTitle;
        studentData.password = userLog.password || '';
        studentData.score = userLog.score;
        studentData.dateCompleted = userLog.date;
        studentData.certId = userLog.certId && userLog.certId !== 'N/A' ? userLog.certId : 'AN-' + Math.floor(1000 + Math.random() * 9000) + '-RES';
        
        // Populate Certificate Card directly
        document.getElementById('cert-participant-name').innerText = studentData.name;
        document.getElementById('cert-issue-date').innerText = studentData.dateCompleted;
        document.getElementById('cert-unique-id').innerText = studentData.certId;

        // Skip immediately to certificate view
        switchView('certificate');
        
        // Clear login fields
        document.getElementById('login-name').value = '';
        document.getElementById('login-password').value = '';
    } else {
        alert("No completed certificate found for '" + name + "'. Please ensure you typed it exactly as registered, or complete the full course first.");
    }
}

// -----------------------------------------
// PRESENTATION ENGINE
// -----------------------------------------
function loadSlide(slideNum) {
    if (slideNum < 1 || slideNum > totalSlides) return;
    
    currentSlide = slideNum;
    viewedSlides.add(slideNum);
    
    // Update UI elements
    document.getElementById('slide-img').src = `assets/slides/slide_${slideNum}.png`;
    document.getElementById('slide-img').alt = `Slide ${slideNum}`;
    document.getElementById('current-slide-num').innerText = slideNum;
    
    // Update timeline and button disabled states
    document.getElementById('btn-back').disabled = (slideNum === 1);
    document.getElementById('btn-next').disabled = (slideNum === totalSlides);
    
    // Reset timeline bar
    document.getElementById('timeline-fill').style.width = '0%';
    document.getElementById('audio-duration-display').innerText = '0:00 / 0:00';

    // Handle Audio File Binding
    const audioPath = getAudioPath(slideNum);
    
    if (audioPath) {
        audioPlayer.src = audioPath;
        audioPlayer.load();
        
        // Auto play on transition (except on load if browser blocks it)
        playAudio();
    } else {
        // No audio (Slide 24 / outro)
        audioPlayer.src = '';
        pauseAudio();
        document.getElementById('audio-duration-display').innerText = 'No Audio Narration';
    }

    // Check if training presentation has been fully viewed
    checkCourseCompletion();
}

function playAudio() {
    audioPlayer.play()
        .then(() => {
            isAudioPlaying = true;
            document.getElementById('play-icon').className = 'fa-solid fa-pause';
            document.getElementById('btn-play-hold').title = 'Hold (Pause)';
        })
        .catch(err => {
            console.log("Audio playback waiting for interaction: ", err);
            isAudioPlaying = false;
            document.getElementById('play-icon').className = 'fa-solid fa-play';
        });
}

function pauseAudio() {
    audioPlayer.pause();
    isAudioPlaying = false;
    document.getElementById('play-icon').className = 'fa-solid fa-play';
    if (document.getElementById('btn-play-hold')) {
        document.getElementById('btn-play-hold').title = 'Play Narration';
    }
}

function togglePlayHold() {
    if (isAudioPlaying) {
        pauseAudio();
    } else {
        // If slide has audio, play it. Otherwise do nothing.
        if (getAudioPath(currentSlide)) {
            playAudio();
        }
    }
}

// Renders a text content page for 'content'-type dynamic courses.
function loadContentPage(pageNum) {
    const pages = (dynamicCourseConfig && dynamicCourseConfig.contentPages) || [];
    if (pageNum < 1 || pageNum > pages.length) return;

    currentSlide = pageNum;
    viewedSlides.add(pageNum);

    // Hide the slide image; inject a text card instead
    const imgEl = document.getElementById('slide-img');
    if (imgEl) imgEl.style.display = 'none';

    let contentEl = document.getElementById('dynamic-content-page');
    if (!contentEl) {
        contentEl = document.createElement('div');
        contentEl.id = 'dynamic-content-page';
        contentEl.className = 'card glassmorphism';
        contentEl.style.cssText = 'padding:2rem;text-align:left;min-height:320px;margin-bottom:1rem;';
        if (imgEl && imgEl.parentElement) imgEl.parentElement.insertBefore(contentEl, imgEl);
    }

    const page = pages[pageNum - 1] || {};
    contentEl.innerHTML = `
        <div style="font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--secondary-color);margin-bottom:0.5rem;">
            Page ${pageNum} of ${pages.length}
        </div>
        <h2 style="font-family:var(--font-heading);font-size:1.35rem;color:var(--primary-color);margin-bottom:1rem;">${escapeHtml(page.title || '')}</h2>
        <div style="line-height:1.9;color:var(--text-color);font-size:0.95rem;">${page.content || ''}</div>
    `;

    document.getElementById('current-slide-num').innerText = pageNum;
    document.getElementById('btn-back').disabled = (pageNum === 1);
    document.getElementById('btn-next').disabled = (pageNum === pages.length);

    // Content pages have no audio
    audioPlayer.src = '';
    pauseAudio();
    const displayEl = document.getElementById('audio-duration-display');
    if (displayEl) displayEl.innerText = 'No Audio Narration';

    checkCourseCompletion();
}

function nextSlide() {
    if (dynamicCourseConfig && dynamicCourseConfig.type === 'content') {
        loadContentPage(currentSlide + 1);
        return;
    }
    if (currentSlide < totalSlides) {
        loadSlide(currentSlide + 1);
    }
}

function prevSlide() {
    if (dynamicCourseConfig && dynamicCourseConfig.type === 'content') {
        loadContentPage(currentSlide - 1);
        return;
    }
    if (currentSlide > 1) {
        loadSlide(currentSlide - 1);
    }
}

function onAudioEnded() {
    isAudioPlaying = false;
    document.getElementById('play-icon').className = 'fa-solid fa-play';
    
    // If auto-advance is checked, move to next slide
    const autoAdvance = document.getElementById('auto-advance-check').checked;
    if (autoAdvance && currentSlide < totalSlides) {
        nextSlide();
    }
}

function updateTimeline() {
    if (!audioPlayer.duration) return;
    
    const progressPercent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    document.getElementById('timeline-fill').style.width = `${progressPercent}%`;
    
    document.getElementById('audio-duration-display').innerText = 
        `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
}

function seekAudio(event) {
    if (!audioPlayer.duration) return;
    
    const rect = document.getElementById('timeline-bg').getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;
    const seekTime = (clickX / width) * audioPlayer.duration;
    
    audioPlayer.currentTime = seekTime;
    updateTimeline();
}

function setVolume(val) {
    audioPlayer.volume = val;
    if (val == 0) {
        document.getElementById('mute-icon').className = 'fa-solid fa-volume-xmark volume-icon';
        isMuted = true;
    } else {
        document.getElementById('mute-icon').className = 'fa-solid fa-volume-high volume-icon';
        isMuted = false;
    }
}

function toggleMute() {
    if (isMuted) {
        audioPlayer.muted = false;
        document.getElementById('volume-slider').value = audioPlayer.volume || 0.8;
        document.getElementById('mute-icon').className = 'fa-solid fa-volume-high volume-icon';
        isMuted = false;
    } else {
        audioPlayer.muted = true;
        document.getElementById('volume-slider').value = 0;
        document.getElementById('mute-icon').className = 'fa-solid fa-volume-xmark volume-icon';
        isMuted = true;
    }
}

function checkCourseCompletion() {
    let required = totalSlides;
    if (dynamicCourseConfig) {
        required = dynamicCourseConfig.type === 'content'
            ? (dynamicCourseConfig.contentPages || []).length || 1
            : (dynamicCourseConfig.totalSlides   || totalSlides);
    }
    if (viewedSlides.size >= required) {
        const btn = document.getElementById('btn-start-video');
        if (btn) { btn.classList.remove('disabled'); btn.disabled = false; }
    }
}

function goToVideo() {
    let required = totalSlides;
    let label    = '24 presentation slides';
    if (dynamicCourseConfig) {
        required = dynamicCourseConfig.type === 'content'
            ? (dynamicCourseConfig.contentPages || []).length || 1
            : (dynamicCourseConfig.totalSlides   || totalSlides);
        label = `all ${required} ${dynamicCourseConfig.type === 'content' ? 'content pages' : 'slides'}`;
    }
    if (viewedSlides.size < required) {
        alert(`Please complete reviewing ${label} before proceeding.`);
        return;
    }
    // Skip video step for dynamic courses that have no video URL
    if (dynamicCourseConfig && !dynamicCourseConfig.videoUrl) {
        goToActivity();
        return;
    }
    switchView('video');
}

function goToExam() {
    switchView('exam');
}

// Format seconds into MM:SS
function formatTime(secs) {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// -----------------------------------------
// POST-EXAM MODULE
// -----------------------------------------

// Returns exam questions for the active course (dynamic or legacy anaphylaxis).
function getActiveExamQuestions() {
    if (dynamicCourseConfig &&
        Array.isArray(dynamicCourseConfig.examQuestions) &&
        dynamicCourseConfig.examQuestions.length > 0) {
        return dynamicCourseConfig.examQuestions;
    }
    return examQuestions;
}

function renderExamQuestions() {
    const container = document.getElementById('exam-questions-container');
    container.innerHTML = '';

    getActiveExamQuestions().forEach((q, idx) => {
        const qBlock = document.createElement('div');
        qBlock.className = 'question-block';
        
        qBlock.innerHTML = `
            <div class="question-header">
                <span class="question-number">Question ${idx + 1}.</span>
                <span class="question-text">${escapeHtml(q.text)}</span>
            </div>
            <ul class="options-list">
                ${q.options.map(opt => `
                    <li class="option-item">
                        <input type="radio" name="q-${q.id}" id="q-${q.id}-${opt.key}" value="${opt.key}" required>
                        <label class="option-label" for="q-${q.id}-${opt.key}">
                            <strong>${opt.key}.</strong> ${escapeHtml(opt.text)}
                        </label>
                    </li>
                `).join('')}
            </ul>
        `;
        container.appendChild(qBlock);
    });
}

function gradeExam() {
    const activeQuestions = getActiveExamQuestions();
    let score = 0;
    let unanswered = false;

    activeQuestions.forEach(q => {
        const selected = document.querySelector(`input[name="q-${q.id}"]:checked`);
        if (!selected) {
            unanswered = true;
            return;
        }
        if (selected.value === q.correct) {
            score++;
        }
    });

    if (unanswered) {
        alert(`Please answer all ${activeQuestions.length} questions before submitting.`);
        return;
    }

    studentData.score = score;
    const totalQs = activeQuestions.length;
    const passThreshold = (dynamicCourseConfig && dynamicCourseConfig.passThreshold != null)
        ? Math.ceil(totalQs * (dynamicCourseConfig.passThreshold / 100))
        : Math.ceil(totalQs * 0.8);

    if (score >= passThreshold) {
        studentData.status = 'Passed';

        // Generate certificate details early so they can be stored in course_completions
        studentData.certId = generateCertificateId();
        studentData.dateCompleted = new Date().toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Log completion to Supabase
        if (useSupabase && studentData.id) {
            supabaseClient
                .from('course_completions')
                .insert([{
                    participant_id: studentData.id,
                    exam_score: score,
                    status: 'Passed',
                    cert_id: studentData.certId,
                    date_completed: new Date().toISOString()
                }])
                .then(({ error }) => {
                    if (error) console.error("Failed to log passing completion to Supabase:", error);
                });
        }

        // Hide the form and show the success message
        const form = document.getElementById('exam-form');
        form.style.display = 'none';

        const courseLabel = dynamicCourseConfig ? (dynamicCourseConfig.title || 'course') : 'anaphylaxis post-training';
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'exam-results-msg success animate-slide-down';
        resultsContainer.innerHTML = `
            <i class="fa-solid fa-circle-check" style="font-size: 3rem; margin-bottom: 15px; color: var(--success-color);"></i>
            <h3 style="color: var(--success-color); font-size: 1.6rem; margin-bottom: 10px;">Congratulations!</h3>
            <div style="background: rgba(16, 185, 129, 0.1); padding: 10px 20px; border-radius: 8px; display: inline-block; margin-bottom: 15px;">
                <span style="font-weight: 700; color: var(--success-color); font-size: 1.2rem;">Exam Score: ${score}/${totalQs} (${Math.round((score/totalQs)*100)}%)</span>
            </div>
            <p style="margin-bottom: 25px; font-size: 1.05rem;">You have successfully passed the ${escapeHtml(courseLabel)} exam.</p>
            <button type="button" class="btn btn-success btn-lg" onclick="proceedToEvaluation()">
                Proceed to Course Evaluation <i class="fa-solid fa-arrow-right"></i>
            </button>
        `;
        form.parentElement.appendChild(resultsContainer);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        studentData.status = 'Failed';

        syncToGoogleSheet({
            name: studentData.name,
            department: studentData.department,
            jobTitle: studentData.jobTitle,
            score: `${score}/${totalQs}`,
            status: 'Failed',
            date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
            certId: '',
            rating: '',
            ratings: {},
            feedback: ''
        });

        // Log failure to Supabase
        if (useSupabase && studentData.id) {
            supabaseClient
                .from('course_completions')
                .insert([{
                    participant_id: studentData.id,
                    exam_score: score,
                    status: 'Failed',
                    cert_id: null,
                    date_completed: new Date().toISOString()
                }])
                .then(({ error }) => {
                    if (error) console.error("Failed to log failing completion to Supabase:", error);
                });

            supabaseClient
                .from('alert_logs')
                .insert([{
                    participant_id: studentData.id,
                    event_type: 'Exam Failed',
                    details: `Scored ${score}/${totalQs} (${Math.round((score/totalQs)*100)}%)`
                }])
                .then(({ error }) => {
                    if (error) console.error("Failed to log exam failure alert to Supabase:", error);
                });
        }

        // Show Retry Card in the exam view
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'exam-results-msg fail animate-slide-down';
        resultsContainer.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; margin-bottom: 15px; color: var(--danger-color);"></i>
            <h3 style="color: var(--danger-color); font-size: 1.4rem; margin-bottom: 10px;">Exam Score: ${score}/${totalQs} (${Math.round((score/totalQs)*100)}%)</h3>
            <p style="margin-bottom: 20px;">You did not pass. A minimum score of ${passThreshold}/${totalQs} (80%) is required to obtain your certificate.</p>
            <button type="button" class="btn btn-danger btn-lg" onclick="retakeExam()">
                <i class="fa-solid fa-rotate-left"></i> Retake Exam
            </button>
        `;
        const form = document.getElementById('exam-form');
        form.style.display = 'none';
        form.parentElement.appendChild(resultsContainer);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function proceedToEvaluation() {
    switchView('evaluation');
}

function retakeExam() {
    // Reset form selections
    document.getElementById('exam-form').reset();
    document.getElementById('exam-form').style.display = 'block';
    
    // Remove results message
    const results = document.querySelector('.exam-results-msg');
    if (results) results.remove();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// -----------------------------------------
// COURSE EVALUATION MODULE
// -----------------------------------------
function submitEvaluation() {
    // Collect all rating fields (Q1-Q4, Q6-Q10, Q11-Q16, Q17-Q19, Q20)
    const ratingFields = [
        'q1', 'q2', 'q3', 'q4', 
        'q6', 'q7', 'q8', 'q9', 'q10', 
        'q11', 'q12', 'q13', 'q14', 'q15', 'q16', 
        'q17', 'q18', 'q19', 'q20'
    ];
    let missing = false;
    const ratings = {};

    ratingFields.forEach(field => {
        const selected = document.querySelector(`input[name="${field}"]:checked`);
        if (!selected) { missing = true; }
        else { ratings[field] = parseInt(selected.value); }
    });

    if (missing) {
        alert('Please complete all rating items before submitting.');
        return;
    }

    // Calculate average overall rating (1-4 scale)
    const sum = Object.values(ratings).reduce((a, b) => a + b, 0);
    const avg = (sum / ratingFields.length).toFixed(1);

    studentData.rating = avg;
    studentData.ratings = ratings;
    studentData.evalStrengths = 'N/A';
    studentData.evalImprove = 'N/A';
    studentData.feedback = document.getElementById('eval-feedback').value.trim();

    // Generate completion details (preserving what was generated when passing the exam)
    if (!studentData.certId) {
        studentData.certId = generateCertificateId();
    }
    if (!studentData.dateCompleted) {
        studentData.dateCompleted = new Date().toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Log to Supabase research_indicators
    if (useSupabase && studentData.id) {
        supabaseClient
            .from('research_indicators')
            .insert([{
                participant_id: studentData.id,
                ratings: ratings,
                average_rating: parseFloat(avg),
                feedback: studentData.feedback
            }])
            .then(({ error }) => {
                if (error) console.error("Failed to log research indicators to Supabase:", error);
            });
    }

    // Save final record to local database
    saveParticipantLog();

    // Save to cross-course completions store (for View Certificates page)
    saveCrossCourseCompletion();

    // Populate Certificate Card
    document.getElementById('cert-participant-name').innerText = studentData.name;
    document.getElementById('cert-issue-date').innerText       = studentData.dateCompleted;
    document.getElementById('cert-unique-id').innerText        = studentData.certId;

    // Update cert course box if dynamic course
    if (dynamicCourseConfig) {
        const courseTitle = dynamicCourseConfig.certTitle || dynamicCourseConfig.title || '';
        const certSubtitle= dynamicCourseConfig.certSubtitle || '';
        const titleEl = document.querySelector('.cert-course-title');
        const metaEl  = document.querySelector('.cert-course-meta');
        if (titleEl) titleEl.textContent = courseTitle;
        if (metaEl)  metaEl.textContent  = certSubtitle;
    }

    // Proceed to Certificate display
    switchView('certificate');
}

// Email Certificate Functions
function promptEmailCertificate() {
    document.getElementById('email-modal').style.display = 'flex';
    document.getElementById('user-email-input').value = '';
}

function closeEmailModal() {
    document.getElementById('email-modal').style.display = 'none';
}

function emailCertificateToAdmin() {
    closeEmailModal();
    const adminEmail = 'jehadgml@gmail.com';
    const subject = encodeURIComponent(`Certificate of Completion: ${studentData.name} - Anaphylaxis Recognition and Management`);
    const body = encodeURIComponent(
`Dear Admin,

The following participant has successfully completed the Anaphylaxis Recognition & Management training course.

Participant Details:
- Name: ${studentData.name}
- Department: ${studentData.department}
- Job Title: ${studentData.jobTitle}
- Completion Date: ${studentData.dateCompleted}
- Exam Score: ${studentData.score}
- Certificate Serial ID: ${studentData.certId}

Please archive this record accordingly.

Best regards,
Clinical Education & Training Portal`
    );
    window.location.href = `mailto:${adminEmail}?subject=${subject}&body=${body}`;
}

function emailCertificateToUser() {
    const userEmail = document.getElementById('user-email-input').value.trim();
    if (!userEmail) return;
    
    closeEmailModal();
    const subject = encodeURIComponent(`Your Certificate of Completion: Anaphylaxis Recognition and Management`);
    const body = encodeURIComponent(
`Dear ${studentData.name},

Congratulations on successfully completing the Anaphylaxis Recognition & Management training course.

Your Course Details:
- Completion Date: ${studentData.dateCompleted}
- Exam Score: ${studentData.score}
- Certificate Serial ID: ${studentData.certId}

Thank you for participating in our continuing medical education program.

Best regards,
Jehad Hawamdah
Course Director
Medical Education Dept.`
    );
    window.location.href = `mailto:${userEmail}?subject=${subject}&body=${body}`;
}

// Save student record to browser's Local Storage
function saveParticipantLog() {
    let logs = [];
    try {
        const rawLogs = localStorage.getItem('anaphylaxis_course_logs');
        if (rawLogs) {
            logs = JSON.parse(rawLogs);
        }
    } catch (e) {
        console.error("Failed to load local storage logs: ", e);
    }

    const logEntry = {
        name: studentData.name,
        department: studentData.department,
        jobTitle: studentData.jobTitle,
        password: studentData.password || '',
        score: `${studentData.score}/${getActiveExamQuestions().length}`,
        status: studentData.status,
        date: studentData.dateCompleted || new Date().toLocaleDateString(),
        rating: studentData.rating || 'N/A',
        strengths: studentData.evalStrengths || 'N/A',
        improvements: studentData.evalImprove || 'N/A',
        feedback: studentData.feedback || 'N/A',
        certId: studentData.certId || 'N/A'
    };

    logs.push(logEntry);
    localStorage.setItem('anaphylaxis_course_logs', JSON.stringify(logs));

    syncToGoogleSheet({
        name: studentData.name,
        department: studentData.department,
        jobTitle: studentData.jobTitle,
        score: logEntry.score,
        status: studentData.status,
        date: logEntry.date,
        certId: studentData.certId || '',
        rating: studentData.rating || '',
        ratings: studentData.ratings || {},
        feedback: studentData.feedback || '',
        certLink: buildCertLink()
    });
}

// Helper to generate unique certificate serial ID
function generateCertificateId() {
    const timestamp = Date.now().toString(16).toUpperCase().substring(4);
    const randomHex = Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0');
    return `AN-${timestamp}-${randomHex}`;
}

// Restart Course Flow for a new student
function restartCourse() {
    // Clear forms and reset states
    document.getElementById('registration-form').reset();
    document.getElementById('login-form').reset();
    document.getElementById('exam-form').reset();
    document.getElementById('evaluation-form').reset();
    
    const banner = document.querySelector('.exam-results-msg');
    if (banner) banner.remove();

    studentData = {
        name: '',
        department: '',
        jobTitle: '',
        password: '',
        score: null,
        status: '',
        certId: '',
        dateCompleted: '',
        rating: null,
        ratings: {},
        evalStrengths: '',
        evalImprove: '',
        feedback: '',
        id: null
    };

    // Reset activity module completion indicators and form elements
    resetAllActivities();

    currentSlide = 1;
    viewedSlides = new Set();
    viewedSlides.add(1);
    
    // Disable start video button
    const btn = document.getElementById('btn-start-video');
    btn.classList.add('disabled');
    btn.disabled = true;

    switchView('register');
}

// -----------------------------------------
// CERTIFICATE PRINTING
// -----------------------------------------
function printCertificate() {
    // Force only certificate visible during print
    document.querySelectorAll('.view-section').forEach(el => {
        el.setAttribute('data-prev-display', el.style.display || '');
        if (!el.id || el.id !== 'view-certificate') {
            el.style.display = 'none';
        } else {
            el.style.display = 'block';
        }
    });

    // Trigger print dialog
    window.print();

    // Restore all sections after print dialog closes
    document.querySelectorAll('.view-section').forEach(el => {
        const prev = el.getAttribute('data-prev-display') || '';
        el.style.display = prev;
        el.removeAttribute('data-prev-display');
    });
}

// -----------------------------------------
// ADMIN PANEL MODULE
// -----------------------------------------
const ADMIN_NAME = 'jehad hawamdah';
const ADMIN_EMAIL = 'jehadgml@gmail.com';
let allLogs = []; // cache for filtering

function promptAdminLogin() {
    document.getElementById('admin-modal').style.display = 'flex';
    document.getElementById('admin-name').value = '';
    document.getElementById('admin-email').value = '';
    document.getElementById('admin-error-msg').style.display = 'none';
    document.getElementById('admin-name').focus();
}

function closeAdminModal() {
    document.getElementById('admin-modal').style.display = 'none';
}

function submitAdminLogin() {
    const nameInput = document.getElementById('admin-name').value.trim().toLowerCase();
    const emailInput = document.getElementById('admin-email').value.trim().toLowerCase();

    if (nameInput === ADMIN_NAME && emailInput === ADMIN_EMAIL) {
        // Record login to history
        recordAdminLogin('Jehad Hawamdah');
        closeAdminModal();
        loadAdminDashboard();
    } else {
        document.getElementById('admin-error-msg').style.display = 'block';
        document.getElementById('admin-name').value = '';
        document.getElementById('admin-email').value = '';
        document.getElementById('admin-name').focus();
    }
}

function recordAdminLogin(name) {
    let logins = [];
    try {
        logins = JSON.parse(localStorage.getItem('admin_login_log') || '[]');
    } catch(e) {}
    logins.push({
        name,
        email: ADMIN_EMAIL,
        time: new Date().toLocaleString()
    });
    localStorage.setItem('admin_login_log', JSON.stringify(logins));
}

function mapSupabaseDataToLogs(participants) {
    const logs = [];
    participants.forEach(p => {
        const completions = p.course_completions || [];
        const evaluations = p.research_indicators || [];
        
        // Get the evaluation feedback if any
        const latestEval = evaluations[evaluations.length - 1] || null;
        
        if (completions.length === 0) {
            logs.push({
                name: p.name,
                department: p.department || '—',
                jobTitle: p.job_title || '—',
                password: p.password || '',
                score: '—',
                status: 'Registered',
                date: p.created_at ? new Date(p.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
                timestamp: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
                rating: 'N/A',
                strengths: 'N/A',
                improvements: 'N/A',
                feedback: 'N/A',
                certId: 'N/A'
            });
        } else {
            completions.forEach(c => {
                logs.push({
                    name: p.name,
                    department: p.department || '—',
                    jobTitle: p.job_title || '—',
                    password: p.password || '',
                    score: `${c.exam_score}/5`,
                    status: c.status,
                    date: c.date_completed ? new Date(c.date_completed).toLocaleDateString() : new Date().toLocaleDateString(),
                    timestamp: c.date_completed ? new Date(c.date_completed).getTime() : Date.now(),
                    rating: latestEval ? latestEval.average_rating : 'N/A',
                    strengths: 'N/A',
                    improvements: 'N/A',
                    feedback: latestEval ? (latestEval.feedback || 'N/A') : 'N/A',
                    certId: c.cert_id || 'N/A'
                });
            });
        }
    });
    // Sort ascending so slice().reverse() prints newest first
    logs.sort((a, b) => a.timestamp - b.timestamp);
    return logs;
}

function loadAdminDashboard() {
    switchView('admin');
    try {
        allLogs = JSON.parse(localStorage.getItem('anaphylaxis_course_logs') || '[]');
    } catch(e) { allLogs = []; }

    renderStatsCards();
    renderJobBreakdown();
    renderScoreDistribution();
    renderLoginLog();
    renderTable(allLogs);

    if (useSupabase) {
        console.log("Loading live data from Supabase Cloud...");
        supabaseClient
            .from('participants')
            .select(`
                id,
                name,
                department,
                job_title,
                created_at,
                password,
                course_completions (
                    exam_score,
                    status,
                    cert_id,
                    date_completed
                ),
                research_indicators (
                    average_rating,
                    feedback
                )
            `)
            .then(({ data, error }) => {
                if (error) {
                    console.error("Failed to load live data from Supabase:", error);
                    return;
                }
                if (data) {
                    allLogs = mapSupabaseDataToLogs(data);
                    // Re-render dashboard components with live data
                    renderStatsCards();
                    renderJobBreakdown();
                    renderScoreDistribution();
                    renderTable(allLogs);
                }
            });
    }

    // Google Sheets — fetch all rows and override the dashboard (most authoritative source)
    if (gasWebhookUrl) {
        fetchGasData();
    }
}

// ---- STATS CARDS ----
function renderStatsCards() {
    const total = allLogs.length;
    const completed = allLogs.filter(l => l.status === 'Passed').length;
    const passRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const rated = allLogs.filter(l => l.rating && l.rating !== 'N/A');
    const avgRating = rated.length > 0
        ? (rated.reduce((s, l) => s + parseFloat(l.rating), 0) / rated.length).toFixed(1)
        : '—';

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-pass-rate').textContent = passRate + '%';
    document.getElementById('stat-avg-rating').textContent = avgRating !== '—' ? avgRating + '/4' : '—';
}

// ---- JOB TITLE BREAKDOWN ----
function renderJobBreakdown() {
    const container = document.getElementById('job-breakdown');
    if (allLogs.length === 0) {
        container.innerHTML = '<div class="breakdown-empty">No data yet</div>';
        return;
    }

    const counts = { Nurse: 0, Physician: 0, Others: 0 };
    allLogs.forEach(l => {
        const jt = l.jobTitle || 'Others';
        if (counts.hasOwnProperty(jt)) counts[jt]++;
        else counts['Others']++;
    });

    const total = allLogs.length;
    const colors = { Nurse: '#0d9488', Physician: '#3b82f6', Others: '#f59e0b' };
    const icons = { Nurse: 'fa-user-nurse', Physician: 'fa-user-doctor', Others: 'fa-user' };

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

// ---- SCORE DISTRIBUTION ----
function renderScoreDistribution() {
    const container = document.getElementById('score-bars');
    if (allLogs.length === 0) {
        container.innerHTML = '<div class="breakdown-empty">No data yet</div>';
        return;
    }

    const scoreCounts = {'0/5':0,'1/5':0,'2/5':0,'3/5':0,'4/5':0,'5/5':0};
    allLogs.forEach(l => {
        const s = l.score || '0/5';
        if (scoreCounts.hasOwnProperty(s)) scoreCounts[s]++;
    });
    const max = Math.max(...Object.values(scoreCounts), 1);

    container.innerHTML = Object.entries(scoreCounts).map(([score, count]) => {
        const pct = Math.round((count / max) * 100);
        const isPassing = parseInt(score) >= 4;
        const color = isPassing ? '#059669' : '#dc2626';
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

// ---- LOGIN LOG ----
function renderLoginLog() {
    const container = document.getElementById('login-log');
    let logins = [];
    try {
        logins = JSON.parse(localStorage.getItem('admin_login_log') || '[]');
    } catch(e) {}

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
        </div>
    `).join('');
}

// ---- TABLE RENDER ----
function renderTable(logs) {
    const tbody = document.getElementById('admin-table-body');
    const countLabel = document.getElementById('table-count-label');
    tbody.innerHTML = '';

    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:2rem;font-style:italic;">
            No participants found matching your filters.</td></tr>`;
        countLabel.textContent = '';
        return;
    }

    logs.slice().reverse().forEach((log, idx) => {
        const badgeClass = log.status === 'Passed' ? 'badge-success' : 'badge-danger';
        const jobColors = { Nurse: '#0d9488', Physician: '#3b82f6', Others: '#f59e0b' };
        const jobColor = jobColors[log.jobTitle] || '#6b7280';
        const certUrl = buildCertLinkFromLog(log);
        const certCell = certUrl
            ? `<a href="${certUrl}" target="_blank" title="Open certificate for ${escapeHtml(log.name)}"
                  style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;
                         background:rgba(17,94,89,0.08);color:var(--primary-color);font-size:0.78rem;
                         font-weight:700;text-decoration:none;white-space:nowrap;border:1px solid rgba(17,94,89,0.2);">
                 <i class="fa-solid fa-certificate"></i> View
               </a>`
            : '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="color:var(--text-muted);font-size:0.8rem">${logs.length - idx}</td>
            <td><strong>${escapeHtml(log.name)}</strong></td>
            <td style="font-size:0.85rem">${escapeHtml(log.department || '—')}</td>
            <td><span class="job-badge" style="background:${jobColor}20;color:${jobColor};border:1px solid ${jobColor}40">${escapeHtml(log.jobTitle || '—')}</span></td>
            <td style="font-weight:700;text-align:center">${escapeHtml(log.score)}</td>
            <td><span class="badge ${badgeClass}">${escapeHtml(log.status)}</span></td>
            <td style="font-size:0.82rem;white-space:nowrap">${escapeHtml(log.date)}</td>
            <td style="text-align:center;font-weight:600">${log.rating !== 'N/A' && log.rating ? parseFloat(log.rating).toFixed(1) + '/4' : '—'}</td>
            <td style="font-size:0.8rem;color:var(--text-muted);max-width:180px">${escapeHtml(log.strengths || log.feedback || '—')}</td>
            <td style="text-align:center">${certCell}</td>
        `;
        tbody.appendChild(row);
    });

    countLabel.textContent = `Showing ${logs.length} of ${allLogs.length} participant(s)`;
}

// ---- TABLE FILTER ----
function filterTable(searchVal) {
    const search = (document.getElementById('table-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('table-filter-status')?.value || '';
    const jobFilter = document.getElementById('table-filter-job')?.value || '';

    const filtered = allLogs.filter(log => {
        const matchSearch = !search ||
            (log.name || '').toLowerCase().includes(search) ||
            (log.department || '').toLowerCase().includes(search);
        const matchStatus = !statusFilter || log.status === statusFilter;
        const matchJob = !jobFilter || log.jobTitle === jobFilter;
        return matchSearch && matchStatus && matchJob;
    });

    renderTable(filtered);
}

function populateAdminTable() {
    // Kept for backward compat — just delegate to renderTable
    renderTable(allLogs);
}

function exitAdmin() {
    if (studentData.certId) {
        switchView('certificate');
    } else if (studentData.status === 'Passed') {
        switchView('evaluation');
    } else if (activityDragDone && activityMcqDone && activityOrderDone) {
        switchView('exam');
    } else if (studentData.name && viewedSlides.size === totalSlides) {
        switchView('video');
    } else if (studentData.name) {
        switchView('presentation');
    } else {
        switchView('register');
    }
}

function clearLogs() {
    let msg = 'Delete ALL participant records permanently? This cannot be undone.';
    if (useSupabase) {
        msg = 'Delete ALL local participant cache records? Note: Remote Supabase database records will not be deleted and must be managed in the Supabase Dashboard.';
    }
    if (confirm(msg)) {
        localStorage.removeItem('anaphylaxis_course_logs');
        allLogs = [];
        renderStatsCards();
        renderJobBreakdown();
        renderScoreDistribution();
        renderTable([]);
    }
}

// -----------------------------------------
// DATA EXPORT (EXCEL & CSV)
// -----------------------------------------
function getLogsDataArray() {
    if (allLogs && allLogs.length > 0) {
        return allLogs;
    }
    let logs = [];
    try {
        const rawLogs = localStorage.getItem('anaphylaxis_course_logs');
        if (rawLogs) {
            logs = JSON.parse(rawLogs);
        }
    } catch (e) {}
    return logs;
}

function exportToExcel() {
    const logs = getLogsDataArray();
    if (logs.length === 0) {
        alert("No student data available to export.");
        return;
    }

    // Format logs for Excel sheet headers
    const formattedData = logs.map(log => ({
        "Participant Name": log.name,
        "Department": log.department,
        "Job Title": log.jobTitle || 'N/A',
        "Exam Score": log.score,
        "Status": log.status,
        "Completion Date": log.date,
        "Certificate ID": log.certId,
        "Overall Evaluation (avg/4)": log.rating,
        "What they liked": log.strengths || 'N/A',
        "Areas for Improvement": log.improvements || 'N/A',
        "Additional Comments": log.feedback
    }));

    try {
        // Create SheetJS workbook and worksheet
        const ws = XLSX.utils.json_to_sheet(formattedData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Anaphylaxis Course Logs");
        
        // Auto-fit column widths
        const maxLen = formattedData.reduce((acc, row) => {
            Object.keys(row).forEach((key, idx) => {
                const val = String(row[key] || '');
                acc[idx] = Math.max(acc[idx] || key.length, val.length);
            });
            return acc;
        }, []);
        ws['!cols'] = maxLen.map(len => ({ wch: len + 3 }));

        // Download Excel File
        XLSX.writeFile(wb, "Anaphylaxis_Recognition_Course_Logs.xlsx");
    } catch (e) {
        console.error("Excel export error: ", e);
        alert("Failed to export directly to Excel. Downloading CSV backup instead.");
        exportToCSV();
    }
}

function exportToCSV() {
    const logs = getLogsDataArray();
    if (logs.length === 0) {
        alert("No student data available to export.");
        return;
    }

    // Construct CSV content with UTF-8 BOM
    let csvContent = "\uFEFF"; // UTF-8 Byte Order Mark to support international characters in Excel
    
    // Headers
    csvContent += `"Participant Name","Department","Job Title","Exam Score","Status","Completion Date","Certificate ID","Overall Rating","What They Liked","Areas for Improvement","Additional Comments"\n`;

    logs.forEach(log => {
        const clean = (v) => (v || 'N/A').replace(/"/g, '""');
        csvContent += `"${log.name}","${log.department}","${log.jobTitle || 'N/A'}","${log.score}","${log.status}","${log.date}","${log.certId}","${log.rating}","${clean(log.strengths)}","${clean(log.improvements)}","${clean(log.feedback)}"\n`;
    });

    // Download CSV File
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "Anaphylaxis_Recognition_Course_Logs.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// -----------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Build a shareable URL that opens directly to the current student's certificate
function buildCertLink() {
    if (!studentData.certId || !studentData.name) return '';
    const base = window.location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({
        certId:  studentData.certId,
        name:    studentData.name,
        date:    studentData.dateCompleted || '',
        course:  currentCourseSlug
    });
    return `${base}?${params.toString()}`;
}

// Build a cert link from an admin log entry (used in the admin table)
function buildCertLinkFromLog(log) {
    if (!log.certId || log.certId === 'N/A' || log.status !== 'Passed') return '';
    const base = window.location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({
        certId:  log.certId,
        name:    log.name,
        date:    log.date || '',
        course:  log.courseSlug || currentCourseSlug
    });
    return `${base}?${params.toString()}`;
}

// Save a cross-course completion record so the Certificates portal can find it.
function saveCrossCourseCompletion() {
    if (!studentData.certId || !studentData.name || studentData.status !== 'Passed') return;

    // Determine course display info
    const courseTitle   = dynamicCourseConfig?.certTitle   || dynamicCourseConfig?.title   || 'Anaphylaxis Recognition & Management';
    const certSubtitle  = dynamicCourseConfig?.certSubtitle || '1.0 Contact Hour | Current Clinical Guidelines';

    let completions = [];
    try {
        const raw = localStorage.getItem(MC_COMPLETIONS_KEY);
        if (raw) completions = JSON.parse(raw);
    } catch(e) {}

    // Avoid duplicate entries
    const dup = completions.find(c =>
        c.certId === studentData.certId &&
        c.courseSlug === currentCourseSlug);
    if (dup) return;

    completions.push({
        completionId: studentData.certId + '-' + Date.now(),
        courseId:     currentCourseSlug,
        courseSlug:   currentCourseSlug,
        courseTitle,
        certSubtitle,
        employeeName: studentData.name,
        department:   studentData.department || '',
        jobTitle:     studentData.jobTitle   || '',
        password:     studentData.password   || '',
        score:        `${studentData.score}/${getActiveExamQuestions().length}`,
        status:       'Passed',
        certId:       studentData.certId,
        completedAt:  studentData.dateCompleted || new Date().toLocaleDateString(),
        date:         studentData.dateCompleted || new Date().toLocaleDateString(),
        rating:       studentData.rating || ''
    });
    localStorage.setItem(MC_COMPLETIONS_KEY, JSON.stringify(completions));

    // Sync to GAS (multi-course action)
    if (gasWebhookUrl) {
        fetch(gasWebhookUrl, {
            method: 'POST',
            mode:   'no-cors',
            body:   JSON.stringify({
                action:      'syncCompletion',
                completion:  completions[completions.length - 1]
            })
        }).catch(() => {});
    }
}

// -----------------------------------------
// INTERACTIVE ACTIVITY FUNCTIONS
// -----------------------------------------
function goToActivity() {
    // Non-legacy dynamic courses skip the anaphylaxis-specific activities
    if (dynamicCourseConfig) {
        activityDragDone  = true;
        activityMcqDone   = true;
        activityOrderDone = true;
        switchView('exam');
        return;
    }
    switchView('activity');
}

function goToExamFromActivity() {
    if (!activityDragDone || !activityMcqDone || !activityOrderDone) {
        alert("Please complete all three interactive activities before proceeding to the post-exam.");
        return;
    }
    switchView('exam');
}

// Setup Drag & Drop elements and fallback selection
let selectedDragItem = null;

function initDragActivity() {
    const dragItems = document.querySelectorAll('.drag-item');
    const dropZones = document.querySelectorAll('.drop-zone');

    // Desktop HTML5 drag and drop
    dragItems.forEach(item => {
        item.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', e.target.id);
            e.target.classList.add('dragging');
        });

        item.addEventListener('dragend', function(e) {
            e.target.classList.remove('dragging');
        });

        // Mobile / click-to-assign select
        item.addEventListener('click', function(e) {
            // Remove selected class from all items
            dragItems.forEach(i => i.classList.remove('selected'));
            
            // If already selected, deselect
            if (selectedDragItem === e.target) {
                selectedDragItem = null;
            } else {
                selectedDragItem = e.target;
                e.target.classList.add('selected');
            }
        });
    });

    dropZones.forEach(zone => {
        zone.addEventListener('dragover', function(e) {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', function() {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', function(e) {
            e.preventDefault();
            zone.classList.remove('dragover');
            const itemId = e.dataTransfer.getData('text/plain');
            const dragItem = document.getElementById(itemId);
            if (dragItem) {
                handleDrop(dragItem, zone);
            }
        });

        // Mobile / click-to-assign place
        zone.addEventListener('click', function() {
            if (selectedDragItem) {
                handleDrop(selectedDragItem, zone);
                selectedDragItem.classList.remove('selected');
                selectedDragItem = null;
            }
        });
    });
}

function handleDrop(dragItem, zone) {
    const itemSystem = dragItem.dataset.system;
    const zoneSystem = zone.dataset.system;
    const isCorrect = (itemSystem === zoneSystem);
    const symptomText = dragItem.innerText.trim();

    // Log to Supabase symptom_reports
    if (useSupabase && studentData.id) {
        supabaseClient
            .from('symptom_reports')
            .insert([{
                participant_id: studentData.id,
                symptom: symptomText,
                body_system: zoneSystem,
                correct: isCorrect
            }])
            .then(({ error }) => {
                if (error) console.error("Failed to log symptom report to Supabase:", error);
            });

        if (!isCorrect) {
            supabaseClient
                .from('alert_logs')
                .insert([{
                    participant_id: studentData.id,
                    event_type: 'Incorrect Symptom Drop',
                    details: `Tried to drop "${symptomText}" into "${zoneSystem}" (belongs to "${itemSystem}")`
                }])
                .then(({ error }) => {
                    if (error) console.error("Failed to log alert to Supabase:", error);
                });
        }
    }

    // Check if the drop is correct
    if (isCorrect) {
        // Correct drop! Append to zone, add class
        zone.innerHTML = ''; // Clear label
        zone.appendChild(dragItem);
        dragItem.setAttribute('draggable', 'false');
        dragItem.style.cursor = 'default';
        zone.classList.add('correct');
        
        // Remove item from click selection
        dragItem.classList.remove('selected');
        
        // Check if all zones are correct
        checkDragActivityCompleted();
    } else {
        // Incorrect drop! Flash red and let it snap back
        zone.classList.add('error-flash');
        setTimeout(() => {
            zone.classList.remove('error-flash');
        }, 500);
        alert(`Incorrect! "${dragItem.innerText}" does not belong to the ${zoneSystem.toUpperCase()} system.`);
    }
}

function checkDragActivityCompleted() {
    const dropZones = document.querySelectorAll('.drop-zone');
    let allCorrect = true;
    dropZones.forEach(zone => {
        if (!zone.classList.contains('correct')) {
            allCorrect = false;
        }
    });

    if (allCorrect) {
        activityDragDone = true;
        document.getElementById('act-col-drag').classList.add('completed');
        document.getElementById('status-drag').innerHTML = '<i class="fa-solid fa-circle-check"></i> Completed';
        document.getElementById('status-drag').className = 'status-indicator success';
        checkActivityCompletion();
    }
}

function resetDragActivity() {
    activityDragDone = false;
    const colDrag = document.getElementById('act-col-drag');
    if (colDrag) colDrag.classList.remove('completed');
    const statusDrag = document.getElementById('status-drag');
    if (statusDrag) {
        statusDrag.innerHTML = '<i class="fa-regular fa-circle-question"></i> Pending';
        statusDrag.className = 'status-indicator';
    }
    
    // Reset pool container
    const pool = document.getElementById('draggable-pool');
    if (pool) {
        pool.innerHTML = `
            <div class="drag-item" draggable="true" id="symptom-skin" data-system="skin">Hives, itching, flushing</div>
            <div class="drag-item" draggable="true" id="symptom-respiratory" data-system="respiratory">Wheezing, shortness of breath, throat tightness</div>
            <div class="drag-item" draggable="true" id="symptom-gastro" data-system="gastrointestinal">Nausea, vomiting, abdominal pain</div>
            <div class="drag-item" draggable="true" id="symptom-cardio" data-system="cardiovascular">Dizziness, weak pulse, low blood pressure</div>
        `;
    }

    // Reset drop zones
    const zones = [
        { id: 'zone-skin', name: 'Skin' },
        { id: 'zone-respiratory', name: 'Respiratory' },
        { id: 'zone-cardiovascular', name: 'Cardiovascular' },
        { id: 'zone-gastrointestinal', name: 'Gastrointestinal' }
    ];
    
    zones.forEach(z => {
        const el = document.getElementById(z.id);
        if (el) {
            el.innerHTML = '';
            el.classList.remove('correct');
        }
    });

    // Re-initialize event listeners
    initDragActivity();
    selectedDragItem = null;
}

function submitMcqActivity() {
    // Correct answers: Q1 -> C, Q2 -> B, Q3 -> C
    const q1 = document.querySelector('input[name="act-q1"]:checked');
    const q2 = document.querySelector('input[name="act-q2"]:checked');
    const q3 = document.querySelector('input[name="act-q3"]:checked');

    if (!q1 || !q2 || !q3) {
        alert("Please answer all three questions before submitting.");
        return;
    }

    let correctCount = 0;
    
    // Q1 Check
    const q1Item = document.querySelector('.mcq-q-item[data-q="1"]');
    if (q1.value === 'C') {
        correctCount++;
        q1Item.style.borderColor = 'var(--success-color)';
        q1Item.style.background = 'rgba(240, 253, 250, 0.5)';
    } else {
        q1Item.style.borderColor = 'var(--danger-color)';
        q1Item.style.background = 'rgba(254, 242, 242, 0.5)';
    }

    // Q2 Check
    const q2Item = document.querySelector('.mcq-q-item[data-q="2"]');
    if (q2.value === 'B') {
        correctCount++;
        q2Item.style.borderColor = 'var(--success-color)';
        q2Item.style.background = 'rgba(240, 253, 250, 0.5)';
    } else {
        q2Item.style.borderColor = 'var(--danger-color)';
        q2Item.style.background = 'rgba(254, 242, 242, 0.5)';
    }

    // Q3 Check
    const q3Item = document.querySelector('.mcq-q-item[data-q="3"]');
    if (q3.value === 'C') {
        correctCount++;
        q3Item.style.borderColor = 'var(--success-color)';
        q3Item.style.background = 'rgba(240, 253, 250, 0.5)';
    } else {
        q3Item.style.borderColor = 'var(--danger-color)';
        q3Item.style.background = 'rgba(254, 242, 242, 0.5)';
    }

    if (correctCount === 3) {
        activityMcqDone = true;
        document.getElementById('act-col-mcq').classList.add('completed');
        document.getElementById('status-mcq').innerHTML = '<i class="fa-solid fa-circle-check"></i> Completed';
        document.getElementById('status-mcq').className = 'status-indicator success';
        
        // Disable radios
        document.querySelectorAll('.mcq-options input').forEach(el => el.disabled = true);
        document.getElementById('btn-submit-mcq').disabled = true;
        
        checkActivityCompletion();
    } else {
        if (useSupabase && studentData.id) {
            supabaseClient
                .from('alert_logs')
                .insert([{
                    participant_id: studentData.id,
                    event_type: 'Failed MCQ Activity Attempt',
                    details: `Answered ${correctCount} out of 3 questions correctly.`
                }])
                .then(({ error }) => {
                    if (error) console.error("Failed to log MCQ activity alert to Supabase:", error);
                });
        }
        alert(`You answered ${correctCount} out of 3 questions correctly. Incorrect questions are highlighted in red. Please try again!`);
    }
}

function submitOrderActivity() {
    const valRemove = document.getElementById('order-step-remove').value;
    const valGiepi = document.getElementById('order-step-giepi').value;
    const valLayflat = document.getElementById('order-step-layflat').value;
    const valCallemerg = document.getElementById('order-step-callemerg').value;
    const valStay = document.getElementById('order-step-stay').value;

    if (!valRemove || !valGiepi || !valLayflat || !valCallemerg || !valStay) {
        alert("Please assign a step number (1-5) to every action.");
        return;
    }

    // Check uniqueness of selections
    const selections = [valRemove, valGiepi, valLayflat, valCallemerg, valStay];
    const uniqueSelections = new Set(selections);
    if (uniqueSelections.size !== 5) {
        alert("Step numbers must be unique. Each step number (1 through 5) can only be used once.");
        return;
    }

    let isCorrect = true;
    
    // Check remove -> 1
    const itemRemove = document.getElementById('order-step-remove').closest('.order-step-item');
    if (valRemove === '1') {
        itemRemove.style.borderColor = 'var(--success-color)';
        itemRemove.style.background = 'rgba(240, 253, 250, 0.5)';
    } else {
        isCorrect = false;
        itemRemove.style.borderColor = 'var(--danger-color)';
        itemRemove.style.background = 'rgba(254, 242, 242, 0.5)';
    }

    // Check epinephrine -> 2
    const itemGiepi = document.getElementById('order-step-giepi').closest('.order-step-item');
    if (valGiepi === '2') {
        itemGiepi.style.borderColor = 'var(--success-color)';
        itemGiepi.style.background = 'rgba(240, 253, 250, 0.5)';
    } else {
        isCorrect = false;
        itemGiepi.style.borderColor = 'var(--danger-color)';
        itemGiepi.style.background = 'rgba(254, 242, 242, 0.5)';
    }

    // Check layflat -> 3
    const itemLayflat = document.getElementById('order-step-layflat').closest('.order-step-item');
    if (valLayflat === '3') {
        itemLayflat.style.borderColor = 'var(--success-color)';
        itemLayflat.style.background = 'rgba(240, 253, 250, 0.5)';
    } else {
        isCorrect = false;
        itemLayflat.style.borderColor = 'var(--danger-color)';
        itemLayflat.style.background = 'rgba(254, 242, 242, 0.5)';
    }

    // Check call emergency -> 4
    const itemCallemerg = document.getElementById('order-step-callemerg').closest('.order-step-item');
    if (valCallemerg === '4') {
        itemCallemerg.style.borderColor = 'var(--success-color)';
        itemCallemerg.style.background = 'rgba(240, 253, 250, 0.5)';
    } else {
        isCorrect = false;
        itemCallemerg.style.borderColor = 'var(--danger-color)';
        itemCallemerg.style.background = 'rgba(254, 242, 242, 0.5)';
    }

    // Check stay/monitor -> 5
    const itemStay = document.getElementById('order-step-stay').closest('.order-step-item');
    if (valStay === '5') {
        itemStay.style.borderColor = 'var(--success-color)';
        itemStay.style.background = 'rgba(240, 253, 250, 0.5)';
    } else {
        isCorrect = false;
        itemStay.style.borderColor = 'var(--danger-color)';
        itemStay.style.background = 'rgba(254, 242, 242, 0.5)';
    }

    if (isCorrect) {
        activityOrderDone = true;
        document.getElementById('act-col-order').classList.add('completed');
        document.getElementById('status-order').innerHTML = '<i class="fa-solid fa-circle-check"></i> Completed';
        document.getElementById('status-order').className = 'status-indicator success';
        
        // Disable selects
        document.querySelectorAll('.order-select').forEach(el => el.disabled = true);
        document.getElementById('btn-submit-order').disabled = true;

        checkActivityCompletion();
    } else {
        if (useSupabase && studentData.id) {
            supabaseClient
                .from('alert_logs')
                .insert([{
                    participant_id: studentData.id,
                    event_type: 'Incorrect Ordering Attempt',
                    details: `Submitted incorrect ordering sequence: Remove=${valRemove}, Epi=${valGiepi}, Layflat=${valLayflat}, Call=${valCallemerg}, Stay=${valStay}`
                }])
                .then(({ error }) => {
                    if (error) console.error("Failed to log ordering activity alert to Supabase:", error);
                });
        }
        alert("The steps are not in the correct chronological order. Incorrect steps are highlighted in red. Review guidelines and try again!");
    }
}

function checkActivityCompletion() {
    if (activityDragDone && activityMcqDone && activityOrderDone) {
        document.getElementById('activity-success-banner').style.display = 'block';
        const goBtn = document.getElementById('btn-go-exam-unlocked');
        goBtn.disabled = false;
        goBtn.classList.remove('disabled');
        
        // Scroll to the bottom button area so they see it's unlocked
        goBtn.scrollIntoView({ behavior: 'smooth' });
    }
}

function resetAllActivities() {
    activityDragDone = false;
    activityMcqDone = false;
    activityOrderDone = false;

    // Reset Drag Column
    resetDragActivity();

    // Reset MCQ Column
    document.querySelectorAll('.mcq-options input').forEach(el => {
        el.checked = false;
        el.disabled = false;
    });
    document.querySelectorAll('.mcq-q-item').forEach(el => {
        el.style.borderColor = 'var(--border-color)';
        el.style.background = 'rgba(255,255,255,0.4)';
    });
    const submitMcqBtn = document.getElementById('btn-submit-mcq');
    if (submitMcqBtn) submitMcqBtn.disabled = false;
    const colMcq = document.getElementById('act-col-mcq');
    if (colMcq) colMcq.classList.remove('completed');
    const statusMcq = document.getElementById('status-mcq');
    if (statusMcq) {
        statusMcq.innerHTML = '<i class="fa-regular fa-circle-question"></i> Pending';
        statusMcq.className = 'status-indicator';
    }

    // Reset Order Column
    document.querySelectorAll('.order-select').forEach(el => {
        el.value = '';
        el.disabled = false;
    });
    document.querySelectorAll('.order-step-item').forEach(el => {
        el.style.borderColor = 'var(--border-color)';
        el.style.background = 'rgba(255,255,255,0.4)';
    });
    const submitOrderBtn = document.getElementById('btn-submit-order');
    if (submitOrderBtn) submitOrderBtn.disabled = false;
    const colOrder = document.getElementById('act-col-order');
    if (colOrder) colOrder.classList.remove('completed');
    const statusOrder = document.getElementById('status-order');
    if (statusOrder) {
        statusOrder.innerHTML = '<i class="fa-regular fa-circle-question"></i> Pending';
        statusOrder.className = 'status-indicator';
    }

    // Hide Success Banner and Disable Next Button
    const successBanner = document.getElementById('activity-success-banner');
    if (successBanner) successBanner.style.display = 'none';
    const goBtn = document.getElementById('btn-go-exam-unlocked');
    if (goBtn) {
        goBtn.disabled = true;
        goBtn.classList.add('disabled');
    }
}

function confirmLogout() {
    if (confirm("Are you sure you want to exit the course? Your current progress in this session will be lost.")) {
        restartCourse();
    }
}
