const entryService = require('../../services/entryService');
const exitService = require('../../services/exitService');
const pricingService = require('../../services/pricingService');
const { requireRole } = require('../../middleware/auth');

const mutations = {
    // Entry mutation
    logVehicleEntry: async (_, { input }, context) => {
        requireRole(context, ['operator', 'admin', 'manager']);
        // Inject staff_id from authenticated user
        const entryInput = {
            driverPhone: input.driver_phone,
            vehicleType: input.vehicle_type,
            vehicleNumber: input.vehicle_number,
            declaredDurationHours: input.declared_duration_hours || null,
            staffId: context.staff.id
        };
        return await entryService.logEntry(entryInput);
    },

    // Exit mutation
    processVehicleExit: async (_, { session_id }, context) => {
        requireRole(context, ['operator', 'admin', 'manager']);
        return await exitService.processExit(session_id, context.staff.id);
    },

    // Payment mutation
    collectOverstayPayment: async (_, { overstay_charge_id }, context) => {
        requireRole(context, ['operator', 'admin', 'manager']);
        return await exitService.collectOverstayPayment(overstay_charge_id, context.staff.id);
    },

    // Configuration mutation
    updatePricingRules: async (_, { rules }, context) => {
        requireRole(context, ['admin', 'manager']);

        const updatedRules = [];
        for (const rule of rules) {
            const { vehicle_type, ...updates } = rule;

            // Filter to only allowed DB columns
            const dbUpdates = {};
            if (updates.base_fee !== undefined) dbUpdates.base_fee = updates.base_fee;
            if (updates.base_hours !== undefined) dbUpdates.base_hours = updates.base_hours;
            if (updates.extra_hour_rate !== undefined) dbUpdates.extra_hour_rate = updates.extra_hour_rate;

            if (Object.keys(dbUpdates).length > 0) {
                const updated = await pricingService.updatePricingRule(vehicle_type, dbUpdates);
                updatedRules.push(updated);
            }
        }
        return updatedRules;
    }
};

module.exports = mutations;
