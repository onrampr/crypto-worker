/**
 * Database Configuration for Crypto Worker
 * Connects to MySQL database
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASS || process.env.MYSQLPASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'ysdkgzpgms_checkers',
  port: process.env.DB_PORT || process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Railway MySQL uses SSL - enable if using Railway MySQL
  ssl: process.env.DB_SSL === 'true' || process.env.MYSQL_HOST ? { 
    rejectUnauthorized: false 
  } : false
};

const pool = mysql.createPool(dbConfig);

module.exports = pool;

