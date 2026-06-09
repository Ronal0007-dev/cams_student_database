const sequelize   = require('../config/database');
const Department  = require('./Department');
const Class       = require('./Class');
const Stream      = require('./Stream');
const Student     = require('./Student');
const User        = require('./User');
const Graduated   = require('./Graduated');
const Transferred = require('./Transferred');

// Department -> Class
Department.hasMany(Class, { foreignKey: 'DeptID', as: 'Classes' });
Class.belongsTo(Department, { foreignKey: 'DeptID', as: 'Department' });

// Class -> Stream
Class.hasMany(Stream, { foreignKey: 'ClassID', as: 'Streams' });
Stream.belongsTo(Class, { foreignKey: 'ClassID', as: 'Class' });

// Class -> Student
Class.hasMany(Student, { foreignKey: 'ClassID', as: 'Students' });
Student.belongsTo(Class, { foreignKey: 'ClassID', as: 'Class' });

// Stream -> Student
Stream.hasMany(Student, { foreignKey: 'StmID', as: 'Students' });
Student.belongsTo(Stream, { foreignKey: 'StmID', as: 'Stream' });

// Graduated & Transferred — standalone tables (no FK constraints)

module.exports = { sequelize, Department, Class, Stream, Student, User, Graduated, Transferred };
