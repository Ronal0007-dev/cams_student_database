const express = require('express');
const router = express.Router();
const { Student, Class, Stream, Department, Graduated } = require('../models');
const { Op } = require('sequelize');
const { isAdminOrTeacher, isAdmin } = require('../middleware/auth');
const { generateAdmissionNumber } = require('../config/admissionNumber');

const PAGE_SIZE = 20;

function buildWhere(q) {
  const where = {};
  if (q.search)  where.StudentFullName = { [Op.like]: `%${q.search}%` };
  if (q.classId) where.ClassID = q.classId;
  if (q.status)  where.Status  = q.status;
  if (q.gender)  where.Gender  = q.gender;
  return where;
}


// ── Sync student graduation status ──────────────────────────────
// Called after any status change; keeps graduated table in sync
async function syncGraduated(student) {
  if (!student) return;
  const cls    = student.Class  || await student.getClass({ include: [{ model: Department, as: 'Department' }] });
  const stream = student.Stream || (student.StmID ? await student.getStream() : null);

  if (student.Status === 'Completed') {
    // Upsert into graduated table
    await Graduated.upsert({
      StudentID:      student.StudentID,
      StudentFullName:student.StudentFullName,
      AdmissionNumber:student.AdmissionNumber,
      Gender:         student.Gender,
      DateOfBirth:    student.DateOfBirth,
      ParentPhone:    student.ParentPhone,
      ParentEmail:    student.ParentEmail,
      Address:        student.Address,
      ClassID:        student.ClassID,
      ClassName:      cls  ? cls.ClassName  : null,
      StmID:          student.StmID,
      StreamName:     stream ? stream.StmName : null,
      DepartmentName: cls && cls.Department ? cls.Department.DeptName : null,
      AdmissionDate:  student.AdmissionDate,
      GraduationDate: new Date(),
      Status:         'Completed'
    });
  } else {
    // No longer Completed — remove from graduated table
    await Graduated.destroy({ where: { StudentID: student.StudentID } });
  }
}

// ── GET /students ──
router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    // Exclude completed — they live in the graduated table
    const baseExclude = { Status: { [Op.ne]: 'Completed' } };
    const where = { ...baseExclude, ...buildWhere(req.query) };

    const { count, rows: students } = await Student.findAndCountAll({
      where,
      include: [
        { model: Class,  as: 'Class',  attributes: ['ClassName'] },
        { model: Stream, as: 'Stream', attributes: ['StmName']  }
      ],
      order: [['StudentFullName', 'ASC']],
      limit:  PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    });

    const classes    = await Class.findAll({ order: [['Level','ASC'],['ClassName','ASC']] });
    const totalPages = Math.ceil(count / PAGE_SIZE);

    res.render('admin/students/index', {
      title: 'Students — SMS',
      students, classes, count, totalPages,
      currentPage: page, pageSize: PAGE_SIZE,
      query: req.query
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load students');
    res.redirect('/dashboard');
  }
});

// ── GET /students/print ──
router.get('/print', async (req, res) => {
  try {
    const where    = buildWhere(req.query);
    const students = await Student.findAll({
      where,
      include: [
        { model: Class,  as: 'Class',  attributes: ['ClassName'],
          include: [{ model: Department, as: 'Department', attributes: ['DeptName'] }] },
        { model: Stream, as: 'Stream', attributes: ['StmName'] }
      ],
      order: [['StudentFullName', 'ASC']]
    });
    const classes = await Class.findAll({ order: [['Level','ASC'],['ClassName','ASC']] });
    res.render('admin/students/print', {
      title: 'Print Students', students, classes, query: req.query,
      printDate: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })
    });
  } catch (err) {
    console.error(err);
    res.redirect('/students');
  }
});

// ── GET /students/new ──
router.get('/new', isAdminOrTeacher, async (req, res) => {
  try {
    const [classes, nextAdmNo] = await Promise.all([
      Class.findAll({
        include: [{ model: Stream, as: 'Streams' }],
        order: [['Level','ASC'],['ClassName','ASC']]
      }),
      generateAdmissionNumber()
    ]);
    res.render('admin/students/form', {
      title: 'Add Student', student: null, classes,
      action: '/students', nextAdmNo
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load form');
    res.redirect('/students');
  }
});

// ── POST /students/bulk/move  *** MUST be before /:id routes *** ──
router.post('/bulk/move', isAdmin, async (req, res) => {
  try {
    const { fromClassID, toClassID, toStmID, setStatus } = req.body;

    if (!fromClassID || !toClassID) {
      req.flash('error', 'Please select both source and destination class');
      return res.redirect('/students');
    }
    if (fromClassID === toClassID) {
      req.flash('error', 'Source and destination class cannot be the same');
      return res.redirect('/students');
    }

    const beforeCount = await Student.count({ where: { ClassID: fromClassID, Status: 'Ongoing' } });
    if (beforeCount === 0) {
      req.flash('error', 'No ongoing students found in the selected class');
      return res.redirect('/students');
    }

    const updateData = { ClassID: toClassID, StmID: toStmID || null };
    if (setStatus) updateData.Status = setStatus;

    await Student.update(updateData, { where: { ClassID: fromClassID, Status: 'Ongoing' } });

    const toClass = await Class.findByPk(toClassID);
    req.flash('success',
      `✅ ${beforeCount} student(s) successfully promoted to ${toClass ? toClass.ClassName : 'new class'}`
    );
    res.redirect(`/students?classId=${toClassID}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to promote class: ' + err.message);
    res.redirect('/students');
  }
});

// ── API: class student count (for promote preview) ──
router.get('/api/class-count/:classId', async (req, res) => {
  try {
    const count = await Student.count({ where: { ClassID: req.params.classId, Status: 'Ongoing' } });
    const cls   = await Class.findByPk(req.params.classId, { attributes: ['ClassName'] });
    res.json({ count, className: cls ? cls.ClassName : '' });
  } catch (err) {
    res.json({ count: 0, className: '' });
  }
});

// ── API: next admission number (called by form via fetch) ──
router.get('/api/next-adm-no', isAdminOrTeacher, async (req, res) => {
  try {
    const admNo = await generateAdmissionNumber();
    res.json({ admNo });
  } catch (err) {
    res.json({ admNo: '' });
  }
});

// ── POST /students ──
router.post('/', isAdminOrTeacher, async (req, res) => {
  try {
    const {
      StudentFullName, ParentPhone, ParentEmail, ClassID, StmID, Gender,
      Status, DateOfBirth, Address, AdmissionDate
    } = req.body;

    // Always generate server-side — never trust client-submitted admission number
    const AdmissionNumber = await generateAdmissionNumber();

    await Student.create({
      StudentFullName, ParentPhone, ParentEmail,
      ClassID, StmID: StmID || null,
      Gender, Status: Status || 'Ongoing',
      DateOfBirth, Address, AdmissionNumber,
      AdmissionDate: AdmissionDate || new Date()
    });

    const created = await Student.findByPk((await Student.findOne({ where: { AdmissionNumber }, order: [['createdAt','DESC']] })).StudentID, {
      include: [{ model: Class, as: 'Class', include: [{ model: Department, as: 'Department' }] }, { model: Stream, as: 'Stream' }]
    });
    await syncGraduated(created);
    req.flash('success', `Student added — Admission No: ${AdmissionNumber}`);
    res.redirect('/students');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to add student: ' + err.message);
    res.redirect('/students/new');
  }
});

// ── GET /students/:id/print — individual student print card ──
router.get('/:id/print', async (req, res) => {
  try {
    const student = await Student.findByPk(req.params.id, {
      include: [
        { model: Class,  as: 'Class',  include: [{ model: Department, as: 'Department' }] },
        { model: Stream, as: 'Stream' }
      ]
    });
    if (!student) { req.flash('error','Student not found'); return res.redirect('/students'); }
    res.render('admin/students/print-single', {
      title: `Print — ${student.StudentFullName}`,
      student,
      printDate: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })
    });
  } catch (err) {
    req.flash('error','Failed to load student');
    res.redirect('/students');
  }
});

// ── GET /students/:id ──
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findByPk(req.params.id, {
      include: [
        { model: Class,  as: 'Class',  include: [{ model: Department, as: 'Department' }] },
        { model: Stream, as: 'Stream' }
      ]
    });
    if (!student) { req.flash('error','Student not found'); return res.redirect('/students'); }
    res.render('admin/students/view', { title: student.StudentFullName, student });
  } catch (err) {
    req.flash('error','Failed to load student');
    res.redirect('/students');
  }
});

// ── GET /students/:id/edit ──
router.get('/:id/edit', isAdminOrTeacher, async (req, res) => {
  try {
    const [student, classes] = await Promise.all([
      Student.findByPk(req.params.id),
      Class.findAll({
        include: [{ model: Stream, as: 'Streams' }],
        order: [['Level','ASC'],['ClassName','ASC']]
      })
    ]);
    if (!student) { req.flash('error','Student not found'); return res.redirect('/students'); }
    res.render('admin/students/form', {
      title: 'Edit Student', student, classes,
      action: `/students/${student.StudentID}?_method=PUT`,
      nextAdmNo: null   // edit mode — show existing number, locked
    });
  } catch (err) {
    req.flash('error','Error loading form');
    res.redirect('/students');
  }
});

// ── PUT /students/:id ──
router.put('/:id', isAdminOrTeacher, async (req, res) => {
  try {
    const {
      StudentFullName, ParentPhone, ParentEmail, ClassID, StmID, Gender,
      Status, DateOfBirth, Address, AdmissionDate
    } = req.body;
    // AdmissionNumber is NEVER updated — it's locked once assigned
    await Student.update({
      StudentFullName, ParentPhone, ParentEmail,
      ClassID, StmID: StmID || null,
      Gender, Status, DateOfBirth, Address, AdmissionDate
    }, { where: { StudentID: req.params.id } });
    const updated = await Student.findByPk(req.params.id, {
      include: [{ model: Class, as: 'Class', include: [{ model: Department, as: 'Department' }] }, { model: Stream, as: 'Stream' }]
    });
    if (updated) await syncGraduated(updated);
    req.flash('success','Student updated successfully');
    res.redirect('/students');
  } catch (err) {
    req.flash('error','Failed to update student');
    res.redirect(`/students/${req.params.id}/edit`);
  }
});

// ── DELETE /students/:id ──
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    await Student.destroy({ where: { StudentID: req.params.id } });
    await Graduated.destroy({ where: { StudentID: req.params.id } });
    req.flash('success','Student deleted');
    res.redirect('/students');
  } catch (err) {
    req.flash('error','Failed to delete student');
    res.redirect('/students');
  }
});

// ── POST /students/:id/move ──
router.post('/:id/move', isAdminOrTeacher, async (req, res) => {
  try {
    const { newClassID, newStmID, newStatus } = req.body;
    const updateData = { ClassID: newClassID, StmID: newStmID || null };
    if (newStatus) updateData.Status = newStatus;
    await Student.update(updateData, { where: { StudentID: req.params.id } });
    const moved = await Student.findByPk(req.params.id, {
      include: [{ model: Class, as: 'Class', include: [{ model: Department, as: 'Department' }] }, { model: Stream, as: 'Stream' }]
    });
    if (moved) await syncGraduated(moved);
    req.flash('success','Student moved successfully');
    res.redirect('/students');
  } catch (err) {
    req.flash('error','Failed to move student');
    res.redirect('/students');
  }
});

module.exports = router;
