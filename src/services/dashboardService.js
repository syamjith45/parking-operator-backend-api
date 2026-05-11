const { supabase }                = require('../config/database');
const { calculateDurationMinutes } = require('../utils/calculations');
const pricingService               = require('./pricingService');
const parkingTime                  = require('../utils/parkingTime');
const cache                        = require('./cacheService');

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
        // Create cache key based on scope
        const spaceId = context.space?.id || 'global';
        const cacheKey = `dashboard:active:${spaceId}`;

        // Try cache first
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

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
        const resolvedSpaceId = context.space?.id || null;
        const pricingRules = await pricingService.getAllPricingRules(resolvedSpaceId);
        const rulesMap     = pricingRules.reduce((acc, rule) => {
            acc[rule.vehicle_type] = rule;
            return acc;
        }, {});

        const result = data.map((vehicle) => {
            const pricingRule     = rulesMap[vehicle.vehicle_type];
            const durationMinutes = calculateDurationMinutes(vehicle.entry_time, new Date());

            let isOverstay = false;
            let overstayMinutes = 0;
            let baseMinutes = 0;

            if (pricingRule) {
                const allowedUntilDate = parkingTime.calculateAllowedUntil(vehicle, pricingRule);
                const allowedUntilMs = allowedUntilDate.getTime();
                const nowMs = new Date().getTime();

                if (nowMs > allowedUntilMs) {
                    isOverstay = true;
                    overstayMinutes = Math.round((nowMs - allowedUntilMs) / (1000 * 60));
                }
                
                baseMinutes = Math.max(
                    pricingRule.base_hours * 60,
                    (vehicle.declared_duration_hours || 0) * 60
                );
            }

            return {
                ...vehicle,
                duration_minutes:  durationMinutes,
                is_overstay:       isOverstay,
                overstay_minutes:  overstayMinutes,
                base_minutes:      baseMinutes
            };
        });

        // Cache the result
        await cache.set(cacheKey, result, cache.TTL.DASHBOARD_ACTIVE);

        return result;
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

    async getTodayStats(context = {}, period = 'today', startDate = null, endDate = null) {
        // Determine date range based on period or explicit dates
        let start, end;

        if (startDate && endDate) {
            // Use explicit dates
            start = new Date(startDate);
            end = new Date(endDate);
        } else if (period === 'week') {
            // Get start of current week (Monday)
            const now = new Date();
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            start = new Date(now.setDate(diff));
            end = new Date();
        } else if (period === 'month') {
            // Get start of current month
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date();
        } else {
            // Default to today
            start = new Date();
            end = new Date();
        }

        // Normalize times
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        // Create cache key based on scope and period
        const spaceId = context.space?.id || 'global';
        const cacheKey = `dashboard:stats:${spaceId}:${start.toISOString()}:${end.toISOString()}`;

        // Try cache first
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

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
                base_fee_payment_method_code,
                overstay_charges(fee_amount, is_collected, payment_method_code),
                created_by_staff:staff!created_by!inner(organization_id)
            `)
            .eq('status', 'EXITED')
            .gte('exit_time', start.toISOString())
            .lte('exit_time', end.toISOString());

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

        // Calculate payment method breakdown
        let cashTransactions = 0;
        let gpayTransactions = 0;
        let cashFees = 0;
        let gpayFees = 0;

        completedToday.forEach(vehicle => {
            // Count base fee payment method (recorded at entry)
            const baseMethod = vehicle.base_fee_payment_method_code;
            const baseFeeAmt = parseFloat(vehicle.base_fee_paid || 0);
            if (baseMethod === 'cash') {
                cashTransactions++;
                cashFees += baseFeeAmt;
            } else if (baseMethod === 'gpay') {
                gpayTransactions++;
                gpayFees += baseFeeAmt;
            }

            // Count overstay charge payment methods
            const charges = vehicle.overstay_charges || [];
            charges.forEach(charge => {
                if (charge.is_collected) {
                    if (charge.payment_method_code === 'cash') {
                        cashTransactions++;
                        cashFees += parseFloat(charge.fee_amount || 0);
                    } else if (charge.payment_method_code === 'gpay') {
                        gpayTransactions++;
                        gpayFees += parseFloat(charge.fee_amount || 0);
                    }
                }
            });
        });

        const result = {
            active_vehicles:         activeCount || 0,
            completed_today:         completedToday.length,
            base_fees_collected:     baseFees.toFixed(2),
            overstay_fees_collected: overstayFees.toFixed(2),
            total_revenue_today:     (baseFees + overstayFees).toFixed(2),
            cash_transactions:       cashTransactions,
            gpay_transactions:       gpayTransactions,
            cash_fees_collected:     cashFees.toFixed(2),
            gpay_fees_collected:     gpayFees.toFixed(2)
        };

        // Cache the result
        await cache.set(cacheKey, result, cache.TTL.DASHBOARD_STATS);

        return result;
    }
}

module.exports = new DashboardService();
