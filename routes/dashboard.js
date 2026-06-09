const express    = require('express');
const router     = express.Router();
const { Student, Class, Department, Stream, Graduated } = require('../models');
const sequelize  = require('../config/database');

router.get('/', async (req, res) => {
  try {
    // Active students = NOT Completed (Completed ones live in graduated table)
    const ACTIVE = { Status: ['Ongoing', 'Transferred'] };

    const [totalStudents, boys, girls, ongoing, transferred, totalGraduated] = await Promise.all([
      Student.count({ where: ACTIVE }),
      Student.count({ where: { ...ACTIVE, Gender: 'Male'   } }),
      Student.count({ where: { ...ACTIVE, Gender: 'Female' } }),
      Student.count({ where: { Status: 'Ongoing'     } }),
      Student.count({ where: { Status: 'Transferred' } }),
      Graduated.count()
    ]);

    // Students by class for bar chart (exclude Completed)
    const studentsByClass = await Class.findAll({
      attributes: [
        'ClassID', 'ClassName',
        [sequelize.fn('COUNT', sequelize.col('Students.StudentID')), 'studentCount']
      ],
      include: [{
        model: Student, as: 'Students', attributes: [],
        where: ACTIVE, required: false
      }],
      group: ['Class.ClassID'],
      order: [['ClassName', 'ASC']]
    });

    // Recent students (active only)
    const recentStudents = await Student.findAll({
      where: ACTIVE,
      include: [
        { model: Class,  as: 'Class',  attributes: ['ClassName'] },
        { model: Stream, as: 'Stream', attributes: ['StmName']  }
      ],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    res.render('admin/dashboard', {
      title: 'Dashboard — SMS',
      stats: { totalStudents, boys, girls, ongoing, transferred, totalGraduated },
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
