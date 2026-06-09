const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Transferred = sequelize.define('Transferred', {
  TransferredID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Reference to original student
  StudentID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  // Snapshot of student data at transfer time
  StudentFullName: { type: DataTypes.STRING(200), allowNull: false },
  AdmissionNumber: { type: DataTypes.STRING(50),  allowNull: true  },
  Gender:          { type: DataTypes.ENUM('Male','Female'), allowNull: false },
  DateOfBirth:     { type: DataTypes.DATEONLY, allowNull: true },
  ParentPhone:     { type: DataTypes.STRING(20),  allowNull: true },
  ParentEmail:     { type: DataTypes.STRING(150), allowNull: true },
  Address:         { type: DataTypes.TEXT, allowNull: true },
  // Academic info at transfer time
  ClassID:         { type: DataTypes.INTEGER, allowNull: true },
  ClassName:       { type: DataTypes.STRING(100), allowNull: true },
  StmID:           { type: DataTypes.INTEGER, allowNull: true },
  StreamName:      { type: DataTypes.STRING(100), allowNull: true },
  DepartmentName:  { type: DataTypes.STRING(100), allowNull: true },
  AdmissionDate:   { type: DataTypes.DATEONLY, allowNull: true },
  TransferDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    defaultValue: DataTypes.NOW
  },
  // Destination school
  DestinationSchool: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  // Status can be changed by admin
  Status: {
    type: DataTypes.ENUM('Transferred', 'Ongoing', 'Completed'),
    allowNull: false,
    defaultValue: 'Transferred'
  },
  Notes: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'transferred',
  timestamps: true,
  indexes: [
    { fields: ['StudentID'] },
    { fields: ['Gender'] },
    { fields: ['TransferDate'] }
  ]
});

module.exports = Transferred;
