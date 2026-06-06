const express = require('express');
const router = express.Router();
const { Class, Department, Stream, Student } = require('../models');
const { isAdmin } = require('../middleware/auth');
const { Op } = require('sequelize');

const PAGE_SIZE = 10;

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const search = req.query.search || '';
    const deptId = req.query.deptId || '';
    const where = {};
    if (search) where.ClassName = { [Op.like]: `%${search}%` };
    if (deptId) where.DeptID = deptId;

    const { count, rows: classes } = await Class.findAndCountAll({
      where,
      include: [
        { model: Department, as: 'Department' },
        { model: Stream, as: 'Streams' },
        { model: Student, as: 'Students', attributes: ['StudentID'] }
      ],
      order: [['ClassName', 'ASC']],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      distinct: true
    });

    const departments = await Department.findAll({ order: [['DeptName', 'ASC']] });

    res.render('admin/classes/index', {
      title: 'Classes',
      classes, departments, count,
      currentPage: page,
      totalPages: Math.ceil(count / PAGE_SIZE),
      search, deptId
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load classes');
    res.redirect('/dashboard');
  }
});

router.get('/new', isAdmin, async (req, res) => {
  const departments = await Department.findAll({ order: [['DeptName', 'ASC']] });
  res.render('admin/classes/form', { title: 'Add Class', cls: null, departments, action: '/classes' });
});

router.post('/', isAdmin, async (req, res) => {
  try {
    await Class.create({ ClassName: req.body.ClassName, DeptID: req.body.DeptID, Level: req.body.Level || 1 });
    req.flash('success', 'Class created');
    res.redirect('/classes');
  } catch (err) {
    req.flash('error', 'Failed: ' + err.message);
    res.redirect('/classes/new');
  }
});

router.get('/:id/edit', isAdmin, async (req, res) => {
  const [cls, departments] = await Promise.all([
    Class.findByPk(req.params.id),
    Department.findAll({ order: [['DeptName', 'ASC']] })
  ]);
  if (!cls) { req.flash('error', 'Not found'); return res.redirect('/classes'); }
  res.render('admin/classes/form', { title: 'Edit Class', cls, departments, action: `/classes/${cls.ClassID}?_method=PUT` });
});

router.put('/:id', isAdmin, async (req, res) => {
  await Class.update({ ClassName: req.body.ClassName, DeptID: req.body.DeptID, Level: req.body.Level || 1 }, { where: { ClassID: req.params.id } });
  req.flash('success', 'Class updated');
  res.redirect('/classes');
});

router.delete('/:id', isAdmin, async (req, res) => {
  try {
    await Class.destroy({ where: { ClassID: req.params.id } });
    req.flash('success', 'Class deleted');
  } catch (err) {
    req.flash('error', 'Cannot delete: has associated students');
  }
  res.redirect('/classes');
});

module.exports = router;
