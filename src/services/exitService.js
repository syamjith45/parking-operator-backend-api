const { supabase } = require('../config/database');
const pricingService = require('./pricingService');
const { calculateOverstayFee, calculateDurationMinutes } = require('../utils/calculations');
const { getCurrentTimestamp } = require('../utils/dateHelpers');

class ExitService {
    /**
     * Process vehicle exit
     */
    async processExit(sessionId, staffId) {
        // Fetch active session
        const { data: vehicle, error: fetchError } = await supabase
            .from('vehicles')
            .select(`
        *,
        created_by_staff:staff!created_by(id, name)
      `)
            .eq('session_id', sessionId)
            .eq('status', 'ACTIVE')
            .single();

        if (fetchError || !vehicle) {
            throw new Error('Active session not found');
        }

        // Get pricing rule
        const pricingRule = await pricingService.getPricingRule(vehicle.vehicle_type);

        // Calculate duration
        const exitTime = getCurrentTimestamp();
        const durationMinutes = calculateDurationMinutes(vehicle.entry_time, exitTime);

        // Calculate overstay
        const baseMinutes = pricingRule.base_hours * 60;
        const { overstayMinutes, overstayFee } = calculateOverstayFee(
            durationMinutes > 0 ? durationMinutes : 0, // Ensure non-negative
            baseMinutes,
            pricingRule.extra_hour_rate
        );

        // Update vehicle status to EXITED
        // In a real scenario, we might want to use a transaction or RPC call for atomicity
        const { error: updateError } = await supabase
            .from('vehicles')
            .update({
                exit_time: exitTime,
                status: 'EXITED',
                updated_at: exitTime
            })
            .eq('id', vehicle.id);

        if (updateError) {
            throw new Error('Failed to update vehicle exit status');
        }

        let overstayRecord = null;

        // Create overstay charge if applicable
        if (overstayFee > 0) {
            const { data: charge, error: chargeError } = await supabase
                .from('overstay_charges')
                .insert({
                    vehicle_id: vehicle.id,
                    overstay_minutes: overstayMinutes,
                    fee_amount: overstayFee,
                    is_collected: false
                })
                .select()
                .single();

            if (chargeError) {
                console.error('Failed to create overstay charge:', chargeError);
                // Note: The vehicle is already exited, but the charge failed. 
                // We might want to handle this better (e.g. valid manual intervention).
            } else {
                overstayRecord = charge;
            }
        }

        return {
            session_id: vehicle.session_id,
            vehicle_type: vehicle.vehicle_type,
            driver_phone: vehicle.driver_phone,
            entry_time: vehicle.entry_time,
            exit_time: exitTime,
            duration_minutes: durationMinutes,
            base_fee_paid: vehicle.base_fee_paid,
            overstay_minutes: overstayMinutes,
            overstay_fee: overstayFee,
            total_amount: parseFloat(vehicle.base_fee_paid) + overstayFee,
            overstay_record: overstayRecord,
            processed_by_staff: staffId
        };
    }

    /**
     * Collect overstay payment
     */
    async collectOverstayPayment(overstayChargeId, staffId) {
        // Check if valid staff
        // In production, context should already have validated staff

        const { data, error } = await supabase
            .from('overstay_charges')
            .update({
                is_collected: true,
                collected_by: staffId,
                collected_at: getCurrentTimestamp()
            })
            .eq('id', overstayChargeId)
            .eq('is_collected', false) // Ensure it wasn't already collected
            .select()
            .single();

        if (error || !data) {
            throw new Error('Failed to collect overstay payment or already collected/not found');
        }

        return data;
    }
}

module.exports = new ExitService();
