const { supabase }                = require('../config/database');
const { calculateDurationMinutes } = require('../utils/calculations');
const pricingService               = require('./pricingService');

/**
 * CHANGE: scoping helper replaces the old `staff.role !== 'admin'` check.
 * - admin    → no filter, sees everything
 * - manager  → filters by organization via staff join
 * - operator → filters by space_id (immutable on vehicle row)
 */
function applyScope(query, context) {
    const { staff, organization, space } = context || {};
    if (!staff || staff.role === 'admin') return query;
    if (staff.role === 'manager') {
        return query.eq('created_by_staff.organization_id', organization.id);
    }
    // operator
    return query.eq('space_id', space.id);
}

class DashboardService {

    async getActiveVehicles(context = {}) {
        let query = supabase
            .from('vehicles')
            .select(`
                *,
                created_by_staff:staff!created_by!inner(id, name, role, organization_id)
            `)
            .eq('status', 'ACTIVE');

        // CHANGE: use applyScope instead of old created_by filter
        query = applyScope(query, context);

        const { data, error } = await query.order('entry_time', { ascending: false });

        if (error) {
            throw new Error('Failed to fetch active vehicles');
        }

        if (!data || data.length === 0) {
            return [];
        }

        // CHANGE: pass spaceId to get the right pricing rules for this space
        const spaceId      = context.space?.id || null;
        const pricingRules = await pricingService.getAllPricingRules(spaceId);
        const rulesMap     = pricingRules.reduce((acc, rule) => {
            acc[rule.vehicle_type] = rule;
            return acc;
        }, {});

        return data.map((vehicle) => {
            const pricingRule     = rulesMap[vehicle.vehicle_type];
            const durationMinutes = calculateDurationMinutes(vehicle.entry_time, new Date());

            let baseMinutes = 0;
            if (pricingRule) {
                baseMinutes = Math.max(
                    pricingRule.base_hours * 60,
                    (vehicle.declared_duration_hours || 0) * 60
                );
            }

            const isOverstay     = durationMinutes > baseMinutes;
            const overstayMinutes = isOverstay ? durationMinutes - baseMinutes : 0;

            return {
                ...vehicle,
                duration_minutes:  durationMinutes,
                is_overstay:       isOverstay,
                overstay_minutes:  overstayMinutes,
                base_minutes:      baseMinutes
            };
        });
    }

    async getVehicleBySession(sessionId) {
        const { data, error } = await supabase
            .from('vehicles')
            .select(`
                *,
                created_by_staff:staff!created_by!inner(id, name, role),
                overstay_charges(*)
            `)
            .eq('session_id', sessionId)
            .single();

        if (error || !data) {
            throw new Error('Vehicle session not found');
        }

        return data;
    }

    async getTodayStats(context = {}) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let activeQuery = supabase
            .from('vehicles')
            .select('*, created_by_staff:staff!created_by!inner(organization_id)', { count: 'exact', head: true })
            .eq('status', 'ACTIVE');

        // CHANGE: use applyScope
        activeQuery = applyScope(activeQuery, context);

        const { count: activeCount, error: countError } = await activeQuery;
        if (countError) {
            console.warn('Error fetching active count', countError);
        }

        let completedQuery = supabase
            .from('vehicles')
            .select(`
                base_fee_paid,
                overstay_charges(fee_amount, is_collected),
                created_by_staff:staff!created_by!inner(organization_id)
            `)
            .eq('status', 'EXITED')
            .gte('exit_time', today.toISOString());

        // CHANGE: use applyScope
        completedQuery = applyScope(completedQuery, context);

        const { data: completedToday, error } = await completedQuery;

        if (error) {
            throw new Error('Failed to fetch today statistics');
        }

        const baseFees     = completedToday.reduce((sum, v) => sum + parseFloat(v.base_fee_paid || 0), 0);
        const overstayFees = completedToday.reduce((sum, v) => {
            const charges = v.overstay_charges || [];
            return sum + charges
                .filter(c => c.is_collected)
                .reduce((s, c) => s + parseFloat(c.fee_amount || 0), 0);
        }, 0);

        return {
            active_vehicles:         activeCount || 0,
            completed_today:         completedToday.length,
            base_fees_collected:     baseFees.toFixed(2),
            overstay_fees_collected: overstayFees.toFixed(2),
            total_revenue_today:     (baseFees + overstayFees).toFixed(2)
        };
    }
}

module.exports = new DashboardService();
