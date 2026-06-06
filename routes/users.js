const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { isAdmin } = require('../middleware/auth');
const { Op } = require('sequelize');

const PAGE_SIZE = 10;

router.get('/', isAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const search = req.query.search || '';
    const role = req.query.role || '';
    const where = {};
    if (search) where[Op.or] = [
      { FullName: { [Op.like]: `%${search}%` } },
      { Username: { [Op.like]: `%${search}%` } },
      { Email: { [Op.like]: `%${search}%` } }
    ];
    if (role) where.Role = role;

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['Password'] },
      order: [['FullName', 'ASC']],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    });

    res.render('admin/users/index', {
      title: 'User Management',
      users, count,
      currentPage: page,
      totalPages: Math.ceil(count / PAGE_SIZE),
      search, role
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load users');
    res.redirect('/dashboard');
  }
});

router.get('/new', isAdmin, (req, res) => {
  res.render('admin/users/form', { title: 'Create User', usr: null, action: '/users' });
});

router.post('/', isAdmin, async (req, res) => {
  try {
    const { FullName, Username, Email, Password, Role } = req.body;
    await User.create({ FullName, Username, Email, Password, Role });
    req.flash('success', 'User created successfully');
    res.redirect('/users');
  } catch (err) {
    req.flash('error', 'Failed: ' + err.message);
    res.redirect('/users/new');
  }
});

router.get('/:id/edit', isAdmin, async (req, res) => {
  const usr = await User.findByPk(req.params.id, { attributes: { exclude: ['Password'] } });
  if (!usr) { req.flash('error', 'Not found'); return res.redirect('/users'); }
  res.render('admin/users/form', { title: 'Edit User', usr, action: `/users/${usr.UserID}?_method=PUT` });
});

router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { FullName, Username, Email, Password, Role, IsActive } = req.body;
    const updateData = { FullName, Username, Email, Role, IsActive: IsActive === 'on' };
    if (Password && Password.trim()) updateData.Password = Password;
    await User.update(updateData, { where: { UserID: req.params.id }, individualHooks: true });
    req.flash('success', 'User updated');
    res.redirect('/users');
  } catch (err) {
    req.flash('error', 'Failed: ' + err.message);
    res.redirect(`/users/${req.params.id}/edit`);
  }
});

router.delete('/:id', isAdmin, async (req, res) => {
  try {
    if (req.params.id == req.session.userId) {
      req.flash('error', 'Cannot delete yourself');
      return res.redirect('/users');
    }
    await User.destroy({ where: { UserID: req.params.id } });
    req.flash('success', 'User deleted');
  } catch (err) {
    req.flash('error', 'Delete failed');
  }
  res.redirect('/users');
});

module.exports = router;
