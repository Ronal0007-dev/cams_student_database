# SMS — CSV Bulk Student Import
## Integration Guide

---

## Files to add to your existing project

| Source file (this zip)                | Destination in SMS project              |
|---------------------------------------|-----------------------------------------|
| `routes/students-import.js`           | `routes/students-import.js`             |
| `views/admin/students/import.pug`     | `views/admin/students/import.pug`       |
| `public/csv-import.css`               | Paste contents into `public/css/style.css` |
| `public/templates/*.csv`              | (for reference only — the route generates the template dynamically) |

---

## Step 1 — Install dependency

```bash
npm install csv-parse --save
```

---

## Step 2 — Register the route in `app.js`

Open `app.js` and add the import route **BEFORE** your existing `/students` route:

```js
// Add this line:
app.use('/students', isAuthenticated, require('./routes/students-import'));

// Existing line (must come AFTER):
app.use('/students', isAuthenticated, require('./routes/students'));
```

> **Why before?** Express matches routes in order. The import route handles
> `/students/import-csv` and `/students/template`. If the main students route
> comes first and has a `/:id` param, it would match "import-csv" as an ID.

---

## Step 3 — Add navigation link

In `views/admin/students/index.pug`, find the `.page-actions` block and add:

```pug
a.btn.btn-secondary(href="/students/import-csv")
  i.fas.fa-file-import
  span Import CSV
```

---

## Step 4 — Add CSS

Paste the contents of `public/csv-import.css` at the end of `public/css/style.css`.

---

## How it works

### Template Download (`GET /students/template`)
- Returns a `.csv` file with UTF-8 BOM (Excel-compatible)
- Includes comment rows (starting with `#`) explaining every column
- Has one example row pre-filled

### Import Page (`GET /students/import-csv`)
- Shows step-by-step instructions
- Lists all existing classes and their streams so the user knows exact names to use
- Drag-and-drop or click-to-select CSV upload

### Import Processing (`POST /students/import-csv`)
- Strips BOM and filters `#` comment lines automatically
- Validates required columns exist (StudentFullName, Gender, ClassName)
- Per-row validation:
  - `StudentFullName` — must not be blank
  - `Gender` — must be exactly `Male` or `Female`
  - `ClassName` — must match an existing class (case-sensitive)
  - `StreamName` — if given, must match an existing stream in that class
  - Dates — must be YYYY-MM-DD format, otherwise skipped gracefully
  - `Status` — defaults to `Ongoing` if blank or invalid
- Auto-generates `AdmissionNumber` for every imported student
- Syncs Completed students to `graduated` table, Transferred to `transferred` table
- Shows a results summary: Total / Imported / Skipped, with tables for both

---

## CSV Column Reference

| Column           | Required | Format / Values                     |
|------------------|----------|-------------------------------------|
| StudentFullName  | ✅ Yes   | Full name string                    |
| Gender           | ✅ Yes   | `Male` or `Female` (exact case)    |
| DateOfBirth      | ❌ No    | `YYYY-MM-DD`                        |
| AdmissionDate    | ❌ No    | `YYYY-MM-DD` (defaults to today)   |
| ClassName        | ✅ Yes   | Must match existing class exactly   |
| StreamName       | ❌ No    | Must match existing stream in class |
| ParentPhone      | ❌ No    | Any phone format                    |
| ParentEmail      | ❌ No    | Valid email                         |
| Address          | ❌ No    | Free text                           |
| Status           | ❌ No    | `Ongoing` / `Completed` / `Transferred` |

> Do **NOT** add an `AdmissionNumber` column — it is generated server-side.
