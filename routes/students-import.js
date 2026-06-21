/**
 * SMS — Bulk Student Import via CSV
 * ───────────────────────────────────
 * Drop this file into routes/ and register in app.js:
 *   app.use('/students', isAuthenticated, require('./routes/students-import'));
 *   (mount BEFORE your existing students route so /students/import-csv is matched first)
 *
 * Or add these routes directly into your existing routes/students.js
 */

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
// csv-parse v5+ uses subpath exports — fallback-safe require:
let parse;
try { ({ parse } = require('csv-parse/sync')); }
catch(_) { ({ parse } = require('csv-parse/dist/cjs/sync.cjs')); }
const { Student, Class, Stream, Department, Graduated, Transferred } = require('../models');
const { isAdmin, isAdminOrTeacher } = require('../middleware/auth');
const { generateAdmissionNumber }   = require('../config/admissionNumber');

// ── Multer — accept only CSV, store in temp ──
const csvUpload = multer({
  storage: multer.memoryStorage(),           // keep in RAM, no temp file needed
  limits:  { fileSize: 5 * 1024 * 1024 },   // 5 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
}).single('csvFile');

// ── Sync helper (same as in students.js) ──
async function syncSpecialStatus(student) {
  if (!student) return;
  const s = await Student.findByPk(
    typeof student === 'object' ? student.StudentID : student,
    {
      include: [
        { model: Class,  as: 'Class',  include: [{ model: Department, as: 'Department' }] },
        { model: Stream, as: 'Stream' }
      ]
    }
  );
  if (!s) return;

  const clsName  = s.Class  ? s.Class.ClassName  : null;
  const stmName  = s.Stream ? s.Stream.StmName   : null;
  const deptName = s.Class && s.Class.Department ? s.Class.Department.DeptName : null;

  if (s.Status === 'Completed') {
    await Graduated.upsert({
      StudentID: s.StudentID, StudentFullName: s.StudentFullName,
      AdmissionNumber: s.AdmissionNumber, Gender: s.Gender,
      DateOfBirth: s.DateOfBirth, ParentPhone: s.ParentPhone,
      ParentEmail: s.ParentEmail, Address: s.Address,
      ClassID: s.ClassID, ClassName: clsName,
      StmID: s.StmID, StreamName: stmName, DepartmentName: deptName,
      AdmissionDate: s.AdmissionDate, GraduationDate: new Date(), Status: 'Completed'
    });
    await Transferred.destroy({ where: { StudentID: s.StudentID } });
  } else if (s.Status === 'Transferred') {
    await Transferred.upsert({
      StudentID: s.StudentID, StudentFullName: s.StudentFullName,
      AdmissionNumber: s.AdmissionNumber, Gender: s.Gender,
      DateOfBirth: s.DateOfBirth, ParentPhone: s.ParentPhone,
      ParentEmail: s.ParentEmail, Address: s.Address,
      ClassID: s.ClassID, ClassName: clsName,
      StmID: s.StmID, StreamName: stmName, DepartmentName: deptName,
      AdmissionDate: s.AdmissionDate, TransferDate: new Date(), Status: 'Transferred'
    });
    await Graduated.destroy({ where: { StudentID: s.StudentID } });
  } else {
    await Graduated.destroy({   where: { StudentID: s.StudentID } });
    await Transferred.destroy({ where: { StudentID: s.StudentID } });
  }
}

// ── Helper: resolve ClassName → ClassID ──
async function resolveClassID(name, cache) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const cls = await Class.findOne({ where: { ClassName: name.trim() } });
  const id  = cls ? cls.ClassID : null;
  cache.set(key, id);
  return id;
}

// ── Helper: resolve StreamName → StmID ──
async function resolveStmID(name, classID, cache) {
  if (!name || !classID) return null;
  const key = `${classID}:${name.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  const stm = await Stream.findOne({ where: { StmName: name.trim(), ClassID: classID } });
  const id  = stm ? stm.StmID : null;
  cache.set(key, id);
  return id;
}

// ── GET /students/template — download CSV template ──
router.get('/template', isAdminOrTeacher, (req, res) => {
  const headers = [
    'StudentFullName',
    'Gender',
    'DateOfBirth',
    'AdmissionDate',
    'ClassName',
    'StreamName',
    'ParentPhone',
    'ParentEmail',
    'Address',
    'Status'
  ];

  const exampleRow = [
    'John Michael Doe',
    'Male',
    '2010-03-15',
    '2024-01-10',
    'Form 1',
    'Stream A',
    '+255712345678',
    'john.parent@email.com',
    '123 Main St, Dodoma',
    'Ongoing'
  ];

  const notes = [
    '# SMS Student Import Template',
    '# ─────────────────────────────────────────────────────────────────────────',
    '# INSTRUCTIONS:',
    '# 1. Do NOT change the column headers in row 4 (below these notes)',
    '# 2. Delete these comment rows (starting with #) before uploading',
    '# 3. One student per row. Save as CSV (UTF-8) before uploading.',
    '#',
    '# FIELD RULES:',
    '# StudentFullName : Required. Full name of the student.',
    '# Gender          : Required. Must be exactly "Male" or "Female"',
    '# DateOfBirth     : Optional. Format: YYYY-MM-DD  e.g. 2010-03-15',
    '# AdmissionDate   : Optional. Format: YYYY-MM-DD  e.g. 2024-01-10',
    '# ClassName       : Required. Must match an existing class name exactly e.g. "Form 1"',
    '# StreamName      : Optional. Must match an existing stream in the class e.g. "Stream A"',
    '# ParentPhone     : Optional. e.g. +255712345678',
    '# ParentEmail     : Optional. Valid email address.',
    '# Address         : Optional. Home address.',
    '# Status          : Optional. One of: Ongoing, Completed, Transferred. Defaults to Ongoing.',
    '#',
    '# NOTE: AdmissionNumber is auto-generated — do NOT add it as a column.',
    '# ─────────────────────────────────────────────────────────────────────────'
  ];

  const csvLines = [
    ...notes,
    headers.join(','),
    exampleRow.map(v => `"${v}"`).join(',')
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sms_student_import_template.csv"');
  res.send('\uFEFF' + csvLines.join('\r\n')); // BOM for Excel compatibility
});

// ── GET /students/import-csv — show import page ──
router.get('/import-csv', isAdminOrTeacher, async (req, res) => {
  try {
    const classes = await Class.findAll({
      include: [{ model: Stream, as: 'Streams' }],
      order: [['Level','ASC'],['ClassName','ASC']]
    });
    res.render('admin/students/import', {
      title: 'Import Students — SMS',
      classes,
      result: null
    });
  } catch (err) {
    req.flash('error', 'Failed to load import page');
    res.redirect('/students');
  }
});

// ── POST /students/import-csv — process CSV upload ──
router.post('/import-csv', isAdminOrTeacher, (req, res, next) => {
  csvUpload(req, res, async (uploadErr) => {
    const classes = await Class.findAll({
      include: [{ model: Stream, as: 'Streams' }],
      order: [['Level','ASC'],['ClassName','ASC']]
    });

    if (uploadErr) {
      return res.render('admin/students/import', {
        title: 'Import Students — SMS', classes,
        result: { error: uploadErr.message }
      });
    }

    if (!req.file) {
      return res.render('admin/students/import', {
        title: 'Import Students — SMS', classes,
        result: { error: 'No file uploaded. Please select a CSV file.' }
      });
    }

    try {
      const raw = req.file.buffer.toString('utf8').replace(/^\uFEFF/, ''); // strip BOM

      // Filter out comment lines starting with #
      const lines = raw.split(/\r?\n/)
        .filter(l => l.trim() && !l.trim().startsWith('#'))
        .join('\n');

      // Parse CSV
      let records;
      try {
        records = parse(lines, {
          columns:          true,
          skip_empty_lines: true,
          trim:             true,
          relax_column_count: true
        });
      } catch (parseErr) {
        return res.render('admin/students/import', {
          title: 'Import Students — SMS', classes,
          result: { error: 'CSV parse error: ' + parseErr.message }
        });
      }

      if (records.length === 0) {
        return res.render('admin/students/import', {
          title: 'Import Students — SMS', classes,
          result: { error: 'The CSV file has no data rows.' }
        });
      }

      // Validate required columns
      const required = ['StudentFullName', 'Gender', 'ClassName'];
      const cols = Object.keys(records[0]);
      const missing = required.filter(r => !cols.includes(r));
      if (missing.length) {
        return res.render('admin/students/import', {
          title: 'Import Students — SMS', classes,
          result: { error: `Missing required columns: ${missing.join(', ')}. Please use the template.` }
        });
      }

      // Process each row
      const classCache  = new Map();
      const streamCache = new Map();

      const imported = [];
      const skipped  = [];

      for (let i = 0; i < records.length; i++) {
        const row    = records[i];
        const rowNum = i + 1;

        // ── Validate required fields ──
        if (!row.StudentFullName || !row.StudentFullName.trim()) {
          skipped.push({ row: rowNum, name: '(blank)', reason: 'StudentFullName is required' });
          continue;
        }
        const gender = row.Gender ? row.Gender.trim() : '';
        if (!['Male', 'Female'].includes(gender)) {
          skipped.push({ row: rowNum, name: row.StudentFullName, reason: `Invalid Gender "${gender}" — must be Male or Female` });
          continue;
        }

        // ── Resolve class ──
        const classID = await resolveClassID(row.ClassName, classCache);
        if (!classID) {
          skipped.push({ row: rowNum, name: row.StudentFullName, reason: `Class "${row.ClassName}" not found` });
          continue;
        }

        // ── Resolve stream (optional) ──
        const stmID = row.StreamName
          ? await resolveStmID(row.StreamName, classID, streamCache)
          : null;

        if (row.StreamName && row.StreamName.trim() && !stmID) {
          skipped.push({ row: rowNum, name: row.StudentFullName, reason: `Stream "${row.StreamName}" not found in class "${row.ClassName}"` });
          continue;
        }

        // ── Validate status ──
        const validStatuses = ['Ongoing', 'Completed', 'Transferred'];
        const status = validStatuses.includes(row.Status) ? row.Status : 'Ongoing';

        // ── Validate dates ──
        const dob  = row.DateOfBirth   && /^\d{4}-\d{2}-\d{2}$/.test(row.DateOfBirth.trim())   ? row.DateOfBirth.trim()   : null;
        const admD = row.AdmissionDate && /^\d{4}-\d{2}-\d{2}$/.test(row.AdmissionDate.trim())  ? row.AdmissionDate.trim() : new Date().toISOString().split('T')[0];

        // ── Generate admission number ──
        const admNo = await generateAdmissionNumber();

        // ── Create student ──
        try {
          const created = await Student.create({
            StudentFullName: row.StudentFullName.trim(),
            Gender:         gender,
            DateOfBirth:    dob,
            AdmissionDate:  admD,
            ClassID:        classID,
            StmID:          stmID,
            ParentPhone:    row.ParentPhone    ? row.ParentPhone.trim()    : null,
            ParentEmail:    row.ParentEmail    ? row.ParentEmail.trim()    : null,
            Address:        row.Address        ? row.Address.trim()        : null,
            Status:         status,
            AdmissionNumber: admNo
          });

          await syncSpecialStatus(created);
          imported.push({ row: rowNum, name: row.StudentFullName, admNo, cls: row.ClassName });
        } catch (createErr) {
          skipped.push({ row: rowNum, name: row.StudentFullName, reason: 'DB error: ' + createErr.message });
        }
      }

      return res.render('admin/students/import', {
        title: 'Import Students — SMS', classes,
        result: {
          total:    records.length,
          imported: imported.length,
          skipped:  skipped.length,
          rows:     imported,
          errors:   skipped
        }
      });

    } catch (err) {
      console.error('CSV import error:', err);
      return res.render('admin/students/import', {
        title: 'Import Students — SMS', classes,
        result: { error: 'Import failed: ' + err.message }
      });
    }
  });
});

module.exports = router;
