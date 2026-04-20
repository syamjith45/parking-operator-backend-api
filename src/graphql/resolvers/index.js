const queries = require('./queries');
const mutations = require('./mutations');
const spaceService = require('../../services/spaceService');
const pricingService = require('../../services/pricingService');
const orgService = require('../../services/organizationService');

const resolvers = {
    Query: queries,
    Mutation: mutations,
    Staff: {
        space: async (staff) => {
            if (!staff?.space_id) return null;
            try {
                return await spaceService.getSpace(staff.space_id);
            } catch (_) {
                return null;
            }
        }
    },
    Organization: {
        pricing_type: async (org) => {
            try {
                // If the parent already includes a populated pricing_type relation, use it directly.
                if (org?.pricing_type?.id) {
                    return org.pricing_type;
                }

                if (org?.pricing_type_id) {
                    return await pricingService.getPricingTypeById(org.pricing_type_id);
                }

                // Fallback for parent payloads that include org id but omit pricing_type_id.
                if (org?.id) {
                    const freshOrg = await orgService.getOrganization(org.id);
                    if (freshOrg?.pricing_type_id) {
                        return await pricingService.getPricingTypeById(freshOrg.pricing_type_id);
                    }
                }

                return null;
            } catch (_) {
                return null;
            }
        },
        staff: async (org) => {
            try {
                // If the parent already includes populated staff relation, use it directly
                if (org?.staff && Array.isArray(org.staff)) {
                    return org.staff;
                }

                // Otherwise fetch staff for this organization
                if (org?.id) {
                    const { supabase } = require('../../config/database');
                    const { data, error } = await supabase
                        .from('staff')
                        .select('*')
                        .eq('organization_id', org.id)
                        .eq('is_active', true)
                        .order('name');

                    if (error) throw new Error('Failed to fetch staff');
                    return data || [];
                }

                return [];
            } catch (_) {
                return [];
            }
        }
    }
};

module.exports = resolvers;
