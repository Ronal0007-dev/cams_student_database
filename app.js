require('dotenv').config();
const express       = require('express');
const session       = require('express-session');
const flash         = require('connect-flash');
const methodOverride = require('method-override');
const path          = require('path');

const { sequelize }  = require('./models');
const { setLocals }  = require('./middleware/auth');
const { isAuthenticated } = require('./middleware/auth');
const { startScheduler }  = require('./services/backup');

const app = express();

// View engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploaded school documents
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

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
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Flash
app.use(flash());

// Set locals
app.use(setLocals);

// Routes
app.use('/auth',        require('./routes/auth'));
app.use('/dashboard',   isAuthenticated, require('./routes/dashboard'));
app.use('/students',    isAuthenticated, require('./routes/students-import'));
app.use('/students',    isAuthenticated, require('./routes/students'));
app.use('/departments', isAuthenticated, require('./routes/departments'));
app.use('/classes',     isAuthenticated, require('./routes/classes'));
app.use('/streams',     isAuthenticated, require('./routes/streams'));
app.use('/users',       isAuthenticated, require('./routes/user-roles'));
app.use('/users',       isAuthenticated, require('./routes/users'));
app.use('/graduated',   isAuthenticated, require('./routes/graduated'));
app.use('/transferred', isAuthenticated, require('./routes/transferred'));
app.use('/school',      isAuthenticated, require('./routes/school'));
app.use('/backup',      isAuthenticated, require('./routes/backup'));
app.use('/graduated',   isAuthenticated, require('./routes/graduated'));

// Root redirect
app.get('/', (req, res) => {
  if (req.session.userId) res.redirect('/dashboard');
  else res.redirect('/auth/login');
});

// 404
app.use((req, res) => {
  res.status(404).redirect('/auth/login');
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Internal Server Error');
});

// ── Start ──
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    await sequelize.sync({ alter: true });
    // Ensure school record exists
    const { School } = require('./models');
    const schoolCount = await School.count();
    if (schoolCount === 0) {
      await School.create({ SchoolName: 'My School — Update in Settings' });
      console.log('✅ Default school record created');
    }
    console.log('✅ Tables synced');

    // Seed default admin
    const { User } = require('./models');
    const adminCount = await User.count({ where: { Role: 'admin' } });
    if (adminCount === 0) {
      await User.create({
        FullName: 'System Administrator',
        Username: 'admin',
        Email:    'admin@school.ac.tz',
        Password: 'admin123',
        Role:     'admin'
      });
      console.log('✅ Default admin created: admin / admin123');
    }

    app.listen(PORT, () => {
      console.log(`🚀 SMS running at http://localhost:${PORT}`);
      console.log(`   Login: admin / admin123`);
    });

    // Start automatic backup scheduler
    startScheduler();

  } catch (err) {
    console.error('❌ Startup error:', err);
    process.exit(1);
  }
}

start();
module.exports = app;
