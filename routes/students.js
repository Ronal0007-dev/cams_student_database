const express = require('express');
const router = express.Router();
const { Student, Class, Stream, Department } = require('../models');
const { Op } = require('sequelize');
const { isAdminOrTeacher, isAdmin } = require('../middleware/auth');

const PAGE_SIZE = 20;

// Helper: build where clause from query
function buildWhere(q) {
  const where = {};
  if (q.search) where.StudentFullName = { [Op.like]: `%${q.search}%` };
  if (q.classId) where.ClassID = q.classId;
  if (q.status)  where.Status  = q.status;
  if (q.gender)  where.Gender  = q.gender;
  return where;
}

// GET /students — paginated list
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
      order: [['StudentFullName', 'ASC']],
      limit:  PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    });

    const classes     = await Class.findAll({ order: [['ClassName', 'ASC']] });
    const totalPages  = Math.ceil(count / PAGE_SIZE);

    res.render('admin/students/index', {
      title: 'Students — SMS',
      students, classes, count, totalPages,
      currentPage: page,
      pageSize: PAGE_SIZE,
      query: req.query
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load students');
    res.redirect('/dashboard');
  }
});

// GET /students/print — printable list (no pagination)
router.get('/print', async (req, res) => {
  try {
    const where = buildWhere(req.query);
    const students = await Student.findAll({
      where,
      include: [
        { model: Class,  as: 'Class',  attributes: ['ClassName'],
          include: [{ model: Department, as: 'Department', attributes: ['DeptName'] }] },
        { model: Stream, as: 'Stream', attributes: ['StmName'] }
      ],
      order: [['StudentFullName', 'ASC']]
    });
    const classes = await Class.findAll({ order: [['ClassName', 'ASC']] });
    res.render('admin/students/print', {
      title: 'Print Students',
      students, classes,
      query: req.query,
      printDate: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })
    });
  } catch (err) {
    console.error(err);
    res.redirect('/students');
  }
});

// GET /students/new
router.get('/new', isAdminOrTeacher, async (req, res) => {
  const classes = await Class.findAll({ include: [{ model: Stream, as: 'Streams' }], order: [['ClassName','ASC']] });
  res.render('admin/students/form', { title: 'Add Student', student: null, classes, action: '/students' });
});

// POST /students
router.post('/', isAdminOrTeacher, async (req, res) => {
  try {
    const { StudentFullName, ParentPhone, ParentEmail, ClassID, StmID, Gender, Status, DateOfBirth, Address, AdmissionNumber, AdmissionDate } = req.body;
    await Student.create({ StudentFullName, ParentPhone, ParentEmail, ClassID, StmID: StmID||null, Gender, Status: Status||'Ongoing', DateOfBirth, Address, AdmissionNumber, AdmissionDate });
    req.flash('success', 'Student added successfully');
    res.redirect('/students');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to add student: ' + err.message);
    res.redirect('/students/new');
  }
});

// GET /students/:id
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
    req.flash('error', 'Failed to load student');
    res.redirect('/students');
  }
});

// GET /students/:id/edit
router.get('/:id/edit', isAdminOrTeacher, async (req, res) => {
  try {
    const [student, classes] = await Promise.all([
      Student.findByPk(req.params.id),
      Class.findAll({ include: [{ model: Stream, as: 'Streams' }], order: [['ClassName','ASC']] })
    ]);
    if (!student) { req.flash('error','Student not found'); return res.redirect('/students'); }
    res.render('admin/students/form', { title: 'Edit Student', student, classes, action: `/students/${student.StudentID}?_method=PUT` });
  } catch (err) {
    req.flash('error', 'Error loading form');
    res.redirect('/students');
  }
});

// PUT /students/:id
router.put('/:id', isAdminOrTeacher, async (req, res) => {
  try {
    const { StudentFullName, ParentPhone, ParentEmail, ClassID, StmID, Gender, Status, DateOfBirth, Address, AdmissionNumber, AdmissionDate } = req.body;
    await Student.update({ StudentFullName, ParentPhone, ParentEmail, ClassID, StmID: StmID||null, Gender, Status, DateOfBirth, Address, AdmissionNumber, AdmissionDate }, { where: { StudentID: req.params.id } });
    req.flash('success', 'Student updated successfully');
    res.redirect('/students');
  } catch (err) {
    req.flash('error', 'Failed to update student');
    res.redirect(`/students/${req.params.id}/edit`);
  }
});

// DELETE /students/:id
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    await Student.destroy({ where: { StudentID: req.params.id } });
    req.flash('success', 'Student deleted');
    res.redirect('/students');
  } catch (err) {
    req.flash('error', 'Failed to delete student');
    res.redirect('/students');
  }
});

// POST /students/:id/move — move single student
router.post('/:id/move', isAdminOrTeacher, async (req, res) => {
  try {
    const { newClassID, newStmID, newStatus } = req.body;
    const updateData = { ClassID: newClassID };
    if (newStmID)  updateData.StmID  = newStmID;
    if (newStatus) updateData.Status = newStatus;
    await Student.update(updateData, { where: { StudentID: req.params.id } });
    req.flash('success', 'Student moved successfully');
    res.redirect('/students');
  } catch (err) {
    req.flash('error', 'Failed to move student');
    res.redirect('/students');
  }
});

// POST /students/bulk/move — promote whole class to next class
router.post('/bulk/move', isAdmin, async (req, res) => {
  try {
    const { fromClassID, toClassID, toStmID, setStatus } = req.body;
    if (!fromClassID || !toClassID) {
      req.flash('error', 'Please select both source and destination class');
      return res.redirect('/students');
    }
    const updateData = { ClassID: toClassID };
    if (toStmID)   updateData.StmID  = toStmID   || null;
    if (setStatus) updateData.Status = setStatus;

    const affected = await Student.update(updateData, {
      where: { ClassID: fromClassID, Status: 'Ongoing' }
    });
    const movedCount = Array.isArray(affected) ? affected[0] : affected;
    req.flash('success', `Successfully promoted ${movedCount} student(s) to next class`);
    res.redirect('/students');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to promote class: ' + err.message);
    res.redirect('/students');
  }
});

module.exports = router;
