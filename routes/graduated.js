const express  = require('express');
const router   = express.Router();
const { Graduated, Student, Class, Stream, Department } = require('../models');
const { Op }   = require('sequelize');
const { isAdmin, isAdminOrTeacher } = require('../middleware/auth');

const PAGE_SIZE = 20;

// ── GET /graduated — list ──
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const search = req.query.search || '';
    const gender = req.query.gender || '';
    const year   = req.query.year   || '';
    const status = req.query.status || '';

    const where = {};
    if (search) where.StudentFullName = { [Op.like]: `%${search}%` };
    if (gender) where.Gender = gender;
    if (status) where.Status = status;
    if (year)   where[Op.and] = [
      ...(where[Op.and] || []),
      require('sequelize').where(
        require('sequelize').fn('YEAR', require('sequelize').col('GraduationDate')), year
      )
    ];

    const { count, rows: graduates } = await Graduated.findAndCountAll({
      where,
      order: [['GraduationDate', 'DESC'], ['StudentFullName', 'ASC']],
      limit:  PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    });

    // Stats (total — regardless of filters)
    const [totalAll, totalBoys, totalGirls] = await Promise.all([
      Graduated.count(),
      Graduated.count({ where: { Gender: 'Male'   } }),
      Graduated.count({ where: { Gender: 'Female' } })
    ]);

    // Distinct graduation years for filter
    const sequelize = require('../config/database');
    const years = await Graduated.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.fn('YEAR', sequelize.col('GraduationDate'))), 'yr']],
      order: [[sequelize.fn('YEAR', sequelize.col('GraduationDate')), 'DESC']],
      raw: true
    });

    res.render('admin/graduated/index', {
      title: 'Graduated Students — SMS',
      graduates, count, totalAll, totalBoys, totalGirls,
      totalPages: Math.ceil(count / PAGE_SIZE),
      currentPage: page, pageSize: PAGE_SIZE,
      years: years.map(y => y.yr).filter(Boolean),
      query: { search, gender, year, status }
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load graduated students');
    res.redirect('/dashboard');
  }
});

// ── GET /graduated/print — printable list ──
router.get('/print', async (req, res) => {
  try {
    const { search, gender, year, status } = req.query;
    const where = {};
    if (search) where.StudentFullName = { [Op.like]: `%${search}%` };
    if (gender) where.Gender = gender;
    if (status) where.Status = status;
    if (year) {
      const sequelize = require('../config/database');
      where[Op.and] = [
        require('sequelize').where(
          require('sequelize').fn('YEAR', require('sequelize').col('GraduationDate')), year
        )
      ];
    }

    const graduates = await Graduated.findAll({
      where,
      order: [['GraduationDate','DESC'], ['StudentFullName','ASC']]
    });

    res.render('admin/graduated/print-list', {
      title: 'Print Graduated Students',
      graduates,
      printDate: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' }),
      query: req.query
    });
  } catch (err) {
    console.error(err);
    res.redirect('/graduated');
  }
});

// ── GET /graduated/:id — view single ──
router.get('/:id', async (req, res) => {
  try {
    const grad = await Graduated.findByPk(req.params.id);
    if (!grad) { req.flash('error','Record not found'); return res.redirect('/graduated'); }
    res.render('admin/graduated/view', { title: grad.StudentFullName, grad });
  } catch (err) {
    req.flash('error','Failed to load record');
    res.redirect('/graduated');
  }
});

// ── GET /graduated/:id/print — print individual ──
router.get('/:id/print', async (req, res) => {
  try {
    const grad = await Graduated.findByPk(req.params.id);
    if (!grad) { req.flash('error','Record not found'); return res.redirect('/graduated'); }
    res.render('admin/graduated/print-single', {
      title: `Print — ${grad.StudentFullName}`,
      grad,
      printDate: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })
    });
  } catch (err) {
    res.redirect('/graduated');
  }
});

// ── GET /graduated/:id/edit ──
router.get('/:id/edit', isAdminOrTeacher, async (req, res) => {
  try {
    const grad = await Graduated.findByPk(req.params.id);
    if (!grad) { req.flash('error','Record not found'); return res.redirect('/graduated'); }
    res.render('admin/graduated/form', {
      title: 'Edit Graduated Student',
      grad, action: `/graduated/${grad.GraduatedID}?_method=PUT`
    });
  } catch (err) {
    req.flash('error','Failed to load form');
    res.redirect('/graduated');
  }
});

// ── PUT /graduated/:id — update (status, notes, graduation date) ──
router.put('/:id', isAdminOrTeacher, async (req, res) => {
  try {
    const { Status, GraduationDate, Notes, ParentPhone, ParentEmail, Address } = req.body;
    const grad = await Graduated.findByPk(req.params.id);
    if (!grad) { req.flash('error','Record not found'); return res.redirect('/graduated'); }

    await grad.update({ Status, GraduationDate, Notes, ParentPhone, ParentEmail, Address });

    // Mirror status change back to the original Student record
    if (grad.StudentID) {
      await Student.update({ Status }, { where: { StudentID: grad.StudentID } });
      // If status changed away from Completed, remove from graduated table
      if (Status !== 'Completed') {
        await grad.destroy();
        req.flash('success', `Status changed to ${Status} — student moved back to active list`);
        return res.redirect('/graduated');
      }
    }

    req.flash('success', 'Record updated successfully');
    res.redirect('/graduated');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Update failed: ' + err.message);
    res.redirect(`/graduated/${req.params.id}/edit`);
  }
});

// ── DELETE /graduated/:id ──
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const grad = await Graduated.findByPk(req.params.id);
    if (grad) {
      // Also update the original student record status back to Ongoing
      if (grad.StudentID) {
        await Student.update({ Status: 'Ongoing' }, { where: { StudentID: grad.StudentID } });
      }
      await grad.destroy();
    }
    req.flash('success', 'Record deleted — student restored to Ongoing');
    res.redirect('/graduated');
  } catch (err) {
    req.flash('error', 'Delete failed');
    res.redirect('/graduated');
  }
});

module.exports = router;
