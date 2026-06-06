const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Student = sequelize.define('Student', {
  StudentID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  StudentFullName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: { notEmpty: true }
  },
  ParentPhone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  ParentEmail: {
    type: DataTypes.STRING(150),
    allowNull: true,
    validate: { isEmail: true }
  },
  ClassID: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  StmID: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  Gender: {
    type: DataTypes.ENUM('Male', 'Female'),
    allowNull: false
  },
  Status: {
    type: DataTypes.ENUM('Ongoing', 'Completed', 'Transferred'),
    allowNull: false,
    defaultValue: 'Ongoing'
  },
  AdmissionNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true
  },
  DateOfBirth: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  AdmissionDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    defaultValue: DataTypes.NOW
  },
  Address: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'students',
  timestamps: true,
  indexes: [
    { fields: ['ClassID'] },
    { fields: ['StmID'] },
    { fields: ['Status'] },
    { fields: ['Gender'] }
  ]
});

module.exports = Student;
