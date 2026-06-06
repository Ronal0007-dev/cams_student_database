const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Stream = sequelize.define('Stream', {
  StmID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  StmName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { notEmpty: true }
  },
  ClassID: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'streams',
  timestamps: true
});

module.exports = Stream;
