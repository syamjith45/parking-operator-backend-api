const { supabase } = require('../config/database');

/**
 * Validates the JWT token and returns the user object
 * @param {string} token - The strict JWT token
 * @returns {Promise<{user: object, error: object}>}
 */
const verifyToken = async (token) => {
    return await supabase.auth.getUser(token);
};

/**
 * Middleware to authenticate requests
 * @param {string} authHeader - The Authorization header
 * @returns {Promise<{user: object, staff: object, token: string}|null>}
 */
const authenticateUser = async (authHeader) => {
    if (!authHeader) {
        return { user: null, staff: null, token: null };
    }

    const token = authHeader.replace('Bearer ', '');
    // eslint-disable-next-line no-unused-vars
    const { data: { user }, error } = await verifyToken(token);

    if (error || !user) {
        throw new Error('Invalid or expired token');
    }

    // Fetch staff record associated with this user
    // We assume there is a 'user_id' column in 'staff' table linking to auth.users
    const { data: staff, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (staffError || !staff) {
        throw new Error('User is not a registered staff member');
    }

    return { user, staff, token };
};

/**
 * Helper to require authentication in resolvers
 */
const requireAuth = (context) => {
    if (!context.staff) {
        throw new Error('Authentication required');
    }
};

/**
 * Helper to require specific roles
 * @param {object} context - The GraphQL context
 * @param {string[]} roles - Array of allowed roles
 */
const requireRole = (context, roles) => {
    requireAuth(context);
    if (!roles.includes(context.staff.role)) {
        throw new Error('Not authorized for this action');
    }
};

module.exports = {
    authenticateUser,
    requireAuth,
    requireRole
};
