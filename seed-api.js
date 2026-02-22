const { supabase } = require('./src/config/database');

const pricingRules = [
    { vehicle_type: 'car', base_fee: 10.0, base_hours: 2, extra_hour_rate: 5.0, is_active: true },
    { vehicle_type: 'bike', base_fee: 5.0, base_hours: 2, extra_hour_rate: 2.0, is_active: true },
    { vehicle_type: 'truck', base_fee: 20.0, base_hours: 2, extra_hour_rate: 10.0, is_active: true }
];

async function seedData() {
    console.log('🌱 Starting database seeding...');

    try {
        // 1. Seed Pricing Rules
        const { count: rulesCount } = await supabase.from('pricing_rules').select('*', { count: 'exact', head: true });

        if (rulesCount === 0) {
            console.log('📝 Seeding pricing rules...');
            const { error } = await supabase.from('pricing_rules').insert(pricingRules);
            if (error) {
                console.error('❌ Failed to seed pricing rules:', error.message);
            } else {
                console.log('✅ Pricing rules seeded successfully.');
            }
        } else {
            console.log('ℹ️ Pricing rules already exist. Skipping.');
        }

        // 2. Staff Seeding Info
        const { count: staffCount } = await supabase.from('staff').select('*', { count: 'exact', head: true });

        if (staffCount === 0) {
            console.log('\n⚠️ No staff members found!');
            console.log('To create a staff member, you need to link it to a valid Supabase Auth User ID.');
            console.log('You can run this script with a USER_ID to create a default Admin staff:');
            console.log('Usage: USER_ID=your-uuid-here node seed-api.js');

            const userId = process.env.USER_ID;
            if (userId) {
                console.log(`\nAttempting to create staff for User ID: ${userId}`);
                const { error } = await supabase.from('staff').insert({
                    user_id: userId,
                    name: 'Admin User',
                    role: 'admin',
                    email: 'admin@parking.com', // Update this if needed
                    phone: '0000000000'
                });

                if (error) {
                    console.error('❌ Failed to create staff:', error.message);
                } else {
                    console.log('✅ Staff member created successfully!');
                }
            }
        } else {
            console.log('✅ Staff members exist.');
        }

    } catch (err) {
        console.error('❌ Unexpected error:', err);
    }
}

seedData();
