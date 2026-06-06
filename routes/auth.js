const express = require('express');
const router = express.Router();
const { User } = require('../models');

// GET /auth/login
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Login — SMS' });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      req.flash('error', 'Username and password are required');
      return res.redirect('/auth/login');
    }

    const user = await User.findOne({ where: { Username: username, IsActive: true } });
    if (!user || !(await user.validatePassword(password))) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/auth/login');
    }

    req.session.userId = user.UserID;
    req.session.user = { id: user.UserID, name: user.FullName, username: user.Username };
    req.session.role = user.Role;
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Login failed');
    res.redirect('/auth/login');
  }
});

// GET /auth/logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/auth/login');
});

module.exports = router;
