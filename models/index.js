const sequelize = require('../config/database');
const Department = require('./Department');
const Class = require('./Class');
const Stream = require('./Stream');
const Student = require('./Student');
const User = require('./User');

// Department -> Class (one-to-many)
Department.hasMany(Class, { foreignKey: 'DeptID', as: 'Classes' });
Class.belongsTo(Department, { foreignKey: 'DeptID', as: 'Department' });

// Class -> Stream (one-to-many)
Class.hasMany(Stream, { foreignKey: 'ClassID', as: 'Streams' });
Stream.belongsTo(Class, { foreignKey: 'ClassID', as: 'Class' });

// Class -> Student (one-to-many)
Class.hasMany(Student, { foreignKey: 'ClassID', as: 'Students' });
Student.belongsTo(Class, { foreignKey: 'ClassID', as: 'Class' });

// Stream -> Student (one-to-many)
Stream.hasMany(Student, { foreignKey: 'StmID', as: 'Students' });
Student.belongsTo(Stream, { foreignKey: 'StmID', as: 'Stream' });

module.exports = { sequelize, Department, Class, Stream, Student, User };
