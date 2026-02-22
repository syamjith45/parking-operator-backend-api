const { supabase } = require('./src/config/database');
const fs = require('fs');
const path = require('path');

// Check if .env exists
const envPath = path.resolve(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found!');
    process.exit(1);
} else {
    console.log('✅ .env file found.');
}

async function testConnection() {
    console.log('🔄 Testing connection to Supabase...');
    console.log(`Checking URL: ${process.env.SUPABASE_URL ? 'Defined' : 'Missing'}`);
    console.log(`Checking Key: ${process.env.SUPABASE_ANON_KEY ? 'Defined' : 'Missing'}`);

    try {
        const { data, error } = await supabase.from('vehicles').select('id').limit(1);

        if (error) {
            console.error('❌ Connection failed:', error.message);
            console.error('Details:', error);
        } else {
            console.log('✅ Connection successful!');
            console.log(`Retrieved ${data.length} rows from 'vehicles' table.`);
        }
    } catch (err) {
        console.error('❌ Unexpected error:', err);
    }
}

testConnection();
