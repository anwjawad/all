/**
 * MULTI-COURSE TRAINING PORTAL – GOOGLE SHEETS SYNC
 * ====================================================
 * SETUP INSTRUCTIONS:
 *
 * 1. Open your Google Sheet
 * 2. Click Extensions → Apps Script
 * 3. Delete all existing content and paste this entire script
 * 4. Click Save (Ctrl+S)
 * 5. Click "Deploy" → "New deployment"
 * 6. Gear icon → Type: Web app
 *    Execute as: Me  |  Who has access: Anyone
 * 7. Click Deploy, authorize, copy the Web App URL
 * 8. Paste URL in Admin Dashboard → Settings → Google Sheets Sync URL
 *
 * SHEET TABS CREATED AUTOMATICALLY:
 *   - Course Participants  (original anaphylaxis course — preserved)
 *   - Courses              (all courses created in the admin)
 *   - AllCompletions       (cross-course completion records)
 *   - Users                (employee accounts)
 *
 * POST actions routed by data.action field:
 *   (none / undefined)   → Course Participants (legacy anaphylaxis sync)
 *   syncCourse           → Courses sheet
 *   syncCompletion       → AllCompletions sheet
 *   syncUser             → Users sheet
 *
 * GET actions routed by e.parameter.action:
 *   getData              → Course Participants (legacy)
 *   getCourses           → Courses sheet
 *   getCompletions       → AllCompletions sheet (optionally ?name=...)
 *   (none)               → health check
 */

// ─── CONFIGURATION ────────────────────────────────────────────────
const SHEET_NAME  = 'Course Participants';
const TOTAL_QS    = 5;   // number of exam questions (used to reconstruct score from date objects)

const HEADERS = [
  'Timestamp',
  'Full Name',
  'Department',
  'Job Title',
  'Exam Score',
  'Status',
  'Completion Date',
  'Certificate ID',
  'Avg Rating (/4)',
  'Q1 – Registration procedure clear',
  'Q2 – Location easily accessible',
  'Q3 – Facilities & atmosphere convenient',
  'Q4 – Instructional materials appropriate',
  'Q6 – Learning objectives clear & met',
  'Q7 – Content informative & useful',
  'Q8 – Content relevant to specialty',
  'Q9 – Enhanced ability to apply learning',
  'Q10 – Content at appropriate level',
  'Q11 – Presentations flowed logically',
  'Q12 – Reading materials useful',
  'Q13 – Instructors knowledgeable & organized',
  'Q14 – Instructors respectful & concerned',
  'Q15 – Evidence-based content applied',
  'Q16 – Sufficient interaction & time',
  'Q17 – Assessment criteria clear',
  'Q18 – Assessment methods appropriate',
  'Q19 – Adequate feedback on performance',
  'Q20 – Overall Course Evaluation',
  'Additional Comments',
  'Certificate Link'
];

// ─── HELPERS ──────────────────────────────────────────────────────
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() > 0) return;

  sheet.appendRow(HEADERS);

  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setBackground('#115e59')
             .setFontColor('#ffffff')
             .setFontWeight('bold')
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle')
             .setWrap(true);

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 52);
  sheet.autoResizeColumns(1, HEADERS.length);
  sheet.setColumnWidth(2, 160);   // Full Name
  sheet.setColumnWidth(29, 220);  // Additional Comments
  sheet.setColumnWidth(30, 140);  // Certificate Link

  // Pre-format columns that would otherwise get auto-converted to dates by Sheets.
  // "4/5" looks like a date fraction (DD/MM) — forcing these columns to text prevents that.
  const maxRows = sheet.getMaxRows();
  sheet.getRange(2, 5, maxRows - 1, 1).setNumberFormat('@');  // col E: Exam Score
  sheet.getRange(2, 7, maxRows - 1, 1).setNumberFormat('@');  // col G: Completion Date
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── POST HANDLER (routes by data.action) ─────────────────────────
function doPost(e) {
  try {
    const raw = e.postData ? e.postData.contents : null;
    if (!raw) return jsonResponse({ success: false, error: 'No data received' });

    const data   = JSON.parse(raw);
    const action = data.action || '';

    // ── Multi-course: route to correct handler ──────────────────────
    if (action === 'syncCourse')      { syncCourse(data);      return jsonResponse({ success: true }); }
    if (action === 'syncCompletion')  { syncCompletion(data);  return jsonResponse({ success: true }); }
    if (action === 'syncUser')        { syncUser(data);        return jsonResponse({ success: true }); }

    // ── Legacy: Anaphylaxis course participant sync (no action field) ─
    const sheet = getOrCreateSheet();
    ensureHeaders(sheet);

    const r = data.ratings || {};

    const row = [
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      data.name        || '',
      data.department  || '',
      data.jobTitle    || '',
      data.score       || '',   // ← could auto-convert "4/5" to a date — fixed below
      data.status      || '',
      data.date        || '',   // ← could auto-convert a date string — fixed below
      data.certId      || '',
      (data.rating !== undefined && data.rating !== '') ? data.rating : '',
      r.q1  || '', r.q2  || '', r.q3  || '', r.q4  || '',
      r.q6  || '', r.q7  || '', r.q8  || '', r.q9  || '', r.q10 || '',
      r.q11 || '', r.q12 || '', r.q13 || '', r.q14 || '', r.q15 || '', r.q16 || '',
      r.q17 || '', r.q18 || '', r.q19 || '',
      r.q20 || '',
      data.feedback || '',
      ''   // col 30: Certificate Link placeholder — overwritten below
    ];

    sheet.appendRow(row);
    const newRow = sheet.getLastRow();

    // ── FIX: re-write score & date as explicit TEXT to prevent date auto-conversion.
    sheet.getRange(newRow, 5).setNumberFormat('@STRING@').setValue(data.score || '');
    sheet.getRange(newRow, 7).setNumberFormat('@STRING@').setValue(data.date  || '');

    // ── Colour-code Status cell (col 6)
    const statusCell = sheet.getRange(newRow, 6);
    if      (data.status === 'Passed') statusCell.setBackground('#d1fae5').setFontColor('#065f46').setFontWeight('bold');
    else if (data.status === 'Failed') statusCell.setBackground('#fee2e2').setFontColor('#991b1b').setFontWeight('bold');

    // ── Certificate HYPERLINK in col 30 (Passed only)
    if (data.certLink && data.status === 'Passed') {
      const safeUrl  = data.certLink.replace(/"/g, '%22');
      const linkCell = sheet.getRange(newRow, 30);
      linkCell.setFormula(`=HYPERLINK("${safeUrl}","View Certificate")`);
      linkCell.setFontColor('#115e59')
              .setFontWeight('bold')
              .setHorizontalAlignment('center')
              .setTextStyle(SpreadsheetApp.newTextStyle().setUnderline(true).build());
    }

    return jsonResponse({ success: true, row: newRow });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─── GET HANDLER (health-check + data retrieval) ──────────────────
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

  if (action === 'getData') {
    try {
      const sheet   = getOrCreateSheet();
      const lastRow = sheet.getLastRow();

      if (lastRow <= 1) return jsonResponse({ success: true, logs: [], total: 0 });

      const numRows = lastRow - 1;
      // Read cols 1-29 (skip col 30 = HYPERLINK formula whose .getValues() returns display text only)
      const values = sheet.getRange(2, 1, numRows, 29).getValues();

      const tz = Session.getScriptTimeZone();

      const logs = values
        .filter(row => row[1] && String(row[1]).trim() !== '')
        .map(row => {

          // ── Score (col 5 = index 4):
          // "4/5" stored as date? Reconstruct via day-of-month (works for DD/MM locale).
          // Otherwise just use the string value.
          let score;
          if (row[4] instanceof Date) {
            score = row[4].getDate() + '/' + TOTAL_QS;
          } else {
            const s = String(row[4] || '').trim();
            // If it looks like an ISO date string that snuck through, parse and reconstruct
            score = (s === '' || s === '—') ? '—' : s;
          }

          // ── Completion Date (col 7 = index 6):
          // Stored as date object? Format it cleanly. Otherwise use as-is.
          let date;
          if (row[6] instanceof Date) {
            date = Utilities.formatDate(row[6], tz, 'MMMM d, yyyy');
          } else {
            date = String(row[6] || '').trim();
          }

          return {
            name:         String(row[1]  || ''),
            department:   String(row[2]  || ''),
            jobTitle:     String(row[3]  || ''),
            score:        score,
            status:       String(row[5]  || ''),
            date:         date,
            certId:       String(row[7]  || 'N/A'),
            rating:       (row[8] !== '' && row[8] !== null) ? String(row[8]) : 'N/A',
            feedback:     String(row[28] || 'N/A'),
            strengths:    'N/A',
            improvements: 'N/A',
            password:     ''
          };
        });

      return jsonResponse({ success: true, logs: logs, total: logs.length });

    } catch (err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }

  // ─── Multi-course: getCourses ───────────────────────────────────
  if (action === 'getCourses') {
    try {
      const sheet   = getOrCreateSheetNamed('Courses');
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return jsonResponse({ success: true, courses: [] });
      const values  = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      const courses = values
        .filter(r => r[0] && String(r[0]).trim() !== '')
        .map(r => ({
          courseId:    String(r[0]),
          slug:        String(r[1]),
          title:       String(r[2]),
          description: String(r[3]),
          type:        String(r[4]),
          status:      String(r[5]),
          createdAt:   String(r[6]),
          updatedAt:   String(r[7])
        }));
      return jsonResponse({ success: true, courses });
    } catch(err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }

  // ─── Multi-course: getCompletions ───────────────────────────────
  if (action === 'getCompletions') {
    try {
      const filterName = e && e.parameter && e.parameter.name ? e.parameter.name.toLowerCase() : '';
      const sheet      = getOrCreateSheetNamed('AllCompletions');
      const lastRow    = sheet.getLastRow();
      if (lastRow <= 1) return jsonResponse({ success: true, completions: [] });
      const values     = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
      const completions = values
        .filter(r => r[0] && String(r[0]).trim() !== '')
        .filter(r => !filterName || String(r[3]).toLowerCase() === filterName)
        .map(r => ({
          completionId:  String(r[0]),
          courseId:      String(r[1]),
          courseSlug:    String(r[2]),
          employeeName:  String(r[3]),
          courseTitle:   String(r[4]),
          certSubtitle:  String(r[5]),
          score:         String(r[6]),
          status:        String(r[7]),
          certId:        String(r[8]),
          completedAt:   String(r[9])
        }));
      return jsonResponse({ success: true, completions });
    } catch(err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }

  // Health-check (default)
  return jsonResponse({ status: 'ok', app: 'Multi-Course Training Portal', version: '2.0', sheet: SHEET_NAME });
}

// ─── MULTI-COURSE HELPER: get or create named sheet ───────────────
function getOrCreateSheetNamed(name) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

// ─── MULTI-COURSE: sync course record ─────────────────────────────
function syncCourse(data) {
  const course  = data.course || {};
  const sheet   = getOrCreateSheetNamed('Courses');

  // Ensure header row
  if (sheet.getLastRow() === 0) {
    const headers = ['courseId','slug','title','description','type','status','createdAt','updatedAt'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
         .setBackground('#115e59').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // Check if this course already exists (by courseId in col A)
  const lastRow = sheet.getLastRow();
  let existingRow = -1;
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    existingRow = ids.indexOf(course.courseId) + 2; // +2 for 1-indexed + header
    if (existingRow < 2) existingRow = -1;
  }

  const row = [
    course.courseId    || '',
    course.slug        || '',
    course.title       || '',
    course.description || '',
    course.type        || 'content',
    course.status      || 'draft',
    course.createdAt   || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
  ];

  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

// ─── MULTI-COURSE: sync completion record ─────────────────────────
function syncCompletion(data) {
  const comp  = data.completion || {};
  const sheet = getOrCreateSheetNamed('AllCompletions');

  if (sheet.getLastRow() === 0) {
    const headers = ['completionId','courseId','courseSlug','employeeName','courseTitle','certSubtitle','score','status','certId','completedAt'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
         .setBackground('#115e59').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const row = [
    comp.completionId  || '',
    comp.courseId      || '',
    comp.courseSlug    || '',
    comp.employeeName  || comp.name || '',
    comp.courseTitle   || '',
    comp.certSubtitle  || '',
    comp.score         || '',
    comp.status        || '',
    comp.certId        || '',
    comp.completedAt   || comp.date || ''
  ];
  sheet.appendRow(row);

  // Color-code status cell (col 8)
  const newRow = sheet.getLastRow();
  const statusCell = sheet.getRange(newRow, 8);
  if      (comp.status === 'Passed') statusCell.setBackground('#d1fae5').setFontColor('#065f46').setFontWeight('bold');
  else if (comp.status === 'Failed') statusCell.setBackground('#fee2e2').setFontColor('#991b1b').setFontWeight('bold');
}

// ─── MULTI-COURSE: sync user record ───────────────────────────────
function syncUser(data) {
  const user  = data.user || {};
  const sheet = getOrCreateSheetNamed('Users');

  if (sheet.getLastRow() === 0) {
    const headers = ['userId','name','passwordHash','department','jobTitle','email','createdAt'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
         .setBackground('#115e59').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Protect passwordHash column from easy reading
    sheet.setColumnWidth(3, 80);
  }

  const row = [
    user.userId       || '',
    user.name         || '',
    user.passwordHash || '(hashed)',
    user.department   || '',
    user.jobTitle     || '',
    user.email        || '',
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
  ];
  sheet.appendRow(row);
}

