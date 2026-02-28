const { supabase } = require('../config/database');
const pricingService = require('./pricingService');
const { calculateOverstayFee, calculateDurationMinutes } = require('../utils/calculations');
const { getCurrentTimestamp } = require('../utils/dateHelpers');

class TransactionService {
    /**
     * Get transaction history with filters and pagination
     */
    async getTransactionHistory({
        page = 1,
        pageSize = 20,
        status,
        vehicleType,
        startDate,
        endDate,
        search
    }, staff = null) {
        let query = supabase
            .from('vehicles')
            .select(`
                *,
                created_by_staff:staff!created_by(id, name, role, phone, email),
                overstay_charges(*)
            `, { count: 'exact' });

        // Apply filters
        if (status) {
            query = query.eq('status', status);
        }

        if (vehicleType) {
            query = query.eq('vehicle_type', vehicleType);
        }

        if (startDate) {
            query = query.gte('entry_time', startDate);
        }

        if (endDate) {
            query = query.lte('entry_time', endDate);
        }

        if (search) {
            query = query.or(`vehicle_number.ilike.%${search}%,driver_phone.ilike.%${search}%,session_id.ilike.%${search}%`);
        }

        if (staff && staff.role !== 'admin') {
            query = query.eq('created_by', staff.id);
        }

        // Apply pagination
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to).order('entry_time', { ascending: false });

        const { data: vehicles, count, error } = await query;

        if (error) {
            console.error('Failed to fetch transaction history:', error);
            throw new Error(`Failed to fetch transaction history: ${error.message}`);
        }

        // Fetch pricing rules to compute stats on the fly
        const pricingRulesArray = await pricingService.getAllPricingRules();
        const pricingRulesMap = {};
        pricingRulesArray.forEach(rule => {
            pricingRulesMap[rule.vehicle_type.toLowerCase()] = rule;
        });

        const transactions = vehicles.map(vehicle => {
            // Determine exit time to use for duration calculation
            const endTime = vehicle.exit_time || getCurrentTimestamp();

            // Recompute duration on the fly to get current duration for ACTIVE sessions
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

                const overstayDetails = calculateOverstayFee(
                    durationMinutes > 0 ? durationMinutes : 0,
                    baseMinutes,
                    rule.extra_hour_rate
                );

                overstayMinutes = overstayDetails.overstayMinutes;
                computedOverstayFee = overstayDetails.overstayFee;
            }

            // For completed, if there is a recorded overstay charge, we can refer to it
            // but the prompt says to "compute duration_minutes, overstay_fee, and total_amount on the fly."

            const totalAmount = parseFloat(vehicle.base_fee_paid || 0) + computedOverstayFee;

            return {
                ...vehicle,
                duration_minutes: durationMinutes,
                overstay_minutes: overstayMinutes,
                overstay_fee: computedOverstayFee,
                total_amount: totalAmount,
                // Supabase joins arrays, usually named overstay_charges
                overstay_charges: vehicle.overstay_charges || []
            };
        });

        return {
            records: transactions,
            total_count: count || 0,
            page,
            page_size: pageSize,
            total_pages: Math.ceil((count || 0) / pageSize)
        };
    }
}

module.exports = new TransactionService();
