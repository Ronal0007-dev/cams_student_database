const express   = require('express');
const router    = express.Router();
const { Student, Class, Stream, Department, Graduated, Transferred } = require('../models');
const { Op }    = require('sequelize');
const { isAdminOrTeacher, isAdmin } = require('../middleware/auth');
const { generateAdmissionNumber }   = require('../config/admissionNumber');

const PAGE_SIZE = 20;

// ── Only Ongoing students are "visible" in main system ──
// Completed  → graduated   table
// Transferred → transferred table
const ONLY_ONGOING = { Status: 'Ongoing' };

function buildWhere(q) {
  // Always start from ONLY_ONGOING; filters narrow further
  const where = { ...ONLY_ONGOING };
  if (q.search)  where.StudentFullName = { [Op.like]: `%${q.search}%` };
  if (q.classId) where.ClassID = q.classId;
  if (q.gender)  where.Gender  = q.gender;
  return where;
}

// ── Sync student to graduated / transferred tables ────────────────
async function syncSpecialStatus(student) {
  if (!student) return;

  const withAssoc = await Student.findByPk(student.StudentID || student, {
    include: [
      { model: Class,  as: 'Class',  include: [{ model: Department, as: 'Department' }] },
      { model: Stream, as: 'Stream' }
    ]
  });
  if (!withAssoc) return;

  const s        = withAssoc;
  const clsName  = s.Class  ? s.Class.ClassName  : null;
  const stmName  = s.Stream ? s.Stream.StmName   : null;
  const deptName = s.Class  && s.Class.Department ? s.Class.Department.DeptName : null;

  if (s.Status === 'Completed') {
    // Add/update in graduated, remove from transferred
    await Graduated.upsert({
      StudentID: s.StudentID, StudentFullName: s.StudentFullName,
      AdmissionNumber: s.AdmissionNumber, Gender: s.Gender,
      DateOfBirth: s.DateOfBirth, ParentPhone: s.ParentPhone,
      ParentEmail: s.ParentEmail, Address: s.Address,
      ClassID: s.ClassID, ClassName: clsName,
      StmID: s.StmID, StreamName: stmName,
      DepartmentName: deptName,
      AdmissionDate: s.AdmissionDate,
      GraduationDate: new Date(),
      Status: 'Completed'
    });
    await Transferred.destroy({ where: { StudentID: s.StudentID } });

  } else if (s.Status === 'Transferred') {
    // Add/update in transferred, remove from graduated
    await Transferred.upsert({
      StudentID: s.StudentID, StudentFullName: s.StudentFullName,
      AdmissionNumber: s.AdmissionNumber, Gender: s.Gender,
      DateOfBirth: s.DateOfBirth, ParentPhone: s.ParentPhone,
      ParentEmail: s.ParentEmail, Address: s.Address,
      ClassID: s.ClassID, ClassName: clsName,
      StmID: s.StmID, StreamName: stmName,
      DepartmentName: deptName,
      AdmissionDate: s.AdmissionDate,
      TransferDate: new Date(),
      Status: 'Transferred'
    });
    await Graduated.destroy({ where: { StudentID: s.StudentID } });

  } else {
    // Ongoing — remove from both special tables
    await Graduated.destroy({   where: { StudentID: s.StudentID } });
    await Transferred.destroy({ where: { StudentID: s.StudentID } });
  }
}

// ── GET /students — only Ongoing ──
router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const where = buildWhere(req.query);

    const { count, rows: students } = await Student.findAndCountAll({
      where,
      include: [
        { model: Class,  as: 'Class',  attributes: ['ClassName'] },
        { model: Stream, as: 'Stream', attributes: ['StmName']  }
      ],
      order: [['StudentFullName','ASC']],
      limit:  PAGE_SIZE, offset: (page - 1) * PAGE_SIZE
    });

    const classes    = await Class.findAll({ order: [['Level','ASC'],['ClassName','ASC']] });
    const totalPages = Math.ceil(count / PAGE_SIZE);

    res.render('admin/students/index', {
      title: 'Students — SMS', students, classes, count, totalPages,
      currentPage: page, pageSize: PAGE_SIZE, query: req.query
    });
  } catch (err) {
    console.error(err);
    req.flash('error','Failed to load students');
    res.redirect('/dashboard');
  }
});

// ── GET /students/print — only Ongoing ──
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
      order: [['StudentFullName','ASC']]
    });
    const classes = await Class.findAll({ order: [['Level','ASC'],['ClassName','ASC']] });
    res.render('admin/students/print', {
      title: 'Print Students', students, classes, query: req.query,
      printDate: new Date().toLocaleDateString('en-GB',{ day:'2-digit', month:'long', year:'numeric' })
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
      Class.findAll({ include:[{ model:Stream, as:'Streams' }], order:[['Level','ASC'],['ClassName','ASC']] }),
      generateAdmissionNumber()
    ]);
    res.render('admin/students/form', {
      title:'Add Student', student:null, classes, action:'/students', nextAdmNo
    });
  } catch (err) {
    req.flash('error','Failed to load form');
    res.redirect('/students');
  }
});

// ── POST /students/bulk/move  *** BEFORE /:id routes *** ──
router.post('/bulk/move', isAdmin, async (req, res) => {
  try {
    const { fromClassID, toClassID, toStmID, setStatus } = req.body;
    if (!fromClassID || !toClassID) {
      req.flash('error','Select both source and destination class');
      return res.redirect('/students');
    }
    if (fromClassID === toClassID) {
      req.flash('error','Source and destination cannot be the same');
      return res.redirect('/students');
    }
    const beforeCount = await Student.count({ where: { ClassID: fromClassID, Status: 'Ongoing' } });
    if (beforeCount === 0) {
      req.flash('error','No ongoing students found in the selected class');
      return res.redirect('/students');
    }
    const updateData = { ClassID: toClassID, StmID: toStmID || null };
    if (setStatus) updateData.Status = setStatus;
    await Student.update(updateData, { where: { ClassID: fromClassID, Status: 'Ongoing' } });

    // Sync any whose status changed
    if (setStatus && setStatus !== 'Ongoing') {
      const affected = await Student.findAll({ where: { ClassID: toClassID, Status: setStatus } });
      for (const s of affected) await syncSpecialStatus(s);
    }
    const toClass = await Class.findByPk(toClassID);
    req.flash('success', `✅ ${beforeCount} student(s) promoted to ${toClass ? toClass.ClassName : 'new class'}`);
    res.redirect(`/students?classId=${toClassID}`);
  } catch (err) {
    console.error(err);
    req.flash('error','Failed to promote: ' + err.message);
    res.redirect('/students');
  }
});

// ── API: class ongoing count (promote preview) ──
router.get('/api/class-count/:classId', async (req, res) => {
  try {
    const count = await Student.count({ where: { ClassID: req.params.classId, Status: 'Ongoing' } });
    const cls   = await Class.findByPk(req.params.classId, { attributes: ['ClassName'] });
    res.json({ count, className: cls ? cls.ClassName : '' });
  } catch (err) { res.json({ count: 0, className: '' }); }
});

// ── API: next admission number ──
router.get('/api/next-adm-no', isAdminOrTeacher, async (req, res) => {
  try { res.json({ admNo: await generateAdmissionNumber() }); }
  catch (err) { res.json({ admNo: '' }); }
});

// ── POST /students ──
router.post('/', isAdminOrTeacher, async (req, res) => {
  try {
    const { StudentFullName, ParentPhone, ParentEmail, ClassID, StmID, Gender,
            Status, DateOfBirth, Address, AdmissionDate } = req.body;
    const AdmissionNumber = await generateAdmissionNumber();
    const created = await Student.create({
      StudentFullName, ParentPhone, ParentEmail,
      ClassID, StmID: StmID || null,
      Gender, Status: Status || 'Ongoing',
      DateOfBirth, Address, AdmissionNumber,
      AdmissionDate: AdmissionDate || new Date()
    });
    await syncSpecialStatus(created);
    req.flash('success', `Student added — Admission No: ${AdmissionNumber}`);
    res.redirect('/students');
  } catch (err) {
    console.error(err);
    req.flash('error','Failed to add student: ' + err.message);
    res.redirect('/students/new');
  }
});

// ── GET /students/:id/print ──
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
      title: `Print — ${student.StudentFullName}`, student,
      printDate: new Date().toLocaleDateString('en-GB',{ day:'2-digit', month:'long', year:'numeric' })
    });
  } catch (err) { res.redirect('/students'); }
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
  } catch (err) { req.flash('error','Failed to load student'); res.redirect('/students'); }
});

// ── GET /students/:id/edit ──
router.get('/:id/edit', isAdminOrTeacher, async (req, res) => {
  try {
    const [student, classes] = await Promise.all([
      Student.findByPk(req.params.id),
      Class.findAll({ include:[{ model:Stream, as:'Streams' }], order:[['Level','ASC'],['ClassName','ASC']] })
    ]);
    if (!student) { req.flash('error','Student not found'); return res.redirect('/students'); }
    res.render('admin/students/form', {
      title:'Edit Student', student, classes,
      action:`/students/${student.StudentID}?_method=PUT`, nextAdmNo: null
    });
  } catch (err) { req.flash('error','Error loading form'); res.redirect('/students'); }
});

// ── PUT /students/:id ──
router.put('/:id', isAdminOrTeacher, async (req, res) => {
  try {
    const { StudentFullName, ParentPhone, ParentEmail, ClassID, StmID, Gender,
            Status, DateOfBirth, Address, AdmissionDate } = req.body;
    await Student.update({
      StudentFullName, ParentPhone, ParentEmail,
      ClassID, StmID: StmID || null,
      Gender, Status, DateOfBirth, Address, AdmissionDate
    }, { where: { StudentID: req.params.id } });
    await syncSpecialStatus(req.params.id);
    req.flash('success','Student updated successfully');
    res.redirect('/students');
  } catch (err) { req.flash('error','Failed to update student'); res.redirect(`/students/${req.params.id}/edit`); }
});

// ── DELETE /students/:id ──
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    await Graduated.destroy({   where: { StudentID: req.params.id } });
    await Transferred.destroy({ where: { StudentID: req.params.id } });
    await Student.destroy({ where: { StudentID: req.params.id } });
    req.flash('success','Student deleted');
    res.redirect('/students');
  } catch (err) { req.flash('error','Failed to delete student'); res.redirect('/students'); }
});

// ── POST /students/:id/move ──
router.post('/:id/move', isAdminOrTeacher, async (req, res) => {
  try {
    const { newClassID, newStmID, newStatus } = req.body;
    const updateData = { ClassID: newClassID, StmID: newStmID || null };
    if (newStatus) updateData.Status = newStatus;
    await Student.update(updateData, { where: { StudentID: req.params.id } });
    await syncSpecialStatus(req.params.id);
    req.flash('success','Student moved successfully');
    res.redirect('/students');
  } catch (err) { req.flash('error','Failed to move student'); res.redirect('/students'); }
});

module.exports = router;
