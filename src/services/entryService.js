const { supabase } = require('../config/database');
const pricingService = require('./pricingService');
const { validatePhoneNumber, validateVehicleType, sanitizeInput } = require('../utils/validators');
const { getCurrentTimestamp } = require('../utils/dateHelpers');

class EntryService {
    /**
     * Generate unique session ID
     */
    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 7);
        return `PKG-${timestamp}-${random}`.toUpperCase();
    }

    /**
     * Log vehicle entry
     */
    async logEntry(input) {
        const { driverPhone, vehicleType, vehicleNumber, staffId, declaredDurationHours } = input;

        // Validate inputs
        if (!validatePhoneNumber(driverPhone)) {
            throw new Error('Invalid phone number format');
        }

        if (!validateVehicleType(vehicleType)) {
            throw new Error('Invalid vehicle type. Must be: bike, car, or truck');
        }

        // Sanitize inputs
        const cleanPhone = sanitizeInput(driverPhone);
        const cleanVehicleType = vehicleType.toLowerCase();
        const cleanVehicleNumber = vehicleNumber ? sanitizeInput(vehicleNumber) : null;

        // Get pricing rule
        const pricingRule = await pricingService.getPricingRule(cleanVehicleType);

        let baseFee = pricingRule.base_fee;

        if (declaredDurationHours && declaredDurationHours > pricingRule.base_hours) {
            // Charge extra for pre-declared hours beyond base
            const extraHours = declaredDurationHours - pricingRule.base_hours;
            baseFee = pricingRule.base_fee + (extraHours * pricingRule.extra_hour_rate);
        }

        // Verify staff exists
        const { data: staff, error: staffError } = await supabase
            .from('staff')
            .select('id')
            .eq('id', staffId)
            .single();

        if (staffError || !staff) {
            throw new Error('Invalid staff ID');
        }

        // Check for existing active session
        const existingSession = await this.checkActiveSession(cleanPhone);
        if (existingSession) {
            throw new Error(`Active session already exists for this number: ${existingSession.session_id}`);
        }

        // Create session
        const sessionId = this.generateSessionId();
        const entryTime = getCurrentTimestamp();

        const { data: vehicle, error: vehicleError } = await supabase
            .from('vehicles')
            .insert({
                session_id: sessionId,
                driver_phone: cleanPhone,
                vehicle_type: cleanVehicleType,
                vehicle_number: cleanVehicleNumber,
                entry_time: entryTime,
                status: 'ACTIVE',
                base_fee_paid: baseFee,
                declared_duration_hours: declaredDurationHours || null,
                created_by: staffId
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

    /**
     * Check for existing active sessions for phone number
     */
    async checkActiveSession(driverPhone) {
        const { data, error } = await supabase
            .from('vehicles')
            .select('id, session_id, vehicle_type, entry_time')
            .eq('driver_phone', driverPhone)
            .eq('status', 'ACTIVE')
            .order('entry_time', { ascending: false })
            .limit(1);

        if (error) {
            // Don't throw here, just return null or log warning
            console.warn('Error checking active session:', error);
            return null;
        }

        return data && data.length > 0 ? data[0] : null;
    }
}

module.exports = new EntryService();
