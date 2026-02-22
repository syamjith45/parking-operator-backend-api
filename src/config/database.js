const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Helper to validate URL
const isValidUrl = (string) => {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
};

if (!supabaseUrl || !supabaseKey || !isValidUrl(supabaseUrl)) {
    // In development/test, we might want to allow starting without credentials
    // but warn about it. For production, this should likely throw.
    if (process.env.NODE_ENV === 'production') {
        console.error('CRITICAL: Missing or invalid Supabase credentials in production environment.');
        process.exit(1);
    } else {
        console.warn('Missing or invalid Supabase credentials in environment variables. Using placeholder client for development.');
    }
}

const finalUrl = (supabaseUrl && isValidUrl(supabaseUrl)) ? supabaseUrl : 'https://placeholder.supabase.co';
const finalKey = supabaseKey || 'placeholder';

const supabase = createClient(finalUrl, finalKey);

module.exports = { supabase };
