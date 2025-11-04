/**
 * Database Migration Runner
 * Reads SQL file and executes migrations against Railway MySQL
 */

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

/**
 * Split SQL file into individual statements
 */
function parseSQLFile(sqlContent) {
  const statements = [];
  
  // Remove single-line comments (but keep them for table definitions)
  let cleaned = sqlContent.replace(/--[^\r\n]*/gm, '');
  
  // Split by semicolons, but handle CREATE TABLE statements specially
  let currentStatement = '';
  let inCreateTable = false;
  let parenDepth = 0;
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const nextChars = cleaned.substring(i, i + 15).toUpperCase();
    
    // Detect CREATE TABLE start
    if (nextChars.startsWith('CREATE TABLE')) {
      inCreateTable = true;
      parenDepth = 0;
    }
    
    currentStatement += char;
    
    // Track parentheses depth for CREATE TABLE
    if (inCreateTable) {
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;
    }
    
    // End of statement (semicolon and not inside parentheses)
    if (char === ';' && (!inCreateTable || parenDepth === 0)) {
      const trimmed = currentStatement.trim();
      if (trimmed.length > 10) { // Ignore very short statements
        statements.push(trimmed);
      }
      currentStatement = '';
      inCreateTable = false;
      parenDepth = 0;
    }
  }
  
  // Add any remaining statement
  const remaining = currentStatement.trim();
  if (remaining.length > 10) {
    statements.push(remaining);
  }
  
  return statements;
}

/**
 * Run migrations from SQL file
 */
async function runMigrations(sqlFilePath) {
  const connection = await pool.getConnection();
  
  try {
    console.log('📖 Reading SQL file:', sqlFilePath);
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    console.log('📝 Parsing SQL statements...');
    const statements = parseSQLFile(sqlContent);
    
    console.log(`✅ Found ${statements.length} SQL statements to execute\n`);
    
    await connection.beginTransaction();
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip empty statements
      if (!statement || statement.length < 10) {
        continue;
      }
      
      try {
        // Extract table/statement name for logging
        const tableMatch = statement.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i);
        const tableName = tableMatch ? tableMatch[1] : 'statement';
        
        console.log(`[${i + 1}/${statements.length}] Executing: ${tableName}`);
        
        await connection.execute(statement);
        successCount++;
        console.log(`   ✅ ${tableName} created successfully\n`);
        
      } catch (error) {
        // Check if it's a "table already exists" error (which is OK for IF NOT EXISTS)
        if (error.message.includes('already exists') || 
            error.code === 'ER_TABLE_EXISTS_ERROR' ||
            error.code === 'ER_DUP_ENTRY' ||
            error.code === 'ER_DUP_KEYNAME') {
          console.log(`   ⚠️  Already exists (skipping - this is OK)\n`);
          successCount++;
        } else {
          errorCount++;
          console.error(`   ❌ Error: ${error.message}`);
          console.error(`   Code: ${error.code || 'N/A'}\n`);
          // Don't stop on error - continue with other statements
        }
      }
    }
    
    await connection.commit();
    
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📝 Total: ${statements.length}\n`);
    
    if (errorCount === 0) {
      console.log('🎉 All migrations completed successfully!');
    } else {
      console.log('⚠️  Some migrations had errors (check output above)');
    }
    
  } catch (error) {
    await connection.rollback();
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// If run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Try multiple possible paths for the SQL file
  const possiblePaths = [
    args[0], // User-specified path
    path.join(__dirname, '../../database_migrations_crypto.sql'), // Project root
    path.join(__dirname, '../database_migrations_crypto.sql'), // crypto-worker root
    path.join(process.cwd(), 'database_migrations_crypto.sql'), // Current directory
    path.join(process.cwd(), '../database_migrations_crypto.sql'), // Parent directory
  ].filter(Boolean);
  
  let sqlFile = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      sqlFile = possiblePath;
      break;
    }
  }
  
  if (!sqlFile) {
    console.error(`❌ SQL file not found. Tried:`);
    possiblePaths.forEach(p => console.error(`   - ${p}`));
    console.log('\nUsage:');
    console.log('  node scripts/runMigrations.js [path/to/migrations.sql]');
    console.log('\nOr place database_migrations_crypto.sql in project root');
    process.exit(1);
  }
  
  console.log(`📁 Using SQL file: ${sqlFile}\n`);
  
  runMigrations(sqlFile)
    .then(() => {
      console.log('\n✅ Migration process completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };

