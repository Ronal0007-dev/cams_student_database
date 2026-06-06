const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Department = sequelize.define('Department', {
  DeptID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  DeptName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: { notEmpty: true }
  },
  Description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'departments',
  timestamps: true
});

module.exports = Department;
