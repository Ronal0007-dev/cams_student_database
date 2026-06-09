const sequelize  = require('../config/database');
const Department = require('./Department');
const Class      = require('./Class');
const Stream     = require('./Stream');
const Student    = require('./Student');
const User       = require('./User');
const Graduated  = require('./Graduated');

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

// Graduated — standalone table, no FK constraints to avoid cascades
// StudentID is just a reference field, not an FK

module.exports = { sequelize, Department, Class, Stream, Student, User, Graduated };
