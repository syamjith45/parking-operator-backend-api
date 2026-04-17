const queries = require('./queries');
const mutations = require('./mutations');
const spaceService = require('../../services/spaceService');

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
        pricing_type: (org) => org.pricing_type || org.overstay_pricing_type || null
    }
};

module.exports = resolvers;
