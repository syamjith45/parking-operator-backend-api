const { supabase } = require('../config/database');

const verifyToken = async (token) => {
    return await supabase.auth.getUser(token);
};

const authenticateUser = async (authHeader) => {
    if (!authHeader) {
        return { user: null, staff: null, organization: null, space: null, token: null };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await verifyToken(token);

    if (error || !user) {
        throw new Error('Invalid or expired token');
    }

    // Single query — joins organization and space in one round trip
    const { data: staff, error: staffError } = await supabase
        .from('staff')
        .select(`
            *,
            organization:organizations(*),
            space:spaces(*)
        `)
        .eq('user_id', user.id)
        .single();

    if (staffError || !staff) {
        throw new Error('User is not a registered staff member');
    }

    // Destructure joined relations out of the staff object
    const { organization, space, ...staffData } = staff;

    return {
        user,
        staff:        staffData,
        organization: organization || null,  // null for platform admin
        space:        space || null,         // null for managers + admins
        token
    };
};

const requireAuth = (context) => {
    if (!context.staff) {
        throw new Error('Authentication required');
    }
};

const requireRole = (context, roles) => {
    requireAuth(context);
    if (!roles.includes(context.staff.role)) {
        throw new Error('Not authorized for this action');
    }
};

// NEW: blocks cross-org access. Admin role bypasses.
const requireSameOrg = (context, orgId) => {
    requireAuth(context);
    if (context.staff.role === 'admin') return;
    if (context.organization?.id !== orgId) {
        throw new Error('Access denied: resource belongs to a different organization');
    }
};

module.exports = {
    authenticateUser,
    requireAuth,
    requireRole,
    requireSameOrg
};
