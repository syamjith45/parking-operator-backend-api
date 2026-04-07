const { supabase } = require('../config/database');

class OrganizationService {

    async getOrganization(orgId) {
        const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', orgId)
            .single();

        if (error || !data) throw new Error('Organization not found');
        return data;
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

    async _getStaffIds(orgId) {
        const { data } = await supabase
            .from('staff')
            .select('id')
            .eq('organization_id', orgId);
        return (data || []).map(s => s.id);
    }
}

module.exports = new OrganizationService();
