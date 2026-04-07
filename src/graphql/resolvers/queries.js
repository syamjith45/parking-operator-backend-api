const dashboardService   = require('../../services/dashboardService');
const revenueService     = require('../../services/revenueService');
const pricingService     = require('../../services/pricingService');
const transactionService = require('../../services/transactionService');
const orgService         = require('../../services/organizationService');   // NEW
const spaceService       = require('../../services/spaceService');           // NEW
const { supabase }       = require('../../config/database');
const { requireRole, requireSameOrg } = require('../../middleware/auth');

const queries = {

    // ─── Dashboard ────────────────────────────────────────────────────────────

    // CHANGE: pass full context (was: context.staff only)
    activeVehicles: async (_, __, context) => {
        return await dashboardService.getActiveVehicles(context);
    },

    getVehicleBySession: async (_, { session_id }) => {
        return await dashboardService.getVehicleBySession(session_id);
    },

    // CHANGE: pass full context (was: context.staff only)
    dashboardStats: async (_, __, context) => {
        return await dashboardService.getTodayStats(context);
    },

    // ─── Pricing ──────────────────────────────────────────────────────────────

    // CHANGE: pass context.space?.id for scoped pricing
    pricingRules: async (_, __, context) => {
        return await pricingService.getAllPricingRules(context.space?.id);
    },

    getPricingRule: async (_, { vehicle_type }, context) => {
        return await pricingService.getPricingRule(vehicle_type, context.space?.id);
    },

    // ─── Revenue ──────────────────────────────────────────────────────────────

    // CHANGE: pass full context as third arg
    revenueSummary: async (_, { start_date, end_date }, context) => {
        return await revenueService.getRevenueSummary(start_date, end_date, context);
    },

    // CHANGE: pass full context
    pendingOverstayCharges: async (_, __, context) => {
        return await revenueService.getPendingOverstayCharges(context);
    },

    // ─── Staff ────────────────────────────────────────────────────────────────

    staff: async (_, { id }) => {
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
        return await orgService.getOrganization(id);
    },

    organizations: async (_, __, context) => {
        requireRole(context, ['admin']);
        return await orgService.listOrganizations();
    },

    myOrganization: async (_, __, context) => {
        if (!context.organization) throw new Error('No organization associated with your account');
        return context.organization;
    },

    orgStats: async (_, { id }, context) => {
        const orgId = id || context.organization?.id;
        if (!orgId) throw new Error('Organization ID required');
        requireSameOrg(context, orgId);
        return await orgService.getOrgStats(orgId);
    },

    // ─── Spaces (NEW) ─────────────────────────────────────────────────────────

    spaces: async (_, { organization_id }, context) => {
        requireSameOrg(context, organization_id);
        return await spaceService.getSpacesByOrg(organization_id);
    },

    space: async (_, { id }) => {
        return await spaceService.getSpace(id);
    },

    spaceOperators: async (_, { space_id }) => {
        return await spaceService.getSpaceOperators(space_id);
    },

    reassignmentBlockers: async (_, { staff_id }, context) => {
        requireRole(context, ['admin', 'manager']);
        return await spaceService.getReassignmentBlockers(staff_id);
    }
};

module.exports = queries;
