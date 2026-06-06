const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  req.flash('error', 'Please login to access this page');
  res.redirect('/auth/login');
};

const isAdmin = (req, res, next) => {
  if (req.session && req.session.userId && req.session.role === 'admin') {
    return next();
  }
  req.flash('error', 'Admin access required');
  res.redirect('/dashboard');
};

const isAdminOrTeacher = (req, res, next) => {
  if (req.session && req.session.userId && ['admin', 'teacher'].includes(req.session.role)) {
    return next();
  }
  req.flash('error', 'Insufficient permissions');
  res.redirect('/dashboard');
};

const setLocals = (req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.role = req.session.role || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
};

module.exports = { isAuthenticated, isAdmin, isAdminOrTeacher, setLocals };
