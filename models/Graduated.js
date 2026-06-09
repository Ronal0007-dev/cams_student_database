const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Graduated = sequelize.define('Graduated', {
  GraduatedID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Link back to the original student record
  StudentID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'References the original student'
  },
  // Snapshot of student data at graduation time
  StudentFullName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  AdmissionNumber: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  Gender: {
    type: DataTypes.ENUM('Male', 'Female'),
    allowNull: false
  },
  DateOfBirth: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  ParentPhone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  ParentEmail: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  Address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Academic info at graduation
  ClassID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Class at time of graduation'
  },
  ClassName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Snapshot of class name'
  },
  StmID: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  StreamName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Snapshot of stream name'
  },
  DepartmentName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Snapshot of department name'
  },
  AdmissionDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  GraduationDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    defaultValue: DataTypes.NOW
  },
  // Current status — can be changed post-graduation
  Status: {
    type: DataTypes.ENUM('Completed', 'Transferred', 'Ongoing'),
    allowNull: false,
    defaultValue: 'Completed'
  },
  Notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'graduated',
  timestamps: true,
  indexes: [
    { fields: ['StudentID'] },
    { fields: ['Gender'] },
    { fields: ['ClassID'] },
    { fields: ['GraduationDate'] }
  ]
});

module.exports = Graduated;
