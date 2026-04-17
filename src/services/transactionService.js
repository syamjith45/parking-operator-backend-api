const { supabase }                                       = require('../config/database');
const pricingService                                     = require('./pricingService');
const { calculateOverstayFee, calculateSlabBasedOverstayFee, calculateDurationMinutes } = require('../utils/calculations');
const { getCurrentTimestamp }                            = require('../utils/dateHelpers');
const cache                                              = require('./cacheService');

class TransactionService {

    /**
     * CHANGE: second argument is now `context` (not just `staff`).
     * Scoping uses space_id for operators, org for managers, nothing for admin.
     */
    async getTransactionHistory({
        page = 1,
        pageSize = 20,
        status,
        vehicleType,
        startDate,
        endDate,
        search
    }, context = {}) {

        // Create cache key based on all filter parameters
        const { staff, organization, space } = context;
        const spaceId = space?.id || 'global';
        const cacheKey = `transactions:${spaceId}:${page}:${pageSize}:${status || 'all'}:${vehicleType || 'all'}:${startDate || 'none'}:${endDate || 'none'}:${search || 'none'}`;

        // Try cache first
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let query = supabase
            .from('vehicles')
            .select(`
                *,
                created_by_staff:staff!created_by!inner(id, name, role, phone, email, organization_id),
                overstay_charges(*)
            `, { count: 'exact' });

        if (status)      query = query.eq('status', status);
        if (vehicleType) query = query.eq('vehicle_type', vehicleType);
        if (startDate)   query = query.gte('entry_time', startDate);
        if (endDate)     query = query.lte('entry_time', endDate);
        if (search) {
            query = query.or(
                `vehicle_number.ilike.%${search}%,driver_phone.ilike.%${search}%,session_id.ilike.%${search}%`
            );
        }

        // CHANGE: space/org scoping replaces old created_by filter
        if (staff && staff.role !== 'admin') {
            if (staff.role === 'operator' && space) {
                query = query.eq('space_id', space.id);
            } else if (staff.role === 'manager' && organization) {
                query = query.eq('created_by_staff.organization_id', organization.id);
            }
        }

        const from = (page - 1) * pageSize;
        query = query.range(from, from + pageSize - 1).order('entry_time', { ascending: false });

        const { data: vehicles, count, error } = await query;

        if (error) {
            console.error('Failed to fetch transaction history:', error);
            throw new Error(`Failed to fetch transaction history: ${error.message}`);
        }

        // CHANGE: pass spaceId to get correct pricing rules for this space (now uses cache)
        const resolvedSpaceId = space?.id || null;
        const pricingRulesArray = await pricingService.getAllPricingRules(resolvedSpaceId);
        const pricingRulesMap   = {};
        pricingRulesArray.forEach(rule => {
            pricingRulesMap[rule.vehicle_type.toLowerCase()] = rule;
        });

        // Get organization ID for slab-based pricing
        const organizationId = organization?.id || space?.organization_id || null;
        let pricingType = 'hourly';
        let slabs = [];

        if (organizationId) {
            pricingType = await pricingService.getOrganizationPricingType(organizationId);
            if (pricingType === 'slab') {
                slabs = await pricingService.getOverstaySlabs(organizationId);
            }
        }

        const transactions = vehicles.map(vehicle => {
            const endTime         = vehicle.exit_time || getCurrentTimestamp();
            const durationMinutes = vehicle.exit_time && vehicle.duration_minutes !== null
                ? vehicle.duration_minutes
                : calculateDurationMinutes(vehicle.entry_time, endTime);

            let overstayMinutes = 0;
            let computedOverstayFee = 0;

            const rule = pricingRulesMap[vehicle.vehicle_type.toLowerCase()];
            if (rule) {
                const baseMinutes = Math.max(
                    rule.base_hours * 60,
                    (vehicle.declared_duration_hours || 0) * 60
                );

                if (pricingType === 'slab' && slabs.length > 0) {
                    // Use slab-based calculation
                    const slabResult = calculateSlabBasedOverstayFee(
                        durationMinutes > 0 ? durationMinutes : 0,
                        baseMinutes,
                        slabs
                    );
                    overstayMinutes     = slabResult.overstayMinutes;
                    computedOverstayFee = slabResult.overstayFee;
                } else {
                    // Use hourly calculation (default)
                    const overstayDetails = calculateOverstayFee(
                        durationMinutes > 0 ? durationMinutes : 0,
                        baseMinutes,
                        rule.extra_hour_rate
                    );
                    overstayMinutes     = overstayDetails.overstayMinutes;
                    computedOverstayFee = overstayDetails.overstayFee;
                }
            }

            return {
                ...vehicle,
                duration_minutes: durationMinutes,
                overstay_minutes: overstayMinutes,
                overstay_fee:     computedOverstayFee,
                total_amount:     parseFloat(vehicle.base_fee_paid || 0) + computedOverstayFee,
                overstay_charges: vehicle.overstay_charges || []
            };
        });

        const result = {
            records:     transactions,
            total_count: count || 0,
            page,
            page_size:   pageSize,
            total_pages: Math.ceil((count || 0) / pageSize)
        };

        // Cache the result
        await cache.set(cacheKey, result, cache.TTL.TRANSACTIONS);

        return result;
    }
}

module.exports = new TransactionService();
