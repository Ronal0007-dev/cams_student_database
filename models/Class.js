const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Class = sequelize.define('Class', {
  ClassID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ClassName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { notEmpty: true }
  },
  DeptID: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  Level: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1,
    comment: 'Used for promotion ordering'
  }
}, {
  tableName: 'classes',
  timestamps: true
});

module.exports = Class;
