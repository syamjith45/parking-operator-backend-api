#!/usr/bin/env node

/**
 * Backend GraphQL Endpoint Verification
 * Tests the new pricing types endpoints to ensure backend is working correctly
 */

const http = require('http');

// Configuration
const GRAPHQL_URL = 'http://localhost:4000/graphql';
const TIMEOUT = 5000;

// GraphQL Queries
const queries = {
    pricingTypes: `
        query {
            pricingTypes {
                id
                code
                label
                is_active
                created_at
            }
        }
    `,
    
    organizations: `
        query {
            organizations {
                id
                name
                pricing_type_id
                pricing_type {
                    code
                    label
                }
                is_active
            }
        }
    `,
    
    myOrganization: `
        query {
            myOrganization {
                id
                name
                pricing_type_id
                pricing_type {
                    code
                    label
                    is_active
                }
            }
        }
    `
};

async function makeGraphQLRequest(query, token = null) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ query });

        const options = {
            hostname: 'localhost',
            port: 4000,
            path: '/graphql',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: TIMEOUT
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve({ status: res.statusCode, data: response });
                } catch (e) {
                    reject(new Error(`Invalid JSON response: ${e.message}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(postData);
        req.end();
    });
}

async function runTests() {
    console.log('🔍 GraphQL Endpoint Verification\n');
    console.log(`Testing: ${GRAPHQL_URL}\n`);

    // Test 1: Pricing Types Query
    console.log('📋 Test 1: Fetch pricing types');
    console.log('─'.repeat(50));
    try {
        const response = await makeGraphQLRequest(queries.pricingTypes);
        
        if (response.data.errors) {
            console.log('❌ FAILED: GraphQL Error');
            console.log('Errors:', response.data.errors);
        } else if (response.data.data?.pricingTypes) {
            const types = response.data.data.pricingTypes;
            console.log(`✅ SUCCESS: Found ${types.length} pricing types`);
            types.forEach(pt => {
                console.log(`   • ${pt.code} - "${pt.label}" (Active: ${pt.is_active})`);
            });
        } else {
            console.log('❌ FAILED: Unexpected response format');
        }
    } catch (error) {
        console.log(`❌ FAILED: ${error.message}`);
        console.log('   Make sure the backend server is running on port 4000');
    }

    console.log('\n' + '─'.repeat(50) + '\n');

    // Test 2: Organizations Query (requires auth)
    console.log('📋 Test 2: Fetch organizations');
    console.log('─'.repeat(50));
    try {
        const response = await makeGraphQLRequest(queries.organizations);
        
        if (response.data.errors) {
            if (response.data.errors[0]?.message?.includes('authenticated')) {
                console.log('⚠️  EXPECTED: Requires authentication');
                console.log('   (This is expected if you don\'t have a valid token)');
            } else {
                console.log('❌ FAILED: GraphQL Error');
                console.log('Errors:', response.data.errors);
            }
        } else if (response.data.data?.organizations) {
            const orgs = response.data.data.organizations;
            console.log(`✅ SUCCESS: Found ${orgs.length} organizations`);
            orgs.slice(0, 3).forEach(org => {
                console.log(`   • ${org.name} (pricing: ${org.pricing_type?.code || 'MISSING'})`);
            });
            if (orgs.length > 3) console.log(`   ... and ${orgs.length - 3} more`);
        } else {
            console.log('❌ FAILED: Unexpected response format');
        }
    } catch (error) {
        console.log(`❌ FAILED: ${error.message}`);
    }

    console.log('\n' + '═'.repeat(50) + '\n');

    // Summary
    console.log('✅ Verification Complete!');
    console.log('\nNotes:');
    console.log('• pricingTypes query should work without authentication');
    console.log('• organizations query requires valid Bearer token');
    console.log('• If backend is not running, start it with: npm start');
}

runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
