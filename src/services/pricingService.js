const { supabase } = require('../config/database');

class PricingService {
    /**
     * Get pricing rule for vehicle type
     */
    async getPricingRule(vehicleType) {
        const { data, error } = await supabase
            .from('pricing_rules')
            .select('*')
            .eq('vehicle_type', vehicleType.toLowerCase())
            .eq('is_active', true)
            .single();

        if (error || !data) {
            throw new Error(`Pricing rule not found for vehicle type: ${vehicleType}`);
        }

        return data;
    }

    /**
     * Get all active pricing rules
     */
    async getAllPricingRules() {
        const { data, error } = await supabase
            .from('pricing_rules')
            .select('*')
            .eq('is_active', true)
            .order('vehicle_type');

        if (error) {
            throw new Error('Failed to fetch pricing rules');
        }

        return data || [];
    }

    /**
     * Update pricing rule (admin only)
     */
    async updatePricingRule(vehicleType, updates) {
        const { data, error } = await supabase
            .from('pricing_rules')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('vehicle_type', vehicleType)
            .select()
            .single();

        if (error) {
            throw new Error('Failed to update pricing rule');
        }

        return data;
    }
}

module.exports = new PricingService();
