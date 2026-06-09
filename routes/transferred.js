const express  = require('express');
const router   = express.Router();
const { Transferred, Student } = require('../models');
const { Op }   = require('sequelize');
const { isAdmin, isAdminOrTeacher } = require('../middleware/auth');

const PAGE_SIZE = 20;

// ── GET /transferred — list ──
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const search = req.query.search || '';
    const gender = req.query.gender || '';
    const year   = req.query.year   || '';

    const where = {};
    if (search) where.StudentFullName = { [Op.like]: `%${search}%` };
    if (gender) where.Gender = gender;
    if (year) {
      const seq = require('../config/database');
      const { fn, col, where: swhere } = require('sequelize');
      where[Op.and] = [swhere(fn('YEAR', col('TransferDate')), year)];
    }

    const { count, rows: transfers } = await Transferred.findAndCountAll({
      where,
      order: [['TransferDate','DESC'], ['StudentFullName','ASC']],
      limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE
    });

    const [totalAll, totalBoys, totalGirls] = await Promise.all([
      Transferred.count(),
      Transferred.count({ where: { Gender: 'Male'   } }),
      Transferred.count({ where: { Gender: 'Female' } })
    ]);

    const seq = require('../config/database');
    const years = await Transferred.findAll({
      attributes: [[seq.fn('DISTINCT', seq.fn('YEAR', seq.col('TransferDate'))), 'yr']],
      order: [[seq.fn('YEAR', seq.col('TransferDate')), 'DESC']],
      raw: true
    });

    res.render('admin/transferred/index', {
      title: 'Transferred Students — SMS',
      transfers, count, totalAll, totalBoys, totalGirls,
      totalPages: Math.ceil(count / PAGE_SIZE),
      currentPage: page, pageSize: PAGE_SIZE,
      years: years.map(y => y.yr).filter(Boolean),
      query: { search, gender, year }
    });
  } catch (err) {
    console.error(err);
    req.flash('error','Failed to load transferred students');
    res.redirect('/dashboard');
  }
});

// ── GET /transferred/print — printable list ──
router.get('/print', async (req, res) => {
  try {
    const { search, gender, year } = req.query;
    const where = {};
    if (search) where.StudentFullName = { [Op.like]: `%${search}%` };
    if (gender) where.Gender = gender;
    if (year) {
      const seq = require('../config/database');
      const { fn, col, where: swhere } = require('sequelize');
      where[Op.and] = [swhere(fn('YEAR', col('TransferDate')), year)];
    }
    const transfers = await Transferred.findAll({
      where, order: [['TransferDate','DESC'],['StudentFullName','ASC']]
    });
    res.render('admin/transferred/print-list', {
      title: 'Print Transferred Students', transfers,
      printDate: new Date().toLocaleDateString('en-GB',{ day:'2-digit', month:'long', year:'numeric' }),
      query: req.query
    });
  } catch (err) { res.redirect('/transferred'); }
});

// ── GET /transferred/:id ──
router.get('/:id', async (req, res) => {
  try {
    const transfer = await Transferred.findByPk(req.params.id);
    if (!transfer) { req.flash('error','Record not found'); return res.redirect('/transferred'); }
    res.render('admin/transferred/view', { title: transfer.StudentFullName, transfer });
  } catch (err) { req.flash('error','Error'); res.redirect('/transferred'); }
});

// ── GET /transferred/:id/print ──
router.get('/:id/print', async (req, res) => {
  try {
    const transfer = await Transferred.findByPk(req.params.id);
    if (!transfer) { req.flash('error','Not found'); return res.redirect('/transferred'); }
    res.render('admin/transferred/print-single', {
      title: `Print — ${transfer.StudentFullName}`, transfer,
      printDate: new Date().toLocaleDateString('en-GB',{ day:'2-digit', month:'long', year:'numeric' })
    });
  } catch (err) { res.redirect('/transferred'); }
});

// ── GET /transferred/:id/edit ──
router.get('/:id/edit', isAdmin, async (req, res) => {
  try {
    const transfer = await Transferred.findByPk(req.params.id);
    if (!transfer) { req.flash('error','Not found'); return res.redirect('/transferred'); }
    res.render('admin/transferred/form', {
      title: 'Edit Transfer Record', transfer,
      action: `/transferred/${transfer.TransferredID}?_method=PUT`
    });
  } catch (err) { req.flash('error','Error'); res.redirect('/transferred'); }
});

// ── PUT /transferred/:id ──
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { Status, TransferDate, DestinationSchool, Notes, ParentPhone, ParentEmail, Address } = req.body;
    const transfer = await Transferred.findByPk(req.params.id);
    if (!transfer) { req.flash('error','Not found'); return res.redirect('/transferred'); }

    await transfer.update({ Status, TransferDate, DestinationSchool, Notes, ParentPhone, ParentEmail, Address });

    // Mirror status back to original student record
    if (transfer.StudentID) {
      await Student.update({ Status }, { where: { StudentID: transfer.StudentID } });
    }

    // If status changed away from Transferred, remove from this table
    if (Status !== 'Transferred') {
      await transfer.destroy();
      req.flash('success', `Status changed to ${Status} — record moved accordingly`);
      return res.redirect('/transferred');
    }

    req.flash('success','Transfer record updated');
    res.redirect('/transferred');
  } catch (err) {
    console.error(err);
    req.flash('error','Update failed: ' + err.message);
    res.redirect(`/transferred/${req.params.id}/edit`);
  }
});

// ── DELETE /transferred/:id ──
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const transfer = await Transferred.findByPk(req.params.id);
    if (transfer) {
      if (transfer.StudentID) {
        await Student.update({ Status: 'Ongoing' }, { where: { StudentID: transfer.StudentID } });
      }
      await transfer.destroy();
    }
    req.flash('success','Record deleted — student restored to Ongoing');
    res.redirect('/transferred');
  } catch (err) {
    req.flash('error','Delete failed');
    res.redirect('/transferred');
  }
});

module.exports = router;
