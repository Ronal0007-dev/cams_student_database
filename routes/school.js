const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const { School, Department, Class, Student } = require('../models');
const { isAdmin } = require('../middleware/auth');
const { schoolUpload } = require('../config/upload');

// Helper: delete a file from disk safely
function deleteFile(filePath) {
  if (!filePath) return;
  try {
    const abs = path.join(__dirname, '..', 'public', filePath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (_) {}
}

// Helper: get or create the single school record
async function getSchool() {
  let school = await School.findOne();
  if (!school) {
    school = await School.create({ SchoolName: 'My School' });
  }
  return school;
}

// ── GET /school — view school info ──
router.get('/', async (req, res) => {
  try {
    const school = await getSchool();

    // Department stats — only Ongoing students
    const departments = await Department.findAll({
      include: [{
        model: Class, as: 'Classes',
        include: [{
          model: Student, as: 'Students',
          attributes: ['StudentID','Gender'],
          where: { Status: 'Ongoing' }, required: false
        }]
      }],
      order: [['DeptName','ASC']]
    });

    const deptStats = departments.map(d => {
      const students = (d.Classes || []).flatMap(c => c.Students || []);
      return {
        name:  d.DeptName,
        id:    d.DeptID,
        total: students.length,
        boys:  students.filter(s => s.Gender === 'Male').length,
        girls: students.filter(s => s.Gender === 'Female').length
      };
    });

    res.render('admin/school/view', { title: 'School Information — SMS', school, deptStats });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load school information');
    res.redirect('/dashboard');
  }
});

// ── GET /school/print — print school info ──
router.get('/print', async (req, res) => {
  try {
    const school = await getSchool();

    const departments = await Department.findAll({
      include: [{
        model: Class, as: 'Classes',
        include: [{
          model: Student, as: 'Students',
          attributes: ['StudentID','Gender'],
          where: { Status: 'Ongoing' }, required: false
        }]
      }],
      order: [['DeptName','ASC']]
    });

    const deptStats = departments.map(d => {
      const students = (d.Classes || []).flatMap(c => c.Students || []);
      return {
        name:  d.DeptName,
        id:    d.DeptID,
        total: students.length,
        boys:  students.filter(s => s.Gender === 'Male').length,
        girls: students.filter(s => s.Gender === 'Female').length
      };
    });

    res.render('admin/school/print', {
      title: `Print — ${school.SchoolName}`,
      school, deptStats,
      printDate: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })
    });
  } catch (err) {
    console.error(err);
    res.redirect('/school');
  }
});

// ── GET /school/edit — edit form ──
router.get('/edit', isAdmin, async (req, res) => {
  try {
    const school = await getSchool();
    res.render('admin/school/form', {
      title: 'Edit School Information',
      school,
      action: '/school?_method=PUT'
    });
  } catch (err) {
    req.flash('error', 'Failed to load form');
    res.redirect('/school');
  }
});

// ── PUT /school — update school info + handle file uploads ──
router.put('/', isAdmin, (req, res, next) => {
  schoolUpload(req, res, (err) => {
    if (err) {
      req.flash('error', 'Upload error: ' + err.message);
      return res.redirect('/school/edit');
    }
    next();
  });
}, async (req, res) => {
  try {
    const school = await getSchool();

    const {
      SchoolName, POBox, TanzaniaRegNumber,
      PearsonEdexcelRegNumber, CambridgeRegNumber,
      Phone, Email, Website, Address
    } = req.body;

    const updateData = {
      SchoolName, POBox, TanzaniaRegNumber,
      PearsonEdexcelRegNumber, CambridgeRegNumber,
      Phone, Email, Website, Address
    };

    // Handle file uploads — replace old file if a new one is uploaded
    if (req.files) {
      if (req.files['SchoolMapFile'] && req.files['SchoolMapFile'][0]) {
        deleteFile(school.SchoolMapPath);
        updateData.SchoolMapPath = '/uploads/school-docs/' + req.files['SchoolMapFile'][0].filename;
      }
      if (req.files['PearsonCertFile'] && req.files['PearsonCertFile'][0]) {
        deleteFile(school.PearsonCertPath);
        updateData.PearsonCertPath = '/uploads/school-docs/' + req.files['PearsonCertFile'][0].filename;
      }
      if (req.files['CambridgeCertFile'] && req.files['CambridgeCertFile'][0]) {
        deleteFile(school.CambridgeCertPath);
        updateData.CambridgeCertPath = '/uploads/school-docs/' + req.files['CambridgeCertFile'][0].filename;
      }
      if (req.files['LogoFile'] && req.files['LogoFile'][0]) {
        deleteFile(school.LogoPath);
        updateData.LogoPath = '/uploads/school-docs/' + req.files['LogoFile'][0].filename;
      }
    }

    await school.update(updateData);
    req.flash('success', 'School information updated successfully');
    res.redirect('/school');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to update: ' + err.message);
    res.redirect('/school/edit');
  }
});

// ── DELETE /school/doc/:field — remove a specific document ──
router.delete('/doc/:field', isAdmin, async (req, res) => {
  try {
    const school = await getSchool();
    const field  = req.params.field;
    const allowed = ['SchoolMapPath', 'PearsonCertPath', 'CambridgeCertPath', 'LogoPath'];

    if (!allowed.includes(field)) {
      req.flash('error', 'Invalid document field');
      return res.redirect('/school');
    }

    deleteFile(school[field]);
    await school.update({ [field]: null });
    req.flash('success', 'Document removed successfully');
    res.redirect('/school');
  } catch (err) {
    req.flash('error', 'Failed to remove document');
    res.redirect('/school');
  }
});

module.exports = router;
