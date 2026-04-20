const dashboardService   = require('../../services/dashboardService');
const revenueService     = require('../../services/revenueService');
const pricingService     = require('../../services/pricingService');
const transactionService = require('../../services/transactionService');
const orgService         = require('../../services/organizationService');   // NEW
const spaceService       = require('../../services/spaceService');           // NEW
const { supabase }       = require('../../config/database');
const { requireRole, requireSameOrg, requireAuth } = require('../../middleware/auth');

const queries = {

    // ─── Dashboard ────────────────────────────────────────────────────────────

    // CHANGE: pass full context (was: context.staff only)
    activeVehicles: async (_, __, context) => {
        return await dashboardService.getActiveVehicles(context);
    },

    getVehicleBySession: async (_, { session_id }, context) => {
        requireAuth(context);
        return await dashboardService.getVehicleBySession(session_id);
    },

    // CHANGE: pass full context (was: context.staff only)
    dashboardStats: async (_, __, context) => {
        return await dashboardService.getTodayStats(context);
    },

    // ─── Pricing ──────────────────────────────────────────────────────────────

    // CHANGE: pass context.space?.id for scoped pricing
    pricingRules: async (_, __, context) => {
        // Managers can access pricing rules without space assignment
        if (!context.space && context.staff?.role === 'operator') {
            throw new Error('Operator must be assigned to a space');
        }
        return await pricingService.getAllPricingRules(context.space?.id);
    },

    getPricingRule: async (_, { vehicle_type }, context) => {
        // Managers can access pricing rules without space assignment
        if (!context.space && context.staff?.role === 'operator') {
            throw new Error('Operator must be assigned to a space');
        }
        return await pricingService.getPricingRule(vehicle_type, context.space?.id);
    },

    pricingTypes: async (_, __, context) => {
        requireAuth(context);
        return await pricingService.getAllPricingTypes();
    },

    vehicleTypes: async (_, __, context) => {
        requireAuth(context);
        return [
            { id: '1', code: 'four_wheeler', label: 'Four Wheeler' },
            { id: '2', code: 'two_wheeler', label: 'Two Wheeler' },
            { id: '3', code: 'truck', label: 'Truck' },
            { id: '4', code: 'van', label: 'Van' },
            { id: '5', code: 'car_special_care', label: 'Car (Special Care)' }
        ];
    },

    // ─── Revenue ──────────────────────────────────────────────────────────────

    // CHANGE: pass full context as third arg
    revenueSummary: async (_, { start_date, end_date }, context) => {
        // Managers can access revenue data without space assignment
        if (!context.space && context.staff?.role === 'operator') {
            throw new Error('Operator must be assigned to a space');
        }
        return await revenueService.getRevenueSummary(start_date, end_date, context);
    },

    // CHANGE: pass full context
    pendingOverstayCharges: async (_, __, context) => {
        // Managers can access overstay charges without space assignment
        if (!context.space && context.staff?.role === 'operator') {
            throw new Error('Operator must be assigned to a space');
        }
        return await revenueService.getPendingOverstayCharges(context);
    },

    // ─── Staff ────────────────────────────────────────────────────────────────

    staff: async (_, { id }, context) => {
        requireAuth(context);
        const { data, error } = await supabase
            .from('staff')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error('Staff member not found');
        return data;
    },

    me: async (_, __, context) => {
        if (!context.staff) throw new Error('Not authenticated');
        return context.staff;
    },

    myProfile: async (_, __, context) => {
        if (!context.staff) throw new Error('Not authenticated');
        return {
            ...context.staff,
            space: context.space || null,
            organization: context.organization || null
        };
    },

     // ─── Transactions ─────────────────────────────────────────────────────────

    // CHANGE: pass full context instead of context.staff
    transactionHistory: async (_, { page, page_size, status, vehicle_type, start_date, end_date, search }, context) => {
        // Managers can access transaction history without space assignment
        if (!context.space && context.staff?.role === 'operator') {
            throw new Error('Operator must be assigned to a space');
        }
        return await transactionService.getTransactionHistory({
            page:        page       || 1,
            pageSize:    page_size  || 20,
            status,
            vehicleType: vehicle_type,
            startDate:   start_date,
            endDate:     end_date,
            search
        }, context);
    },

    // ─── Organizations (NEW) ──────────────────────────────────────────────────

    organization: async (_, { id }, context) => {
        requireSameOrg(context, id);
        return await orgService.getOrganizationWithPricingType(id);
    },

    organizations: async (_, __, context) => {
        requireRole(context, ['admin']);
        return await orgService.listOrganizations();
    },

    myOrganization: async (_, __, context) => {
        const orgId = context.organization?.id || context.staff?.organization_id;
        if (!orgId) throw new Error('No organization associated with your account');
        return await orgService.getOrganizationWithPricingType(orgId);
    },

    orgStats: async (_, { id }, context) => {
        const orgId = id || context.organization?.id || context.staff?.organization_id;
        if (!orgId) throw new Error('Organization ID required');
        requireSameOrg(context, orgId);
        return await orgService.getOrgStats(orgId);
    },

    adminGlobalStats: async (_, { organization_id, start_date, end_date, vehicle_type }, context) => {
        requireRole(context, ['admin']);
        return await orgService.getAdminGlobalStats({
            organizationId: organization_id || null,
            startDate: start_date || null,
            endDate: end_date || null,
            vehicleType: vehicle_type || null
        });
    },

    // ─── Spaces (NEW) ─────────────────────────────────────────────────────────

    spaces: async (_, { organization_id }, context) => {
        requireSameOrg(context, organization_id);
        return await spaceService.getSpacesByOrg(organization_id);
    },

    mySpaces: async (_, __, context) => {
        if (!context.organization) {
            throw new Error('No organization associated with your account');
        }
        return await spaceService.getSpacesByOrg(context.organization.id);
    },

    space: async (_, { id }, context) => {
        requireAuth(context);
        return await spaceService.getSpace(id);
    },

    spaceOperators: async (_, { space_id }, context) => {
        requireRole(context, ['admin', 'manager']);
        const space = await spaceService.getSpace(space_id);
        requireSameOrg(context, space.organization_id);
        return await spaceService.getSpaceOperators(space_id);
    },

    organizationOperators: async (_, { organization_id }, context) => {
        requireRole(context, ['admin', 'manager']);
        requireSameOrg(context, organization_id);
        return await spaceService.getOrganizationOperators(organization_id);
    },

    reassignmentBlockers: async (_, { staff_id }, context) => {
        requireRole(context, ['admin', 'manager']);
        return await spaceService.getReassignmentBlockers(staff_id);
    },

    // ─── Overstay Slabs (NEW) ─────────────────────────────────────────────────

    overstaySlabs: async (_, { organization_id, vehicle_type }, context) => {
        requireSameOrg(context, organization_id);
        return await pricingService.getOverstaySlabs(organization_id, vehicle_type);
    }
};

module.exports = queries;
