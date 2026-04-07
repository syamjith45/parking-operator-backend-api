const entryService   = require('../../services/entryService');
const exitService    = require('../../services/exitService');
const pricingService = require('../../services/pricingService');
const orgService     = require('../../services/organizationService');  // NEW
const spaceService   = require('../../services/spaceService');          // NEW
const { requireRole, requireSameOrg } = require('../../middleware/auth');

const mutations = {

    // ─── Entry ────────────────────────────────────────────────────────────────

    logVehicleEntry: async (_, { input }, context) => {
        requireRole(context, ['operator', 'admin', 'manager']);
        return await entryService.logEntry({
            driverPhone:           input.driver_phone,
            vehicleType:           input.vehicle_type,
            vehicleNumber:         input.vehicle_number,
            declaredDurationHours: input.declared_duration_hours || null,
            staffId:               context.staff.id,
            spaceId:               context.space?.id || null   // CHANGE: pass space from context
        });
    },

    // ─── Exit ─────────────────────────────────────────────────────────────────

    processVehicleExit: async (_, { session_id }, context) => {
        requireRole(context, ['operator', 'admin', 'manager']);
        return await exitService.processExit(session_id, context.staff.id);
    },

    // ─── Payment ──────────────────────────────────────────────────────────────

    collectOverstayPayment: async (_, { overstay_charge_id }, context) => {
        requireRole(context, ['operator', 'admin', 'manager']);
        return await exitService.collectOverstayPayment(overstay_charge_id, context.staff.id);
    },

    // ─── Pricing ──────────────────────────────────────────────────────────────

    updatePricingRules: async (_, { rules }, context) => {
        requireRole(context, ['admin', 'manager']);

        const updatedRules = [];
        for (const rule of rules) {
            const { vehicle_type, ...updates } = rule;

            const dbUpdates = {};
            if (updates.base_fee        !== undefined) dbUpdates.base_fee        = updates.base_fee;
            if (updates.base_hours      !== undefined) dbUpdates.base_hours      = updates.base_hours;
            if (updates.extra_hour_rate !== undefined) dbUpdates.extra_hour_rate = updates.extra_hour_rate;

            if (Object.keys(dbUpdates).length > 0) {
                const updated = await pricingService.updatePricingRule(
                    vehicle_type,
                    dbUpdates,
                    context.space?.id   // CHANGE: scoped to caller's space
                );
                updatedRules.push(updated);
            }
        }
        return updatedRules;
    },

    // ─── Organizations (NEW) ──────────────────────────────────────────────────

    createOrganization: async (_, { input }, context) => {
        requireRole(context, ['admin']);
        return await orgService.createOrganization({
            ...input,
            ownerId: context.staff.id
        });
    },

    updateOrganization: async (_, { id, input }, context) => {
        requireRole(context, ['admin', 'manager']);
        requireSameOrg(context, id);
        return await orgService.updateOrganization(id, input);
    },

    deactivateOrganization: async (_, { id }, context) => {
        requireRole(context, ['admin']);
        return await orgService.deactivateOrganization(id);
    },

    // ─── Spaces (NEW) ─────────────────────────────────────────────────────────

    createSpace: async (_, { input }, context) => {
        requireRole(context, ['admin', 'manager']);
        requireSameOrg(context, input.organization_id);
        return await spaceService.createSpace({
            organizationId: input.organization_id,
            name:           input.name,
            location:       input.location,
            capacity:       input.capacity
        });
    },

    updateSpace: async (_, { id, input }, context) => {
        requireRole(context, ['admin', 'manager']);
        const space = await spaceService.getSpace(id);
        requireSameOrg(context, space.organization_id);
        return await spaceService.updateSpace(id, input);
    },

    assignOperatorToSpace: async (_, { staff_id, space_id }, context) => {
        requireRole(context, ['admin', 'manager']);
        const result = await spaceService.reassignOperator(staff_id, space_id, { force: false });
        return result.staff;
    },

    reassignOperator: async (_, { staff_id, space_id, force }, context) => {
        requireRole(context, ['admin', 'manager']);
        return await spaceService.reassignOperator(staff_id, space_id, { force: force || false });
    }
};

module.exports = mutations;
