#!/usr/bin/env node

/**
 * Database Migration Check
 * Verifies pricing_types migration is complete
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function main() {
    console.log('\n🔍 DATABASE MIGRATION CHECK\n');
    console.log('═'.repeat(60));

    try {
        // 1. Check pricing_types table
        console.log('\n1. PRICING TYPES TABLE');
        console.log('─'.repeat(60));
        
        const { data: pricingTypes, error: ptErr } = await supabase
            .from('pricing_types')
            .select('id, code, label, is_active');

        if (ptErr) {
            console.log('❌ ERROR:', ptErr.message);
            return;
        }

        console.log(`✅ Found ${pricingTypes.length} pricing types:`);
        pricingTypes.forEach(pt => {
            console.log(`   • ${pt.code.padEnd(12)} - ${pt.label.padEnd(20)} (Active: ${pt.is_active ? 'Yes' : 'No'})`);
        });

        // 2. Check organizations
        console.log('\n2. ORGANIZATIONS TABLE');
        console.log('─'.repeat(60));

        const { data: orgs, count: orgCount, error: orgsErr } = await supabase
            .from('organizations')
            .select('id, name, pricing_type_id', { count: 'exact' });

        if (orgsErr) {
            console.log('❌ ERROR:', orgsErr.message);
            return;
        }

        console.log(`✅ Found ${orgCount} organizations`);

        let validCount = 0;
        let nullCount = 0;

        (orgs || []).forEach(org => {
            if (org.pricing_type_id) {
                const hasPT = pricingTypes.some(pt => pt.id === org.pricing_type_id);
                if (hasPT) validCount++;
            } else {
                nullCount++;
            }
        });

        console.log(`   ✅ With valid pricing_type_id: ${validCount}`);
        if (nullCount > 0) {
            console.log(`   ⚠️  With NULL pricing_type_id: ${nullCount}`);
        }

        // 3. Summary
        console.log('\n3. MIGRATION SUMMARY');
        console.log('─'.repeat(60));

        const allValid = pricingTypes.length === 2 && validCount === orgCount && nullCount === 0;

        if (allValid) {
            console.log('✅ MIGRATION COMPLETE AND VALID');
            console.log('   • Pricing types: 2 (hourly, slab_based)');
            console.log(`   • Organizations: ${orgCount}`);
            console.log(`   • All organizations have valid pricing_type_id`);
        } else {
            console.log('⚠️  MIGRATION INCOMPLETE OR INVALID');
            if (pricingTypes.length !== 2) {
                console.log(`   ❌ Pricing types: ${pricingTypes.length} (expected 2)`);
            }
            if (validCount !== orgCount) {
                console.log(`   ❌ Invalid pricing_type_id: ${orgCount - validCount} organizations`);
            }
            if (nullCount > 0) {
                console.log(`   ❌ NULL pricing_type_id: ${nullCount} organizations`);
            }
        }

        console.log('\n═'.repeat(60) + '\n');

    } catch (error) {
        console.error('❌ FATAL ERROR:', error.message);
    }
}

main();
