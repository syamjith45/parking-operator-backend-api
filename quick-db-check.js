#!/usr/bin/env node

/**
 * Quick Database Schema Check
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

console.log('📡 Connecting to Supabase...');
console.log(`URL: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    try {
        // Check pricing_types table
        console.log('\n=== PRICING TYPES TABLE ===');
        const { data: pricingTypes, error: ptError } = await supabase
            .from('pricing_types')
            .select('id, code, label, is_active, created_at')
            .order('code');

        if (ptError) {
            console.log('❌ Error accessing pricing_types:', ptError.message);
        } else {
            console.log('✅ pricing_types found:', pricingTypes?.length || 0, 'records');
            pricingTypes?.forEach(pt => {
                console.log(`   • ${pt.code} (${pt.label}) - Active: ${pt.is_active}`);
            });
        }

        // Check organizations table structure
        console.log('\n=== ORGANIZATIONS TABLE ===');
        const { data: orgs, error: orgsError } = await supabase
            .from('organizations')
            .select('id, name, pricing_type_id, is_active')
            .limit(5);

        if (orgsError) {
            console.log('❌ Error accessing organizations:', orgsError.message);
        } else {
            console.log('✅ Organizations found:', orgs?.length || 0, 'records (showing first 5)');
            orgs?.forEach(org => {
                console.log(`   • ${org.name} (ID: ${org.id.substring(0, 8)}...) - pricing_type_id: ${org.pricing_type_id ? 'SET' : 'NULL'}`);
            });
        }

        // Count stats
        console.log('\n=== STATISTICS ===');
        const { count: orgCount } = await supabase
            .from('organizations')
            .select('*', { count: 'exact', head: true });

        console.log(`Total organizations: ${orgCount}`);

        const { data: withValidPT } = await supabase
            .from('organizations')
            .select('id')
            .not('pricing_type_id', 'is', null);

        console.log(`Organizations with pricing_type_id set: ${withValidPT?.length || 0}`);

    } catch (error) {
        console.error('Fatal error:', error.message);
    }
}

checkSchema();
