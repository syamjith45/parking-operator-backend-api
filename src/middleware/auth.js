const { supabase } = require('../config/database');

// Auth Pattern: Supabase JWT tokens validated via authenticateUser()
// Used by: GraphQL context middleware + REST endpoints
// Future: Consider migrating REST endpoints to GraphQL for consistency

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
        .maybeSingle();

    // Destructure joined relations out of the staff object
    const { organization, space, ...staffData } = (staff || {});

    // Supabase relation payloads can be object or single-item array depending on embedding shape.
    const normalizedOrganization = Array.isArray(organization)
        ? (organization[0] || null)
        : (organization || null);

    const normalizedSpace = Array.isArray(space)
        ? (space[0] || null)
        : (space || null);

    return {
        user,
        staff:        staffData,
        organization: normalizedOrganization, // null for platform admin
        space:        normalizedSpace,        // populated for operators and managers, null for admins
        token
    };
};

const requireAuth = (context) => {
    if (!context.user) {
        throw new Error('Authentication required');
    }
};

const requireRole = (context, roles) => {
    if (!context.user) {
        throw new Error('Authentication required');
    }
    const role = context.staff?.role || 'admin';  // Admins without staff record get 'admin' role
    if (!roles.includes(role)) {
        throw new Error('Not authorized for this action');
    }
};

// NEW: blocks cross-org access. Admin role bypasses.
const requireSameOrg = (context, orgId) => {
    if (!context.user) {
        throw new Error('Authentication required');
    }
    const role = context.staff?.role || 'admin';
    if (role === 'admin') return;
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
