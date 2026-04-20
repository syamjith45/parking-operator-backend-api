#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const filesToCheck = [
    'src/graphql/schema.js',
    'src/services/pricingService.js',
    'src/services/exitService.js',
    'src/services/transactionService.js',
    'src/services/entryService.js',
    'src/graphql/resolvers/index.js',
    'src/graphql/resolvers/queries.js',
    'src/graphql/resolvers/mutations.js'
];

let allValid = true;

filesToCheck.forEach(file => {
    try {
        const fullPath = path.join(__dirname, file);
        require(fullPath);
        console.log(`✓ ${file}`);
    } catch (err) {
        console.error(`✗ ${file}: ${err.message}`);
        allValid = false;
    }
});

if (allValid) {
    console.log('\n✓ All syntax checks passed!');
    process.exit(0);
} else {
    console.log('\n✗ Some files have syntax errors');
    process.exit(1);
}
