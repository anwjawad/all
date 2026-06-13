# Multi-Course Training Portal — Admin Guide

## Overview

The portal supports multiple training courses served from a single static site. The **Anaphylaxis Recognition & Management** course is the original "legacy" course and runs exactly as it always has. Additional courses can be created, published, and shared from the Admin Dashboard.

---

## URLs

| Page | URL |
|------|-----|
| Anaphylaxis course (legacy) | `index.html` or `index.html?course=anaphylaxis` |
| Any other course | `index.html?course=<slug>` |
| Admin dashboard | `admin.html` |
| Employee certificates | `certificates.html` |

On **GitHub Pages** the full URL would be, for example:
```
https://<your-org>.github.io/<repo>/index.html?course=hand-hygiene
https://<your-org>.github.io/<repo>/admin.html
https://<your-org>.github.io/<repo>/certificates.html
```

---

## Admin Login

1. Open `admin.html` in your browser.
2. Enter your admin name and email (credentials are set inside `admin.js → ADMIN_CREDENTIALS`).
3. The session is stored in `sessionStorage` and clears when the tab is closed.

---

## Creating a New Course

1. In the Admin Dashboard, click **Courses** in the sidebar.
2. Click **+ New Course**.
3. Fill in the required fields:

| Field | Description |
|-------|-------------|
| Title | Displayed in the portal header and on the certificate |
| URL Slug | Lowercase, hyphenated identifier used in the `?course=` URL param (e.g. `hand-hygiene`) |
| Description | Short summary shown on the course overview card |
| Duration | Estimated completion time (e.g. `45 minutes`) |
| Type | `content` (text pages built in admin) or `slides` (static slide images) |
| Pass Threshold % | Minimum percentage to pass the exam (default 80%) |
| Video URL | Optional YouTube embed URL (e.g. `https://www.youtube.com/embed/XXXXX`). Leave blank to skip the video step. |
| Certificate Title | Course name that appears on the certificate |
| Certificate Subtitle | Subtitle line on the certificate (e.g. `1.0 Contact Hour`) |

4. **Content Pages** (for `content` type): add one page per card — each page has a title and rich-text body.
5. **Exam Questions**: add at least one question. Each question needs a text, four answer options (A–D), and the correct answer letter.
6. Click **Save Course** to save as a draft.
7. Click **Publish** to make the course accessible via its URL.

---

## Sharing a Course Link

1. In the Courses tab, find the course and click **Share Link**.
2. Copy the generated URL and send it to participants.
3. Participants who open that URL see **only** that course — they cannot navigate to the admin area or other courses.

---

## Employee Certificates Page

Employees visit `certificates.html` and enter:
- **Full Name** — exactly as registered during the course
- **Password** — the password they set during registration

The page shows all certificates the employee has earned across **all** courses on this portal.

Certificates from the original anaphylaxis course (pre-multi-course) are also visible here, as long as they were completed on the same browser/device.

---

## Google Sheets Sync

### One-Time Setup

1. Open your Google Sheet.
2. Click **Extensions → Apps Script**.
3. Delete all existing content and paste the entire contents of `gas/Code.gs`.
4. Click **Save** (Ctrl+S), then **Deploy → New deployment**.
5. Set Type: **Web App**, Execute as: **Me**, Who has access: **Anyone**.
6. Click **Deploy**, authorize, and copy the Web App URL.
7. In the Admin Dashboard → **Settings** → paste the URL in **Google Sheets Sync URL** → click **Save**.

### Sheet Tabs Created Automatically

| Tab | Contents |
|-----|----------|
| Course Participants | Legacy anaphylaxis course completions (original format, unchanged) |
| Courses | One row per course created in the admin |
| AllCompletions | Cross-course completion records |
| Users | Employee accounts (password column stores SHA-256 hash) |

### What Gets Synced

- **Course created/updated**: syncs to `Courses` tab when saved in admin
- **Participant completes a course**: syncs to `AllCompletions` tab
- **Anaphylaxis course completion**: also syncs to `Course Participants` tab (legacy format)

---

## Password Security

Passwords entered during course registration are hashed using **SHA-256** (via the Web Crypto API) before being stored in `localStorage` and synced to Google Sheets. The plain-text password is never written to storage.

The `certificates.html` login verifies the entered password by hashing it and comparing against the stored hash. Legacy anaphylaxis records that pre-date hashing are handled with a plain-text fallback comparison.

**Note**: SHA-256 is a hash function, not a password-specific KDF. For a production system with a real backend, prefer bcrypt or Argon2. For this static-site architecture, SHA-256 is the strongest option available in the browser.

---

## Deploying to GitHub Pages

1. Push all files to a GitHub repository.
2. In the repo settings, enable **GitHub Pages** from the `main` branch (or `/docs` folder).
3. The `index.html`, `admin.html`, and `certificates.html` pages will be served directly.
4. Because routing is done via `?course=` query parameters (not server-side routes), all pages work without any server configuration.

No build step is required. All assets are vanilla HTML/CSS/JS.

---

## Troubleshooting

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| "Course Not Found" error | Course slug not in `mc_courses` localStorage | Publish the course from the Admin Dashboard |
| No certificates visible | Completed on a different browser/device | Portal uses localStorage — certificates are browser-local |
| Google Sheets sync not working | GAS URL not saved, or GAS not re-deployed after code change | Save the URL in Admin Settings; re-deploy the GAS if Code.gs was updated |
| Admin login not working | Wrong credentials | Check `ADMIN_CREDENTIALS` array in `admin.js` |
| Activity section appears for dynamic course | JS error loading course config | Open browser console; ensure `mc_courses` in localStorage has a valid course object |

---

## Known Limitations

- **localStorage-only persistence**: certificates and completions are stored in the browser. If a user switches devices or clears their browser data, records are lost locally (though they remain in Google Sheets if sync was configured).
- **No real authentication**: admin access is name/email matched against a hardcoded array. For a production deployment, consider adding a proper auth layer.
- **Static site**: courses with `slides` type require slide images to be hosted at a predictable URL (e.g., in the repo's `assets/slides/` folder under a subfolder named after the course slug).

---

## External Auditor Notes

The following design decisions are security-relevant:

1. **Admin page isolation**: `admin.html` is a separate page. Course links point only to `index.html?course=<slug>`. An employee who receives a course link has no path to the admin interface unless they already know the URL.

2. **Password hashing**: The `sha256()` function in `script.js` and `certificates.js` uses `crypto.subtle.digest('SHA-256', ...)`. Passwords are hashed client-side before storage. The raw password is never written to `localStorage`.

3. **Session management**: Admin and certificate-portal sessions use `sessionStorage` (not `localStorage`), so they expire when the browser tab is closed.

4. **No server-side secrets**: There are no API keys, tokens, or credentials embedded in the codebase. The GAS URL is stored in `localStorage` (admin-configurable, not hardcoded in source).

5. **XSS mitigation**: All user-supplied values rendered into HTML pass through `escapeHtml()` before insertion.
