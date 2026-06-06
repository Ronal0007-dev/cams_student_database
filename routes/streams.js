const express = require('express');
const router = express.Router();
const { Stream, Class } = require('../models');
const { isAdmin } = require('../middleware/auth');
const { Op } = require('sequelize');

const PAGE_SIZE = 10;

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const search = req.query.search || '';
    const classId = req.query.classId || '';
    const where = {};
    if (search) where.StmName = { [Op.like]: `%${search}%` };
    if (classId) where.ClassID = classId;

    const { count, rows: streams } = await Stream.findAndCountAll({
      where,
      include: [{ model: Class, as: 'Class' }],
      order: [['StmName', 'ASC']],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      distinct: true
    });

    const classes = await Class.findAll({ order: [['ClassName', 'ASC']] });

    res.render('admin/streams/index', {
      title: 'Streams',
      streams, classes, count,
      currentPage: page,
      totalPages: Math.ceil(count / PAGE_SIZE),
      search, classId
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load streams');
    res.redirect('/dashboard');
  }
});

router.get('/new', isAdmin, async (req, res) => {
  const classes = await Class.findAll({ order: [['ClassName', 'ASC']] });
  res.render('admin/streams/form', { title: 'Add Stream', stream: null, classes, action: '/streams' });
});

router.post('/', isAdmin, async (req, res) => {
  try {
    await Stream.create({ StmName: req.body.StmName, ClassID: req.body.ClassID });
    req.flash('success', 'Stream created');
    res.redirect('/streams');
  } catch (err) {
    req.flash('error', 'Failed: ' + err.message);
    res.redirect('/streams/new');
  }
});

router.get('/:id/edit', isAdmin, async (req, res) => {
  const [stream, classes] = await Promise.all([
    Stream.findByPk(req.params.id),
    Class.findAll({ order: [['ClassName', 'ASC']] })
  ]);
  if (!stream) { req.flash('error', 'Not found'); return res.redirect('/streams'); }
  res.render('admin/streams/form', { title: 'Edit Stream', stream, classes, action: `/streams/${stream.StmID}?_method=PUT` });
});

router.put('/:id', isAdmin, async (req, res) => {
  await Stream.update({ StmName: req.body.StmName, ClassID: req.body.ClassID }, { where: { StmID: req.params.id } });
  req.flash('success', 'Stream updated');
  res.redirect('/streams');
});

router.delete('/:id', isAdmin, async (req, res) => {
  try {
    await Stream.destroy({ where: { StmID: req.params.id } });
    req.flash('success', 'Stream deleted');
  } catch (err) {
    req.flash('error', 'Cannot delete: has associated students');
  }
  res.redirect('/streams');
});

// API: get streams by class (used by student form dropdowns)
router.get('/by-class/:classId', async (req, res) => {
  const streams = await Stream.findAll({ where: { ClassID: req.params.classId } });
  res.json(streams);
});

module.exports = router;
