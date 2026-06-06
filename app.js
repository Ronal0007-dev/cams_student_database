require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');

const { sequelize } = require('./models');
const { setLocals } = require('./middleware/auth');
const { isAuthenticated } = require('./middleware/auth');

const app = express();

// View engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Method override for PUT/DELETE
app.use(methodOverride('_method'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'sms_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24h
}));

// Flash
app.use(flash());

// Set locals for all views
app.use(setLocals);

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/dashboard', isAuthenticated, require('./routes/dashboard'));
app.use('/students', isAuthenticated, require('./routes/students'));
app.use('/departments', isAuthenticated, require('./routes/departments'));
app.use('/classes', isAuthenticated, require('./routes/classes'));
app.use('/streams', isAuthenticated, require('./routes/streams'));
app.use('/users', isAuthenticated, require('./routes/users'));

// Root redirect
app.get('/', (req, res) => {
  if (req.session.userId) res.redirect('/dashboard');
  else res.redirect('/auth/login');
});

// 404
app.use((req, res) => {
  res.status(404).render('auth/login', { title: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Internal Server Error');
});

// Start
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    // Sync tables (alter: safe for existing data)
    await sequelize.sync({ alter: true });
    console.log('✅ Tables synced');
    
    // Create default admin if none exists
    const { User } = require('./models');
    const adminCount = await User.count({ where: { Role: 'admin' } });
    if (adminCount === 0) {
      await User.create({
        FullName: 'System Administrator',
        Username: 'admin',
        Email: 'admin@school.ac.tz',
        Password: 'admin123',
        Role: 'admin'
      });
      console.log('✅ Default admin created: admin / admin123');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 SMS running at http://localhost:${PORT}`);
      console.log(`   Default login: admin / admin123`);
    });
  } catch (err) {
    console.error('❌ Startup error:', err);
    process.exit(1);
  }
}

start();

module.exports = app;
