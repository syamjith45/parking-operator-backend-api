const dashboardService = require('../../services/dashboardService');
const revenueService = require('../../services/revenueService');
const pricingService = require('../../services/pricingService');
const transactionService = require('../../services/transactionService');
const { supabase } = require('../../config/database');

const queries = {
    // Dashboard queries
    activeVehicles: async () => {
        return await dashboardService.getActiveVehicles();
    },

    getVehicleBySession: async (_, { session_id }) => {
        return await dashboardService.getVehicleBySession(session_id);
    },

    dashboardStats: async () => {
        return await dashboardService.getTodayStats();
    },

    // Pricing queries
    pricingRules: async () => {
        return await pricingService.getAllPricingRules();
    },

    getPricingRule: async (_, { vehicle_type }) => {
        return await pricingService.getPricingRule(vehicle_type);
    },

    // Revenue queries
    revenueSummary: async (_, { start_date, end_date }) => {
        return await revenueService.getRevenueSummary(start_date, end_date);
    },

    pendingOverstayCharges: async () => {
        return await revenueService.getPendingOverstayCharges();
    },

    // Staff queries
    staff: async (_, { id }) => {
        const { data, error } = await supabase
            .from('staff')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            throw new Error('Staff member not found');
        }

        return data;
    },

    me: async (_, __, context) => {
        if (!context.staff) {
            throw new Error('Not authenticated');
        }
        return context.staff;
    },

    transactionHistory: async (_, { page, page_size, status, vehicle_type, start_date, end_date, search }) => {
        return await transactionService.getTransactionHistory({
            page: page || 1,
            pageSize: page_size || 20,
            status,
            vehicleType: vehicle_type,
            startDate: start_date,
            endDate: end_date,
            search
        });
    }
};

module.exports = queries;
