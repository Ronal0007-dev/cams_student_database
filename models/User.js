const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  UserID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  FullName: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  Username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  Email: {
    type: DataTypes.STRING(150),
    allowNull: false,
    unique: true,
    validate: { isEmail: true }
  },
  Password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  Role: {
    type: DataTypes.ENUM('admin', 'teacher', 'viewer'),
    allowNull: false,
    defaultValue: 'viewer'
  },
  IsActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.Password) {
        user.Password = await bcrypt.hash(user.Password, 12);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('Password')) {
        user.Password = await bcrypt.hash(user.Password, 12);
      }
    }
  }
});

User.prototype.validatePassword = async function(password) {
  return bcrypt.compare(password, this.Password);
};

module.exports = User;
