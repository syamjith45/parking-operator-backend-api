#!/usr/bin/env node

// Quick syntax check for all modified files
const fs = require('fs');
const path = require('path');

const files = [
    'src/graphql/schema.js',
    'src/graphql/resolvers/queries.js',
    'src/graphql/resolvers/mutations.js',
    'src/middleware/auth.js',
    'src/config/database.js',
    'src/server.js',
    'src/services/pricingService.js'
];

let errorCount = 0;

console.log('🔍 Checking syntax of modified files...\n');

files.forEach(file => {
    const filePath = path.join(__dirname, file);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Try to parse as JavaScript by requiring it
        require(filePath);
        console.log(`✅ ${file}`);
    } catch (err) {
        console.error(`❌ ${file}`);
        console.error(`   Error: ${err.message}`);
        errorCount++;
    }
});

console.log(`\n${errorCount === 0 ? '✅ All files pass syntax check!' : `❌ ${errorCount} file(s) have errors`}`);
process.exit(errorCount > 0 ? 1 : 0);
