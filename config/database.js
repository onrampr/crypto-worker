/**
 * Database Configuration for Crypto Worker
 * Connects to MySQL database
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// Get database config from environment variables
// IMPORTANT: Railway uses MYSQL_HOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
// If you set DB_HOST, DB_USER, etc. as reference variables, they will override these
const dbConfig = {
  host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASS || process.env.MYSQLPASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'railway',
  port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Railway MySQL uses SSL - enable if using Railway MySQL
  ssl: (process.env.DB_SSL === 'true' || process.env.MYSQL_HOST) ? { 
    rejectUnauthorized: false 
  } : false
};

// Debug: Log configuration (without password)
if (process.env.NODE_ENV !== 'production') {
  console.log('🔍 Database Config:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    port: dbConfig.port,
    ssl: dbConfig.ssl ? 'enabled' : 'disabled',
    hasPassword: !!dbConfig.password
  });
}

const pool = mysql.createPool(dbConfig);

module.exports = pool;

