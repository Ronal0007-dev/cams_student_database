const express = require('express');
const router = express.Router();
const { Department, Class } = require('../models');
const { isAdmin } = require('../middleware/auth');

const PAGE_SIZE = 10;

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const search = req.query.search || '';
    const where = search ? { DeptName: { [require('sequelize').Op.like]: `%${search}%` } } : {};

    const { count, rows: departments } = await Department.findAndCountAll({
      where,
      include: [{ model: Class, as: 'Classes' }],
      order: [['DeptName', 'ASC']],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      distinct: true
    });

    res.render('admin/departments/index', {
      title: 'Departments',
      departments,
      count,
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

router.get('/new', isAdmin, (req, res) => {
  res.render('admin/departments/form', { title: 'Add Department', dept: null, action: '/departments' });
});

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

router.get('/:id/edit', isAdmin, async (req, res) => {
  const dept = await Department.findByPk(req.params.id);
  if (!dept) { req.flash('error', 'Not found'); return res.redirect('/departments'); }
  res.render('admin/departments/form', { title: 'Edit Department', dept, action: `/departments/${dept.DeptID}?_method=PUT` });
});

router.put('/:id', isAdmin, async (req, res) => {
  await Department.update({ DeptName: req.body.DeptName, Description: req.body.Description }, { where: { DeptID: req.params.id } });
  req.flash('success', 'Department updated');
  res.redirect('/departments');
});

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
