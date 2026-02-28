const { supabase } = require('../config/database');
const { calculateDurationMinutes } = require('../utils/calculations');
const pricingService = require('./pricingService');

class DashboardService {
    /**
     * Get all active vehicles
     */
    async getActiveVehicles(staff = null) {
        let query = supabase
            .from('vehicles')
            .select(`
        *,
        created_by_staff:staff!created_by(id, name, role)
      `)
            .eq('status', 'ACTIVE');

        if (staff && staff.role !== 'admin') {
            query = query.eq('created_by', staff.id);
        }

        const { data, error } = await query.order('entry_time', { ascending: false });

        if (error) {
            throw new Error('Failed to fetch active vehicles');
        }

        if (!data || data.length === 0) {
            return [];
        }

        // Enrich with duration and overstay info
        // Fetch pricing rules once to optimize loop
        const pricingRules = await pricingService.getAllPricingRules();
        const rulesMap = pricingRules.reduce((acc, rule) => {
            acc[rule.vehicle_type] = rule;
            return acc;
        }, {});

        const enrichedVehicles = data.map((vehicle) => {
            const pricingRule = rulesMap[vehicle.vehicle_type];
            const durationMinutes = calculateDurationMinutes(vehicle.entry_time, new Date());

            let baseMinutes = 0;
            if (pricingRule) {
                baseMinutes = Math.max(
                    pricingRule.base_hours * 60,
                    (vehicle.declared_duration_hours || 0) * 60
                );
            }

            const isOverstay = durationMinutes > baseMinutes;
            const overstayMinutes = isOverstay ? durationMinutes - baseMinutes : 0;

            return {
                ...vehicle,
                duration_minutes: durationMinutes,
                is_overstay: isOverstay,
                overstay_minutes: overstayMinutes,
                base_minutes: baseMinutes
            };
        });

        return enrichedVehicles;
    }

    /**
     * Get vehicle by session ID
     */
    async getVehicleBySession(sessionId) {
        const { data, error } = await supabase
            .from('vehicles')
            .select(`
        *,
        created_by_staff:staff!created_by(id, name, role),
        overstay_charges(*)
      `)
            .eq('session_id', sessionId)
            .single();

        if (error || !data) {
            throw new Error('Vehicle session not found');
        }

        return data;
    }

    /**
     * Get statistics for today
     */
    async getTodayStats(staff = null) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let activeQuery = supabase
            .from('vehicles')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'ACTIVE');

        if (staff && staff.role !== 'admin') {
            activeQuery = activeQuery.eq('created_by', staff.id);
        }

        // Active vehicles count
        const { count: activeCount, error: countError } = await activeQuery;

        if (countError) {
            console.warn('Error fetching active count', countError);
        }

        let completedQuery = supabase
            .from('vehicles')
            .select(`
        base_fee_paid,
        overstay_charges(fee_amount, is_collected)
      `)
            .eq('status', 'EXITED')
            .gte('exit_time', today.toISOString());

        if (staff && staff.role !== 'admin') {
            completedQuery = completedQuery.eq('created_by', staff.id);
        }

        // Today's completed sessions
        const { data: completedToday, error } = await completedQuery;

        if (error) {
            throw new Error('Failed to fetch today statistics');
        }

        // Calculate revenue
        const baseFees = completedToday.reduce((sum, v) => sum + parseFloat(v.base_fee_paid || 0), 0);
        const overstayFees = completedToday.reduce((sum, v) => {
            const charges = v.overstay_charges || [];
            return sum + charges
                .filter(c => c.is_collected)
                .reduce((s, c) => s + parseFloat(c.fee_amount || 0), 0);
        }, 0);

        return {
            active_vehicles: activeCount || 0,
            completed_today: completedToday.length,
            base_fees_collected: baseFees.toFixed(2),
            overstay_fees_collected: overstayFees.toFixed(2),
            total_revenue_today: (baseFees + overstayFees).toFixed(2)
        };
    }
}

module.exports = new DashboardService();
