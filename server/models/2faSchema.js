const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TwoFactorAuth = sequelize.define('TwoFactorAuth', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4, // Automatically generate UUID
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
  },
  otp_secret: {
    type: DataTypes.TEXT,
    allowNull: false, // OTP secret is required
  },
  enabled_at: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW, // Automatically set the current timestamp
    allowNull: false,
  },
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true, // Last used timestamp is optional
  },
}, {
  tableName: 'two_factor_auth', 
  schema: 'app_data', 
  underscored: true, 
  timestamps: false, // Explicitly disabling Sequelize's built-in timestamps
});

// Foreign key constraint
TwoFactorAuth.associate = (models) => {
  TwoFactorAuth.belongsTo(models.User, {
    foreignKey: 'user_id',
    onDelete: 'CASCADE', // Delete the 2FA record if the user is deleted
  });
};

// Hooks for additional functionality if needed
TwoFactorAuth.beforeCreate((record, options) => {
  record.enabled_at = new Date(); // Ensure enabled_at is set on creation
});

// Export the model for use in other parts of the application
module.exports = TwoFactorAuth;
