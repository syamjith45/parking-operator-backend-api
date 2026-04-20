const { supabase, supabaseAdmin } = require('../config/database');

class OrganizationService {

    normalizeVehicleType(vehicleType) {
        return (vehicleType || '').toString().trim().toLowerCase();
    }

    getVehicleTypeCandidates(vehicleType) {
        const normalizedType = this.normalizeVehicleType(vehicleType);
        if (!normalizedType) return [];

        // Return only the normalized type (no mapping between bike→two_wheeler, car→four_wheeler)
        // The database now enforces correct vehicle_type codes via FK constraints
        return [normalizedType];
    }

    async getOrganization(orgId) {
        const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', orgId)
            .single();

        if (error || !data) throw new Error('Organization not found');
        return data;
    }

    async getOrganizationWithPricingType(orgId) {
        const organization = await this.getOrganization(orgId);

        if (!organization?.pricing_type_id) {
            return {
                ...organization,
                pricing_type: null
            };
        }

        const { data: pricingType, error: pricingTypeError } = await supabaseAdmin
            .from('pricing_types')
            .select('id, code, label, is_active, created_at')
            .eq('id', organization.pricing_type_id)
            .maybeSingle();

        if (pricingTypeError) {
            throw new Error('Failed to fetch organization pricing type details');
        }

        return {
            ...organization,
            pricing_type: pricingType || null
        };
    }

    async listOrganizations() {
        const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (error) throw new Error('Failed to fetch organizations');
        return data || [];
    }

    async createOrganization({ name, slug, phone, email, address, ownerId }) {
        // Check slug uniqueness before insert for a clearer error message
        const { data: existing } = await supabase
            .from('organizations')
            .select('id')
            .eq('slug', slug)
            .single();

        if (existing) throw new Error(`Slug "${slug}" is already taken`);

        const { data, error } = await supabase
            .from('organizations')
            .insert({
                name,
                slug,
                phone:    phone    || null,
                email:    email    || null,
                address:  address  || null,
                owner_id: ownerId  || null,
                is_active: true
            })
            .select()
            .single();

        if (error) throw new Error('Failed to create organization');
        return data;
    }

    async updateOrganization(orgId, updates) {
        const allowed   = ['name', 'phone', 'email', 'address', 'is_active'];
        const dbUpdates = { updated_at: new Date().toISOString() };

        allowed.forEach(key => {
            if (updates[key] !== undefined) dbUpdates[key] = updates[key];
        });

        if (Object.keys(dbUpdates).length === 1) {
            throw new Error('No valid fields to update');
        }

        const { data, error } = await supabase
            .from('organizations')
            .update(dbUpdates)
            .eq('id', orgId)
            .select()
            .single();

        if (error) throw new Error('Failed to update organization');
        return data;
    }

    async deactivateOrganization(orgId) {
        const { data, error } = await supabase
            .from('organizations')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', orgId)
            .select()
            .single();

        if (error) throw new Error('Failed to deactivate organization');
        return data;
    }

    async getOrgStaff(orgId) {
        const { data, error } = await supabase
            .from('staff')
            .select('id, name, role, phone, email, is_active, space_id, created_at')
            .eq('organization_id', orgId)
            .order('name');

        if (error) throw new Error('Failed to fetch staff for organization');
        return data || [];
    }

    async getOrgStats(orgId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const staffIds = await this._getStaffIds(orgId);

        if (staffIds.length === 0) {
            return {
                organization_id: orgId,
                active_vehicles: 0,
                completed_today: 0,
                revenue_today:   "0.00"
            };
        }

        const { count: activeCount } = await supabase
            .from('vehicles')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'ACTIVE')
            .in('created_by', staffIds);

        const { data: completed } = await supabase
            .from('vehicles')
            .select('base_fee_paid, overstay_charges(fee_amount, is_collected)')
            .eq('status', 'EXITED')
            .gte('exit_time', today.toISOString())
            .in('created_by', staffIds);

        const baseFees     = (completed || []).reduce((s, v) => s + parseFloat(v.base_fee_paid || 0), 0);
        const overstayFees = (completed || []).reduce((s, v) =>
            s + (v.overstay_charges || [])
                .filter(c => c.is_collected)
                .reduce((ss, c) => ss + parseFloat(c.fee_amount || 0), 0), 0);

        return {
            organization_id: orgId,
            active_vehicles: activeCount || 0,
            completed_today: (completed || []).length,
            revenue_today:   (baseFees + overstayFees).toFixed(2)
        };
    }

    async getAdminGlobalStats({ organizationId = null, startDate = null, endDate = null, vehicleType = null } = {}) {
        const vehicleTypeCandidates = this.getVehicleTypeCandidates(vehicleType);

        let activeQuery = supabase
            .from('vehicles')
            .select('id, vehicle_type, entry_time, created_by_staff:staff!created_by!inner(organization_id)')
            .eq('status', 'ACTIVE');

        if (organizationId) {
            activeQuery = activeQuery.eq('created_by_staff.organization_id', organizationId);
        }

        if (vehicleTypeCandidates.length > 0) {
            activeQuery = activeQuery.in('vehicle_type', vehicleTypeCandidates);
        }

        if (startDate) {
            activeQuery = activeQuery.gte('entry_time', new Date(startDate).toISOString());
        }

        if (endDate) {
            activeQuery = activeQuery.lte('entry_time', new Date(endDate).toISOString());
        }

        const { data: activeVehicles, error: activeError } = await activeQuery;
        if (activeError) {
            throw new Error('Failed to fetch active sessions for admin analytics');
        }

        let completedQuery = supabase
            .from('vehicles')
            .select(`
                base_fee_paid,
                vehicle_type,
                overstay_charges(fee_amount, is_collected),
                created_by_staff:staff!created_by!inner(
                    organization_id,
                    organization:organizations(name)
                )
            `)
            .eq('status', 'EXITED');

        if (organizationId) {
            completedQuery = completedQuery.eq('created_by_staff.organization_id', organizationId);
        }

        if (vehicleTypeCandidates.length > 0) {
            completedQuery = completedQuery.in('vehicle_type', vehicleTypeCandidates);
        }

        if (startDate) {
            completedQuery = completedQuery.gte('exit_time', new Date(startDate).toISOString());
        }

        if (endDate) {
            completedQuery = completedQuery.lte('exit_time', new Date(endDate).toISOString());
        }

        const { data: completedVehicles, error: completedError } = await completedQuery;
        if (completedError) {
            throw new Error('Failed to fetch completed sessions for admin analytics');
        }

        let capacityQuery = supabase
            .from('spaces')
            .select('capacity')
            .eq('is_active', true);

        if (organizationId) {
            capacityQuery = capacityQuery.eq('organization_id', organizationId);
        }

        const { data: spaces, error: capacityError } = await capacityQuery;
        if (capacityError) {
            throw new Error('Failed to fetch space capacity for admin analytics');
        }

        const activeSessions = (activeVehicles || []).length;
        const completedSessions = (completedVehicles || []).length;

        const revenueByOrgMap = (completedVehicles || []).reduce((acc, vehicle) => {
            const staff = vehicle.created_by_staff || {};
            const orgId = staff.organization_id || 'unknown';

            const organizationObject = Array.isArray(staff.organization)
                ? staff.organization[0]
                : staff.organization;

            const orgName = organizationObject?.name || 'Unknown';

            const baseFee = parseFloat(vehicle.base_fee_paid || 0);
            const collectedOverstay = (vehicle.overstay_charges || [])
                .filter(charge => charge.is_collected)
                .reduce((sum, charge) => sum + parseFloat(charge.fee_amount || 0), 0);

            const totalForVehicle = baseFee + collectedOverstay;

            if (!acc[orgId]) {
                acc[orgId] = { organizationName: orgName, revenue: 0 };
            }

            acc[orgId].revenue += totalForVehicle;
            return acc;
        }, {});

        const totalRevenue = Object.values(revenueByOrgMap)
            .reduce((sum, item) => sum + item.revenue, 0);

        const totalCapacity = (spaces || [])
            .reduce((sum, space) => sum + parseInt(space.capacity || 0, 10), 0);

        const utilizationRate = totalCapacity > 0
            ? (activeSessions / totalCapacity) * 100
            : 0;

        return {
            totalRevenue: Number(totalRevenue.toFixed(2)),
            activeSessions,
            completedSessions,
            utilizationRate: Number(utilizationRate.toFixed(2)),
            revenueByOrg: Object.values(revenueByOrgMap)
                .map(item => ({
                    organizationName: item.organizationName,
                    revenue: Number(item.revenue.toFixed(2))
                }))
                .sort((a, b) => b.revenue - a.revenue)
        };
    }

    async _getStaffIds(orgId) {
        const { data } = await supabase
            .from('staff')
            .select('id')
            .eq('organization_id', orgId);
        return (data || []).map(s => s.id);
    }
}

module.exports = new OrganizationService();
