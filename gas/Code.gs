/**
 * ANAPHYLAXIS COURSE – GOOGLE SHEETS SYNC
 * =========================================
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
 * 8. Paste URL in course Admin Panel → Google Sheets Sync → Connect
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

// ─── POST HANDLER ─────────────────────────────────────────────────
function doPost(e) {
  try {
    const raw = e.postData ? e.postData.contents : null;
    if (!raw) return jsonResponse({ success: false, error: 'No data received' });

    const data = JSON.parse(raw);
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
    // appendRow already wrote them, but Sheets may have silently converted them.
    // Setting @STRING@ format then re-calling setValue forces the cell to plain text.
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

  // Health-check (default)
  return jsonResponse({ status: 'ok', app: 'Anaphylaxis Course Sync', version: '1.3', sheet: SHEET_NAME });
}
