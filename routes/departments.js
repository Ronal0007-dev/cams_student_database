const express   = require('express');
const router    = express.Router();
const { Department, Class, Student, Stream } = require('../models');
const { isAdmin } = require('../middleware/auth');
const { Op }    = require('sequelize');

const PAGE_SIZE = 10;

// ── GET /departments — list ──
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const search = req.query.search || '';
    const where  = search ? { DeptName: { [Op.like]: `%${search}%` } } : {};

    const { count, rows: departments } = await Department.findAndCountAll({
      where,
      include: [{
        model: Class, as: 'Classes',
        include: [{ model: Student, as: 'Students', attributes: ['StudentID'] }]
      }],
      order:  [['DeptName','ASC']],
      limit:  PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      distinct: true
    });

    res.render('admin/departments/index', {
      title: 'Departments',
      departments, count,
      currentPage: page,
      totalPages: Math.ceil(count / PAGE_SIZE),
      search
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load departments');
    res.redirect('/dashboard');
  }
});

// ── GET /departments/:id/view — department detail ──
router.get('/:id/view', async (req, res) => {
  try {
    const dept = await Department.findByPk(req.params.id, {
      include: [{
        model: Class, as: 'Classes',
        include: [
          { model: Stream,  as: 'Streams' },
          { model: Student, as: 'Students', attributes: ['StudentID','Gender','Status'] }
        ],
        order: [['Level','ASC'],['ClassName','ASC']]
      }]
    });
    if (!dept) { req.flash('error','Department not found'); return res.redirect('/departments'); }

    // Compute per-class and department totals
    let deptTotal = 0, deptBoys = 0, deptGirls = 0;
    let deptOngoing = 0, deptCompleted = 0, deptTransferred = 0;

    const classStats = (dept.Classes || []).map(cls => {
      const students = cls.Students || [];
      const boys        = students.filter(s => s.Gender === 'Male').length;
      const girls       = students.filter(s => s.Gender === 'Female').length;
      const ongoing     = students.filter(s => s.Status === 'Ongoing').length;
      const completed   = students.filter(s => s.Status === 'Completed').length;
      const transferred = students.filter(s => s.Status === 'Transferred').length;
      deptTotal       += students.length;
      deptBoys        += boys;
      deptGirls       += girls;
      deptOngoing     += ongoing;
      deptCompleted   += completed;
      deptTransferred += transferred;
      return { cls, total: students.length, boys, girls, ongoing, completed, transferred };
    });

    res.render('admin/departments/view', {
      title: `${dept.DeptName} — Department`,
      dept, classStats,
      deptStats: { total: deptTotal, boys: deptBoys, girls: deptGirls, ongoing: deptOngoing, completed: deptCompleted, transferred: deptTransferred }
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load department');
    res.redirect('/departments');
  }
});

// ── GET /departments/new ──
router.get('/new', isAdmin, (req, res) => {
  res.render('admin/departments/form', { title: 'Add Department', dept: null, action: '/departments' });
});

// ── POST /departments ──
router.post('/', isAdmin, async (req, res) => {
  try {
    await Department.create({ DeptName: req.body.DeptName, Description: req.body.Description });
    req.flash('success', 'Department created');
    res.redirect('/departments');
  } catch (err) {
    req.flash('error', 'Failed: ' + err.message);
    res.redirect('/departments/new');
  }
});

// ── GET /departments/:id/edit ──
router.get('/:id/edit', isAdmin, async (req, res) => {
  const dept = await Department.findByPk(req.params.id);
  if (!dept) { req.flash('error','Not found'); return res.redirect('/departments'); }
  res.render('admin/departments/form', { title: 'Edit Department', dept, action: `/departments/${dept.DeptID}?_method=PUT` });
});

// ── PUT /departments/:id ──
router.put('/:id', isAdmin, async (req, res) => {
  await Department.update({ DeptName: req.body.DeptName, Description: req.body.Description }, { where: { DeptID: req.params.id } });
  req.flash('success', 'Department updated');
  res.redirect('/departments');
});

// ── DELETE /departments/:id ──
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    await Department.destroy({ where: { DeptID: req.params.id } });
    req.flash('success', 'Department deleted');
  } catch (err) {
    req.flash('error', 'Cannot delete: has associated classes');
  }
  res.redirect('/departments');
});

module.exports = router;
