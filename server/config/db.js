const { Sequelize } = require('sequelize');
require('dotenv').config();

// Set up the Sequelize instance for PostgreSQL
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  logging: false, // Disable logging queries in the console (optional)
});

// Test the connection
sequelize.authenticate()
  .then(() => {
    console.log('Connected to the PostgreSQL database with Sequelize');
  })
  .catch((err) => {
    console.error('Unable to connect to the PostgreSQL database:', err);
    process.exit(1);
  });

// Export the Sequelize instance for use in other parts of the app
module.exports = sequelize;
