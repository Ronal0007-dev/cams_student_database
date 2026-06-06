const express = require('express');
const router = express.Router();
const { Student, Class, Department, Stream } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const [totalStudents, boys, girls, ongoing, completed, transferred] = await Promise.all([
      Student.count(),
      Student.count({ where: { Gender: 'Male' } }),
      Student.count({ where: { Gender: 'Female' } }),
      Student.count({ where: { Status: 'Ongoing' } }),
      Student.count({ where: { Status: 'Completed' } }),
      Student.count({ where: { Status: 'Transferred' } })
    ]);

    // Students by class for bar chart
    const studentsByClass = await Class.findAll({
      attributes: [
        'ClassID', 'ClassName',
        [sequelize.fn('COUNT', sequelize.col('Students.StudentID')), 'studentCount']
      ],
      include: [{ model: Student, as: 'Students', attributes: [] }],
      group: ['Class.ClassID'],
      order: [['ClassName', 'ASC']]
    });

    // Recent students
    const recentStudents = await Student.findAll({
      include: [
        { model: Class, as: 'Class', attributes: ['ClassName'] },
        { model: Stream, as: 'Stream', attributes: ['StmName'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    res.render('admin/dashboard', {
      title: 'Dashboard — SMS',
      stats: { totalStudents, boys, girls, ongoing, completed, transferred },
      studentsByClass: JSON.stringify(studentsByClass.map(c => ({
        name: c.ClassName,
        count: parseInt(c.dataValues.studentCount)
      }))),
      recentStudents
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load dashboard');
    res.render('admin/dashboard', { title: 'Dashboard', stats: {}, studentsByClass: '[]', recentStudents: [] });
  }
});

module.exports = router;
