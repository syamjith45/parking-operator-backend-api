const entryService   = require('../../services/entryService');
const exitService    = require('../../services/exitService');
const pricingService = require('../../services/pricingService');
const orgService     = require('../../services/organizationService');  // NEW
const spaceService   = require('../../services/spaceService');          // NEW
const cache          = require('../../services/cacheService');
const { supabase, supabaseAdmin } = require('../../config/database');
const { requireRole, requireSameOrg } = require('../../middleware/auth');

const mutations = {

    // ─── Entry ────────────────────────────────────────────────────────────────

    logVehicleEntry: async (_, { input }, context) => {
        requireRole(context, ['operator', 'admin', 'manager']);
        
        let spaceId = null;
        
        if (context.staff.role === 'operator') {
            // Operators must be assigned to a space; use their assigned space
            if (!context.space) {
                throw new Error('Operator must be assigned to a space');
            }
            spaceId = context.space.id;
        } else if (context.staff.role === 'manager') {
            // Managers must provide space_id in input
            if (!input.space_id) {
                throw new Error('Manager must specify a space_id');
            }
            spaceId = input.space_id;
            
            // Validate the space belongs to manager's organization
            const { data: space } = await supabase
                .from('spaces')
                .select('id, organization_id')
                .eq('id', spaceId)
                .eq('organization_id', context.organization.id)
                .single();
            
            if (!space) {
                throw new Error('Space not found or does not belong to your organization');
            }
        } else if (context.staff.role === 'admin') {
            // Admins can specify space_id from input, or leave it null
            spaceId = input.space_id || null;
        }
        
        const result = await entryService.logEntry({
            driverPhone:           input.driver_phone,
            vehicleType:           input.vehicle_type,
            vehicleNumber:         input.vehicle_number,
            declaredDurationHours: input.declared_duration_hours || null,
            staffId:               context.staff.id,
            spaceId:               spaceId
        });

        // Invalidate dashboard caches on new entry
        if (spaceId) {
            await cache.invalidateDashboardCache(spaceId);
        }

        return result;
    },

    // ─── Exit ─────────────────────────────────────────────────────────────────

    processVehicleExit: async (_, { session_id }, context) => {
        requireRole(context, ['operator', 'admin', 'manager']);
        // Operators and admins must have space context; managers don't need it
        if (!context.space && context.staff.role === 'operator') {
            throw new Error('Operator must be assigned to a space');
        }
        const result = await exitService.processExit(session_id, context.staff.id);

        // Invalidate dashboard and revenue caches on exit
        if (context.space?.id) {
            await cache.invalidateDashboardCache(context.space.id);
            await cache.invalidateRevenueCache(context.space.id);
            await cache.invalidateTransactionCache(context.space.id);
        }

        return result;
    },

    // ─── Payment ──────────────────────────────────────────────────────────────

    collectOverstayPayment: async (_, { overstay_charge_id }, context) => {
        requireRole(context, ['operator', 'admin', 'manager']);
        const result = await exitService.collectOverstayPayment(overstay_charge_id, context.staff.id);

        // Invalidate revenue caches on payment collection
        if (context.space?.id) {
            await cache.invalidateRevenueCache(context.space.id);
        }

        return result;
    },

    // ─── Pricing ──────────────────────────────────────────────────────────────

    updatePricingRules: async (_, { rules }, context) => {
        requireRole(context, ['admin', 'manager']);
        // Org-level pricing check: if no space context, verify org ownership
        if (!context.space && context.staff.role !== 'admin') {
            requireSameOrg(context, context.organization?.id || null);
        }

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

    createOperator: async (_, { input }, context) => {
        requireRole(context, ['admin', 'manager']);

        const managerOrgId = context.organization?.id || context.staff?.organization_id || null;
        let organizationId = input.organization_id || managerOrgId;

        if (context.staff.role === 'manager') {
            if (!managerOrgId) {
                throw new Error('Manager is not linked to an organization');
            }
            if (input.organization_id && input.organization_id !== managerOrgId) {
                throw new Error('Managers can only create operators for their own organization');
            }
            organizationId = managerOrgId;
        }

        if (!organizationId) {
            throw new Error('organization_id is required');
        }

        if (!input.space_id) {
            throw new Error('space_id is required for operator creation');
        }

        const { data: space, error: spaceError } = await supabase
            .from('spaces')
            .select('id, organization_id')
            .eq('id', input.space_id)
            .single();

        if (spaceError || !space) {
            throw new Error('Space not found');
        }

        if (space.organization_id !== organizationId) {
            throw new Error('Space does not belong to the selected organization');
        }

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: input.email,
            password: input.password,
            email_confirm: true
        });

        if (authError || !authData?.user) {
            throw new Error(authError?.message || 'Failed to create auth user');
        }

        const { data: staffData, error: staffError } = await supabase
            .from('staff')
            .insert([{
                user_id: authData.user.id,
                name: input.name,
                email: input.email,
                phone: input.phone || null,
                role: 'operator',
                organization_id: organizationId,
                space_id: input.space_id,
                is_active: true
            }])
            .select()
            .single();

        if (staffError || !staffData) {
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            throw new Error('Failed to create operator staff record');
        }

        return staffData;
    },

    assignOperatorToSpace: async (_, { staff_id, space_id }, context) => {
        requireRole(context, ['admin', 'manager']);
        const result = await spaceService.reassignOperator(staff_id, space_id, { force: false });
        return result.staff;
    },

    reassignOperator: async (_, { staff_id, space_id, force }, context) => {
        requireRole(context, ['admin', 'manager']);
        return await spaceService.reassignOperator(staff_id, space_id, { force: force || false });
    },

    // ─── Overstay Slabs (NEW) ─────────────────────────────────────────────────

    setOrganizationPricingType: async (_, { id, pricing_type_id }, context) => {
        requireRole(context, ['admin', 'manager']);
        requireSameOrg(context, id);
        return await pricingService.setOrganizationPricingType(id, pricing_type_id);
    },

    createOverstaySlab: async (_, { organization_id, input }, context) => {
        requireRole(context, ['admin', 'manager']);
        requireSameOrg(context, organization_id);
        return await pricingService.createOverstaySlab(organization_id, input);
    },

    updateOverstaySlab: async (_, { id, input }, context) => {
        requireRole(context, ['admin', 'manager']);
        // Get the slab to check organization ownership
        const slab = await pricingService.getSlabById(id);
        requireSameOrg(context, slab.organization_id);
        return await pricingService.updateOverstaySlab(id, input);
    },

    deleteOverstaySlab: async (_, { id }, context) => {
        requireRole(context, ['admin', 'manager']);
        // Get the slab to check organization ownership
        const slab = await pricingService.getSlabById(id);
        requireSameOrg(context, slab.organization_id);
        return await pricingService.deleteOverstaySlab(id);
    }
};

module.exports = mutations;
