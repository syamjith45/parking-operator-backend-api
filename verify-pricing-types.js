#!/usr/bin/env node

/**
 * Database Verification Script
 * Checks that the pricing_types migration was applied correctly
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runVerification() {
    console.log('🔍 Starting Database Verification...\n');

    try {
        // 1. Check if pricing_types table exists
        console.log('1️⃣  Checking pricing_types table existence...');
        const { data: pricingTypes, error: pricingError } = await supabase
            .from('pricing_types')
            .select('*');

        if (pricingError) {
            console.error('   ❌ ERROR: pricing_types table not found or inaccessible');
            console.error('   Error:', pricingError.message);
            return false;
        }

        console.log(`   ✅ pricing_types table exists`);
        console.log(`   📊 Total pricing types: ${pricingTypes?.length || 0}`);
        
        if (pricingTypes && pricingTypes.length > 0) {
            pricingTypes.forEach(pt => {
                console.log(`      • ${pt.code} - "${pt.label}" (Active: ${pt.is_active})`);
            });
        }
        console.log();

        // 2. Verify required pricing types exist
        console.log('2️⃣  Verifying required pricing types...');
        const requiredCodes = ['hourly', 'slab_based'];
        const existingCodes = (pricingTypes || []).map(pt => pt.code);
        
        let allRequiredExist = true;
        for (const code of requiredCodes) {
            if (existingCodes.includes(code)) {
                console.log(`   ✅ "${code}" pricing type exists`);
            } else {
                console.log(`   ❌ "${code}" pricing type MISSING`);
                allRequiredExist = false;
            }
        }
        console.log();

        // 3. Check organizations table has pricing_type_id column
        console.log('3️⃣  Checking organizations table structure...');
        const { data: orgs, error: orgsError } = await supabase
            .from('organizations')
            .select('id, pricing_type_id, name')
            .limit(1);

        if (orgsError) {
            if (orgsError.message.includes('pricing_type_id')) {
                console.error('   ❌ ERROR: pricing_type_id column not found in organizations table');
                return false;
            }
            console.error('   ⚠️ Warning:', orgsError.message);
        } else {
            console.log('   ✅ organizations table has pricing_type_id column');
        }
        console.log();

        // 4. Check organizations data
        console.log('4️⃣  Verifying organization data...');
        const { data: allOrgs, error: allOrgsError } = await supabase
            .from('organizations')
            .select('id, name, pricing_type_id, is_active');

        if (allOrgsError) {
            console.error('   ❌ ERROR fetching organizations:', allOrgsError.message);
            return false;
        }

        if (!allOrgs || allOrgs.length === 0) {
            console.log('   ℹ️  No organizations found in database');
        } else {
            console.log(`   📊 Total organizations: ${allOrgs.length}`);
            
            let validCount = 0;
            let nullCount = 0;
            let invalidCount = 0;

            allOrgs.forEach(org => {
                if (org.pricing_type_id === null) {
                    nullCount++;
                } else {
                    const hasValidType = (pricingTypes || []).some(pt => pt.id === org.pricing_type_id);
                    if (hasValidType) {
                        validCount++;
                    } else {
                        invalidCount++;
                    }
                }
            });

            console.log(`   ✅ Valid pricing_type_id references: ${validCount}`);
            if (nullCount > 0) {
                console.log(`   ⚠️  Organizations with NULL pricing_type_id: ${nullCount}`);
            }
            if (invalidCount > 0) {
                console.log(`   ❌ Organizations with INVALID pricing_type_id: ${invalidCount}`);
            }

            if (nullCount > 0) {
                console.log('\n   Organizations with NULL pricing_type_id:');
                allOrgs.filter(o => o.pricing_type_id === null).forEach(org => {
                    console.log(`      • ${org.id} - ${org.name}`);
                });
            }

            if (invalidCount > 0) {
                console.log('\n   Organizations with INVALID pricing_type_id:');
                allOrgs.filter(o => o.pricing_type_id && !(pricingTypes || []).some(pt => pt.id === o.pricing_type_id)).forEach(org => {
                    console.log(`      • ${org.id} - ${org.name} (pricing_type_id: ${org.pricing_type_id})`);
                });
            }
        }
        console.log();

        // 5. Check for old column existence
        console.log('5️⃣  Checking for old overstay_pricing_type column...');
        const { data: checkOld, error: checkOldError } = await supabase
            .from('organizations')
            .select('overstay_pricing_type')
            .limit(1);

        if (checkOldError && checkOldError.message.includes('overstay_pricing_type')) {
            console.log('   ✅ Old overstay_pricing_type column successfully removed');
        } else if (checkOld) {
            console.log('   ⚠️  WARNING: Old overstay_pricing_type column still exists!');
        }
        console.log();

        // 6. Summary report
        console.log('📋 VERIFICATION SUMMARY:');
        console.log('─'.repeat(50));
        
        if (allRequiredExist && validCount === allOrgs?.length && nullCount === 0 && invalidCount === 0) {
            console.log('✅ ALL CHECKS PASSED - Database is correctly migrated!');
            return true;
        } else {
            console.log('⚠️  SOME CHECKS FAILED - Review findings above');
            return false;
        }

    } catch (error) {
        console.error('❌ FATAL ERROR:', error.message);
        return false;
    }
}

// Run verification
runVerification().then(success => {
    process.exit(success ? 0 : 1);
});
