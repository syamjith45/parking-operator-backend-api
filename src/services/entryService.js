const { supabase } = require('../config/database');
const pricingService = require('./pricingService');
const { validatePhoneNumber, validateVehicleType, sanitizeInput } = require('../utils/validators');
const { getCurrentTimestamp } = require('../utils/dateHelpers');

class EntryService {

    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 7);
        return `PKG-${timestamp}-${random}`.toUpperCase();
    }

    /**
     * Log a vehicle entry.
     * CHANGE: now accepts spaceId from context and stamps it on the vehicle row.
     */
    async logEntry(input) {
        const {
            driverPhone,
            vehicleType,
            vehicleNumber,
            staffId,
            declaredDurationHours,
            spaceId   // NEW — passed from context.staff.space_id in the resolver
        } = input;

        if (!validatePhoneNumber(driverPhone)) {
            throw new Error('Invalid phone number format');
        }

        if (!validateVehicleType(vehicleType)) {
            throw new Error('Invalid vehicle type. Must be: bike, car, or truck');
        }

        const cleanPhone         = sanitizeInput(driverPhone);
        const cleanVehicleType   = vehicleType.toLowerCase();
        const cleanVehicleNumber = vehicleNumber ? sanitizeInput(vehicleNumber) : null;

        // CHANGE: pass spaceId so pricing is fetched for this specific space
        const pricingRule = await pricingService.getPricingRule(cleanVehicleType, spaceId);

        let baseFee = pricingRule.base_fee;
        if (declaredDurationHours && declaredDurationHours > pricingRule.base_hours) {
            const extraHours = declaredDurationHours - pricingRule.base_hours;
            baseFee = pricingRule.base_fee + (extraHours * pricingRule.extra_hour_rate);
        }

        const { data: staff, error: staffError } = await supabase
            .from('staff')
            .select('id')
            .eq('id', staffId)
            .single();

        if (staffError || !staff) {
            throw new Error('Invalid staff ID');
        }

        const existingSession = await this.checkActiveSession(cleanPhone);
        if (existingSession) {
            throw new Error(`Active session already exists for this number: ${existingSession.session_id}`);
        }

        const sessionId = this.generateSessionId();
        const entryTime = getCurrentTimestamp();

        const { data: vehicle, error: vehicleError } = await supabase
            .from('vehicles')
            .insert({
                session_id:              sessionId,
                driver_phone:            cleanPhone,
                vehicle_type:            cleanVehicleType,
                vehicle_number:          cleanVehicleNumber,
                entry_time:              entryTime,
                status:                  'ACTIVE',
                base_fee_paid:           baseFee,
                declared_duration_hours: declaredDurationHours || null,
                created_by:              staffId,
                space_id:                spaceId || null   // NEW — stamped permanently here
            })
            .select(`
                *,
                created_by_staff:staff!created_by(id, name, role)
            `)
            .single();

        if (vehicleError) {
            console.error('Entry error:', vehicleError);
            throw new Error('Failed to log vehicle entry');
        }

        return {
            ...vehicle,
            pricing_rule: pricingRule
        };
    }

    async checkActiveSession(driverPhone) {
        const { data, error } = await supabase
            .from('vehicles')
            .select('id, session_id, vehicle_type, entry_time')
            .eq('driver_phone', driverPhone)
            .eq('status', 'ACTIVE')
            .order('entry_time', { ascending: false })
            .limit(1);

        if (error) {
            console.warn('Error checking active session:', error);
            return null;
        }

        return data && data.length > 0 ? data[0] : null;
    }
}

module.exports = new EntryService();
