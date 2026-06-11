const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const School = sequelize.define('School', {
  SchoolID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  SchoolName: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: { notEmpty: true }
  },
  POBox: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  TanzaniaRegNumber: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  PearsonEdexcelRegNumber: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  CambridgeRegNumber: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  Phone: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  Email: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  Website: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  Address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Document file paths (stored relative to public/uploads/school-docs/)
  SchoolMapPath: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to school map document/image'
  },
  PearsonCertPath: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to Pearson Edexcel certificate'
  },
  CambridgeCertPath: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to Cambridge registration certificate'
  },
  LogoPath: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to school logo'
  }
}, {
  tableName: 'school',
  timestamps: true
});

module.exports = School;
