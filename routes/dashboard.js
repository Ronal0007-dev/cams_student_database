const express    = require('express');
const router     = express.Router();
const { Student, Class, Stream, Graduated, Transferred } = require('../models');
const sequelize  = require('../config/database');

router.get('/', async (req, res) => {
  try {
    // Only Ongoing students are "active" — Completed→graduated, Transferred→transferred tables
    const ONGOING = { Status: 'Ongoing' };

    const [totalStudents, boys, girls, totalGraduated, totalTransferred] = await Promise.all([
      Student.count({ where: ONGOING }),
      Student.count({ where: { ...ONGOING, Gender: 'Male'   } }),
      Student.count({ where: { ...ONGOING, Gender: 'Female' } }),
      Graduated.count(),
      Transferred.count()
    ]);

    // Bar chart — ongoing students per class only
    const studentsByClass = await Class.findAll({
      attributes: [
        'ClassID', 'ClassName',
        [sequelize.fn('COUNT', sequelize.col('Students.StudentID')), 'studentCount']
      ],
      include: [{
        model: Student, as: 'Students', attributes: [],
        where: ONGOING, required: false
      }],
      group: ['Class.ClassID'],
      order: [['ClassName','ASC']]
    });

    // Recent active students
    const recentStudents = await Student.findAll({
      where: ONGOING,
      include: [
        { model: Class,  as: 'Class',  attributes: ['ClassName'] },
        { model: Stream, as: 'Stream', attributes: ['StmName']  }
      ],
      order: [['createdAt','DESC']], limit: 5
    });

    res.render('admin/dashboard', {
      title: 'Dashboard — SMS',
      stats: { totalStudents, boys, girls, totalGraduated, totalTransferred },
      studentsByClass: JSON.stringify(studentsByClass.map(c => ({
        name: c.ClassName,
        count: parseInt(c.dataValues.studentCount)
      }))),
      recentStudents
    });
  } catch (err) {
    console.error(err);
    req.flash('error','Failed to load dashboard');
    res.render('admin/dashboard', { title:'Dashboard', stats:{}, studentsByClass:'[]', recentStudents:[] });
  }
});

module.exports = router;
