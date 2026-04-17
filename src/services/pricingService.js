const { supabase } = require('../config/database');
const cache = require('./cacheService');

class PricingService {

    normalizeVehicleType(vehicleType) {
        return (vehicleType || '').toString().trim().toLowerCase();
    }

    getVehicleTypeCandidates(vehicleType) {
        const normalizedType = this.normalizeVehicleType(vehicleType);

        if (normalizedType === 'four_wheeler' || normalizedType === 'car') {
            return ['four_wheeler', 'car'];
        }

        if (normalizedType === 'two_wheeler' || normalizedType === 'bike') {
            return ['two_wheeler', 'bike'];
        }

        return [normalizedType];
    }

    async findPricingRuleForTypes(vehicleTypes, spaceId = null) {
        let query = supabase
            .from('pricing_rules')
            .select('*')
            .in('vehicle_type', vehicleTypes)
            .eq('is_active', true);

        if (spaceId) {
            query = query.eq('space_id', spaceId);
        } else {
            query = query.is('space_id', null);
        }

        const { data, error } = await query;

        if (error || !data || data.length === 0) {
            return null;
        }

        for (const type of vehicleTypes) {
            const match = data.find(rule => rule.vehicle_type === type);
            if (match) {
                return match;
            }
        }

        return data[0] || null;
    }

    /**
     * Get pricing rule for a vehicle type scoped to a space.
     * Falls back to global (null space) rules if space-specific rule does not exist.
     */
    async getPricingRule(vehicleType, spaceId = null) {
        const normalizedType = this.normalizeVehicleType(vehicleType);
        const vehicleTypeCandidates = this.getVehicleTypeCandidates(normalizedType);

        const cacheKey = spaceId
            ? `pricing:${normalizedType}:space:${spaceId}`
            : `pricing:${normalizedType}:global`;

        // Try cache first
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let data = await this.findPricingRuleForTypes(vehicleTypeCandidates, spaceId);

        // Fallback to global rule if space-specific rule is not found
        if (!data && spaceId) {
            data = await this.findPricingRuleForTypes(vehicleTypeCandidates, null);
        }

        if (!data) {
            throw new Error(`Pricing rule not found for vehicle type: ${vehicleType}`);
        }

        // Cache the result
        await cache.set(cacheKey, data, cache.TTL.PRICING);

        return data;
    }

    /**
     * Get all active pricing rules, scoped to a space, merged with global rules.
     */
    async getAllPricingRules(spaceId = null) {
        const cacheKey = spaceId
            ? `pricing:all:space:${spaceId}`
            : `pricing:global`;

        // Try cache first
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

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
            // Cache global rules
            await cache.set(cacheKey, globalRules || [], cache.TTL.PRICING);
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

        const result = [...mergedRules, ...extraRules];

        // Cache the result
        await cache.set(cacheKey, result, cache.TTL.PRICING);

        return result;
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

            // Invalidate cache
            await cache.invalidatePattern(`pricing:${vehicleType.toLowerCase()}:*`);
            if (spaceId) {
                await cache.invalidatePattern(`pricing:*:space:${spaceId}`);
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

            // Invalidate cache
            await cache.invalidatePattern(`pricing:*:space:${spaceId}`);

            return data;
        }
    }

    /**
     * Get an overstay slab by ID (for access control verification).
     */
    async getSlabById(id) {
        const { data, error } = await supabase
            .from('overstay_slabs')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new Error('Overstay slab not found');
        }

        return data;
    }

    /**
     * Get all active overstay slabs for an organization.
     * Optionally filtered by vehicle_type.
     */
    async getOverstaySlabs(organizationId, vehicleType = null) {
        const cacheKey = vehicleType
            ? `overstay_slabs:${organizationId}:${vehicleType}`
            : `overstay_slabs:${organizationId}`;

        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let query = supabase
            .from('overstay_slabs')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_active', true);

        if (vehicleType) {
            query = query.eq('vehicle_type', vehicleType);
        }

        const { data, error } = await query.order('slab_hours', { ascending: true });

        if (error) {
            throw new Error('Failed to fetch overstay slabs');
        }

        await cache.set(cacheKey, data || [], cache.TTL.PRICING);
        return data || [];
    }

    /**
     * Get organization's overstay pricing type (hourly or slab).
     */
    async getOrganizationPricingType(organizationId) {
        const { data, error } = await supabase
            .from('organizations')
            .select('overstay_pricing_type')
            .eq('id', organizationId)
            .maybeSingle();

        if (error) {
            throw new Error('Failed to fetch organization pricing type');
        }

        return data?.overstay_pricing_type || 'hourly';
    }

    /**
     * Create an overstay slab with vehicle_type.
     */
    async createOverstaySlab(organizationId, input) {
        const { data, error } = await supabase
            .from('overstay_slabs')
            .insert({
                organization_id: organizationId,
                vehicle_type: input.vehicle_type || 'four_wheeler',
                slab_hours: input.slab_hours,
                slab_fee: input.slab_fee,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            throw new Error('Failed to create overstay slab');
        }

        // Invalidate cache for this vehicle_type
        if (input.vehicle_type) {
            await cache.invalidatePattern(`overstay_slabs:${organizationId}:${input.vehicle_type}`);
        }
        await cache.invalidatePattern(`overstay_slabs:${organizationId}*`);

        return data;
    }

    /**
     * Update an overstay slab.
     */
    async updateOverstaySlab(id, input) {
        const { data: existing, error: fetchError } = await supabase
            .from('overstay_slabs')
            .select('organization_id, vehicle_type')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            throw new Error('Overstay slab not found');
        }

        const { data, error } = await supabase
            .from('overstay_slabs')
            .update({
                vehicle_type: input.vehicle_type || existing.vehicle_type,
                slab_hours: input.slab_hours,
                slab_fee: input.slab_fee
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new Error('Failed to update overstay slab');
        }

        // Invalidate cache
        if (existing.vehicle_type) {
            await cache.invalidatePattern(`overstay_slabs:${existing.organization_id}:${existing.vehicle_type}`);
        }
        await cache.invalidatePattern(`overstay_slabs:${existing.organization_id}*`);

        return data;
    }

    /**
     * Delete (deactivate) an overstay slab.
     */
    async deleteOverstaySlab(id) {
        const { data: existing, error: fetchError } = await supabase
            .from('overstay_slabs')
            .select('organization_id')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            throw new Error('Overstay slab not found');
        }

        const { data, error } = await supabase
            .from('overstay_slabs')
            .update({ is_active: false })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new Error('Failed to delete overstay slab');
        }

        // Invalidate cache
        await cache.invalidatePattern(`overstay_slabs:${existing.organization_id}*`);

        return data;
    }

    /**
     * Set organization's pricing type.
     */
    async setOrganizationPricingType(id, pricingType) {
        const { data, error } = await supabase
            .from('organizations')
            .update({ overstay_pricing_type: pricingType })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new Error('Failed to update organization pricing type');
        }

        return data;
    }
}

module.exports = new PricingService();
