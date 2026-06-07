const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { isAdmin } = require('../middleware/auth');
const { runBackup } = require('../services/backup');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const LOG_FILE   = path.join(BACKUP_DIR, 'backup.log');

// ── GET /backup — admin backup management page ──
router.get('/', isAdmin, (req, res) => {
  const files   = getBackupFiles();
  const logs    = getRecentLogs(80);
  const config  = getConfig();
  res.render('admin/backup/index', {
    title: 'Database Backup', files, logs, config
  });
});

// ── POST /backup/run — trigger manual backup ──
router.post('/run', isAdmin, async (req, res) => {
  try {
    req.flash('success', '⏳ Backup started — this may take a moment. Refresh to see results.');
    res.redirect('/backup');
    // Run after redirect so response is immediate
    setTimeout(() => runBackup(), 200);
  } catch (err) {
    req.flash('error', 'Failed to start backup: ' + err.message);
    res.redirect('/backup');
  }
});

// ── POST /backup/run-sync — trigger & wait (used by API) ──
router.post('/run-sync', isAdmin, async (req, res) => {
  const result = await runBackup();
  res.json(result);
});

// ── GET /backup/download/:filename ──
router.get('/download/:filename', isAdmin, (req, res) => {
  const filename = path.basename(req.params.filename); // sanitize
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    req.flash('error', 'Backup file not found');
    return res.redirect('/backup');
  }
  res.download(filepath, filename);
});

// ── DELETE /backup/:filename ──
router.delete('/:filename', isAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(BACKUP_DIR, filename);
  try {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    req.flash('success', `Backup file "${filename}" deleted`);
  } catch (err) {
    req.flash('error', 'Delete failed: ' + err.message);
  }
  res.redirect('/backup');
});

// ── Helpers ──
function getBackupFiles() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql.gz') || f.endsWith('.sql'))
    .map(f => {
      const fp   = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(fp);
      return {
        name:     f,
        size:     formatBytes(stat.size),
        sizeRaw:  stat.size,
        created:  stat.mtime.toLocaleString('en-GB'),
        createdRaw: stat.mtime
      };
    })
    .sort((a, b) => b.createdRaw - a.createdRaw);
}

function getRecentLogs(lines) {
  if (!fs.existsSync(LOG_FILE)) return [];
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  return content.trim().split('\n').slice(-lines).reverse();
}

function getConfig() {
  return {
    DB_NAME:   process.env.DB_NAME   || '—',
    DB_HOST:   process.env.DB_HOST   || '—',
    SMTP_HOST: process.env.SMTP_HOST || '—',
    SMTP_USER: process.env.SMTP_USER || '(not set)',
    EMAIL_TO:  process.env.BACKUP_EMAIL_TO || '(not set)',
    EMAIL_CC:  process.env.BACKUP_EMAIL_CC || '—',
    SCHEDULE:  process.env.BACKUP_SCHEDULE || '0 2 */7 * *',
    RETENTION: process.env.BACKUP_RETENTION_DAYS || '30'
  };
}

function formatBytes(b) {
  if (b < 1024)     return b + ' B';
  if (b < 1048576)  return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

module.exports = router;
