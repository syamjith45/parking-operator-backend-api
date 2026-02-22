const entryService = require('../../services/entryService');
const exitService = require('../../services/exitService');
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
    }
};

module.exports = mutations;
