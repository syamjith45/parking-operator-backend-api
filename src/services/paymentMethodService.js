const { supabase } = require('../config/database');
const cache = require('./cacheService');

class PaymentMethodService {

    /**
     * Get all active payment methods
     * Cached for performance
     */
    async getAllPaymentMethods() {
        const cacheKey = 'payment:methods:all';

        // Try cache first
        const cached = await cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const { data, error } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('is_active', true)
            .order('code', { ascending: true });

        if (error) {
            throw new Error('Failed to fetch payment methods');
        }

        const result = data || [];

        // Cache the result
        await cache.set(cacheKey, result, cache.TTL.REFERENCE_DATA);

        return result;
    }

    /**
     * Get specific payment method by code
     */
    async getPaymentMethod(code) {
        if (!code) {
            throw new Error('Payment method code is required');
        }

        const { data, error } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('code', code)
            .eq('is_active', true)
            .single();

        if (error || !data) {
            throw new Error(`Payment method '${code}' not found`);
        }

        return data;
    }

    /**
     * Validate if a payment method code exists
     * Returns boolean instead of throwing
     */
    async validatePaymentMethod(code) {
        try {
            await this.getPaymentMethod(code);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Invalidate payment methods cache
     * Call this when payment methods are added/updated/deleted
     */
    async invalidateCache() {
        await cache.delete('payment:methods:all');
    }
}

module.exports = new PaymentMethodService();
