const { supabase } = require('../config/database');

class PricingService {

    /**
     * Get pricing rule for a vehicle type scoped to a space.
     * Falls back to global (null space) rules if space-specific rule does not exist.
     */
    async getPricingRule(vehicleType, spaceId = null) {
        let query = supabase
            .from('pricing_rules')
            .select('*')
            .eq('vehicle_type', vehicleType.toLowerCase())
            .eq('is_active', true);

        if (spaceId) {
            query = query.eq('space_id', spaceId);
        } else {
            query = query.is('space_id', null);
        }

        let { data, error } = await query.maybeSingle();

        // Fallback to global rule if space-specific rule is not found
        if (!data && spaceId) {
            const fallbackQuery = supabase
                .from('pricing_rules')
                .select('*')
                .eq('vehicle_type', vehicleType.toLowerCase())
                .eq('is_active', true)
                .is('space_id', null);
            
            const result = await fallbackQuery.maybeSingle();
            data = result.data;
            error = result.error;
        }

        if (error || !data) {
            throw new Error(`Pricing rule not found for vehicle type: ${vehicleType}`);
        }

        return data;
    }

    /**
     * Get all active pricing rules, scoped to a space, merged with global rules.
     */
    async getAllPricingRules(spaceId = null) {
        // Fetch global rules
        const { data: globalRules, error: globalError } = await supabase
            .from('pricing_rules')
            .select('*')
            .eq('is_active', true)
            .is('space_id', null)
            .order('vehicle_type');

        if (globalError) {
            throw new Error('Failed to fetch global pricing rules');
        }

        if (!spaceId) {
             return globalRules || [];
        }

        // Fetch space-specific rules
        const { data: spaceRules, error: spaceError } = await supabase
            .from('pricing_rules')
            .select('*')
            .eq('is_active', true)
            .eq('space_id', spaceId);

        if (spaceError) {
            throw new Error('Failed to fetch space pricing rules');
        }

        // Merge space overrides onto global rules
        const mergedRules = (globalRules || []).map(globalRule => {
            const override = (spaceRules || []).find(r => r.vehicle_type === globalRule.vehicle_type);
            return override || globalRule;
        });

        // Include any space rules that might not have a global equivalent, though unlikely
        const extraRules = (spaceRules || []).filter(r => 
            !mergedRules.find(m => m.vehicle_type === r.vehicle_type)
        );

        return [...mergedRules, ...extraRules];
    }

    /**
     * Update a pricing rule, scoped to a space.
     * If updating a space-specific rule and it doesn't exist, we insert it based on global defaults.
     */
    async updatePricingRule(vehicleType, updates, spaceId = null) {
        let query = supabase
            .from('pricing_rules')
            .select('*')
            .eq('vehicle_type', vehicleType);

        if (spaceId) {
            query = query.eq('space_id', spaceId);
        } else {
            query = query.is('space_id', null);
        }

        const { data: existing } = await query.maybeSingle();

        if (existing) {
            // Update existing rule
            const { data, error } = await supabase
                .from('pricing_rules')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) {
                throw new Error('Failed to update pricing rule');
            }
            return data;
        } else {
            // Insert space-specific rule using global defaults as fallback
            if (!spaceId) {
                throw new Error('Failed to update global pricing rule: Rule does not exist');
            }

            const { data: globalRule } = await supabase
                .from('pricing_rules')
                .select('*')
                .eq('vehicle_type', vehicleType)
                .is('space_id', null)
                .maybeSingle();

            if (!globalRule) {
                throw new Error(`Cannot update: no existing global rule for vehicle type ${vehicleType}`);
            }

            const { data, error } = await supabase
                .from('pricing_rules')
                .insert({
                    vehicle_type: vehicleType,
                    space_id: spaceId,
                    base_fee: updates.base_fee !== undefined ? updates.base_fee : globalRule.base_fee,
                    base_hours: updates.base_hours !== undefined ? updates.base_hours : globalRule.base_hours,
                    extra_hour_rate: updates.extra_hour_rate !== undefined ? updates.extra_hour_rate : globalRule.extra_hour_rate
                })
                .select()
                .single();

            if (error) {
                throw new Error('Failed to create space-specific pricing rule');
            }
            return data;
        }
    }
}

module.exports = new PricingService();
