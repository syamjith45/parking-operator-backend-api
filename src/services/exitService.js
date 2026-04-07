const { supabase } = require('../config/database');
const pricingService = require('./pricingService');
const { calculateOverstayFee, calculateDurationMinutes } = require('../utils/calculations');
const { getCurrentTimestamp } = require('../utils/dateHelpers');

class ExitService {

    /**
     * Process vehicle exit.
     * CHANGE: getPricingRule now receives vehicle.space_id (already stamped at entry).
     * No need to derive space from staff — it lives on the vehicle row itself.
     */
    async processExit(sessionId, staffId) {
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

        // CHANGE: pass vehicle.space_id — this was stamped at entry and never changes
        const pricingRule = await pricingService.getPricingRule(
            vehicle.vehicle_type,
            vehicle.space_id
        );

        const exitTime        = getCurrentTimestamp();
        const durationMinutes = calculateDurationMinutes(vehicle.entry_time, exitTime);

        const baseMinutes = Math.max(
            pricingRule.base_hours * 60,
            (vehicle.declared_duration_hours || 0) * 60
        );

        const { overstayMinutes, overstayFee } = calculateOverstayFee(
            durationMinutes > 0 ? durationMinutes : 0,
            baseMinutes,
            pricingRule.extra_hour_rate
        );

        const { error: updateError } = await supabase
            .from('vehicles')
            .update({
                exit_time:  exitTime,
                status:     'EXITED',
                updated_at: exitTime
            })
            .eq('id', vehicle.id);

        if (updateError) {
            throw new Error('Failed to update vehicle exit status');
        }

        let overstayRecord = null;

        if (overstayFee > 0) {
            const { data: charge, error: chargeError } = await supabase
                .from('overstay_charges')
                .insert({
                    vehicle_id:       vehicle.id,
                    overstay_minutes: overstayMinutes,
                    fee_amount:       overstayFee,
                    is_collected:     false
                })
                .select()
                .single();

            if (chargeError) {
                console.error('Failed to create overstay charge:', chargeError);
            } else {
                overstayRecord = charge;
            }
        }

        return {
            session_id:         vehicle.session_id,
            vehicle_type:       vehicle.vehicle_type,
            driver_phone:       vehicle.driver_phone,
            entry_time:         vehicle.entry_time,
            exit_time:          exitTime,
            duration_minutes:   durationMinutes,
            base_fee_paid:      vehicle.base_fee_paid,
            overstay_minutes:   overstayMinutes,
            overstay_fee:       overstayFee,
            total_amount:       parseFloat(vehicle.base_fee_paid) + overstayFee,
            overstay_record:    overstayRecord,
            processed_by_staff: staffId
        };
    }

    async collectOverstayPayment(overstayChargeId, staffId) {
        const { data, error } = await supabase
            .from('overstay_charges')
            .update({
                is_collected:  true,
                collected_by:  staffId,
                collected_at:  getCurrentTimestamp()
            })
            .eq('id', overstayChargeId)
            .eq('is_collected', false)
            .select()
            .single();

        if (error || !data) {
            throw new Error('Failed to collect overstay payment or already collected/not found');
        }

        return data;
    }
}

module.exports = new ExitService();
