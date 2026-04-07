const { supabase } = require('../config/database');

class SpaceService {

    async getSpacesByOrg(organizationId) {
        const { data, error } = await supabase
            .from('spaces')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .order('name');

        if (error) throw new Error('Failed to fetch spaces');
        return data || [];
    }

    async getSpace(spaceId) {
        const { data, error } = await supabase
            .from('spaces')
            .select('*, organization:organizations(id, name, slug)')
            .eq('id', spaceId)
            .single();

        if (error || !data) throw new Error('Space not found');
        return data;
    }

    async createSpace({ organizationId, name, location, capacity }) {
        const { data, error } = await supabase
            .from('spaces')
            .insert({
                organization_id: organizationId,
                name,
                location: location || null,
                capacity: capacity || null,
                is_active: true
            })
            .select()
            .single();

        if (error) throw new Error('Failed to create space');
        return data;
    }

    async updateSpace(spaceId, updates) {
        const allowed   = ['name', 'location', 'capacity', 'is_active'];
        const dbUpdates = { updated_at: new Date().toISOString() };

        allowed.forEach(key => {
            if (updates[key] !== undefined) dbUpdates[key] = updates[key];
        });

        const { data, error } = await supabase
            .from('spaces')
            .update(dbUpdates)
            .eq('id', spaceId)
            .select()
            .single();

        if (error) throw new Error('Failed to update space');
        return data;
    }

    async getSpaceOperators(spaceId) {
        const { data, error } = await supabase
            .from('staff')
            .select('id, name, role, phone, email, is_active')
            .eq('space_id', spaceId)
            .eq('role', 'operator')
            .order('name');

        if (error) throw new Error('Failed to fetch operators for space');
        return data || [];
    }

    /**
     * Pre-flight check — call this before showing the reassign UI.
     * Returns a full picture of what blocks the move.
     */
    async getReassignmentBlockers(staffId) {
        const { data: activeSessions } = await supabase
            .from('vehicles')
            .select('session_id, vehicle_type, entry_time, driver_phone')
            .eq('created_by', staffId)
            .eq('status', 'ACTIVE');

        const { data: exitedVehicles } = await supabase
            .from('vehicles')
            .select('id')
            .eq('created_by', staffId)
            .eq('status', 'EXITED');

        const exitedIds = (exitedVehicles || []).map(v => v.id);

        const { data: pendingCharges } = exitedIds.length > 0
            ? await supabase
                .from('overstay_charges')
                .select('id, fee_amount, vehicle_id')
                .eq('is_collected', false)
                .in('vehicle_id', exitedIds)
            : { data: [] };

        const totalPending = (pendingCharges || [])
            .reduce((s, c) => s + parseFloat(c.fee_amount), 0);

        return {
            can_reassign_safely:  !activeSessions?.length && !pendingCharges?.length,
            active_sessions:      activeSessions  || [],
            pending_charges:      pendingCharges  || [],
            pending_charges_total: totalPending.toFixed(2)
        };
    }

    /**
     * Safely reassign an operator to a different space.
     * Checks blockers first. Use force=true to override.
     */
    async reassignOperator(staffId, newSpaceId, options = {}) {
        const { force = false } = options;

        const { data: staff, error: staffError } = await supabase
            .from('staff')
            .select('id, name, role, organization_id, space_id')
            .eq('id', staffId)
            .single();

        if (staffError || !staff) throw new Error('Staff member not found');
        if (staff.role !== 'operator') throw new Error('Only operators can be assigned to spaces');
        if (staff.space_id === newSpaceId) throw new Error('Operator is already assigned to this space');

        const { data: newSpace, error: spaceError } = await supabase
            .from('spaces')
            .select('id, organization_id, name')
            .eq('id', newSpaceId)
            .single();

        if (spaceError || !newSpace) throw new Error('Space not found');

        if (newSpace.organization_id !== staff.organization_id) {
            throw new Error('Cannot reassign operator across organizations');
        }

        const blockers = await this.getReassignmentBlockers(staffId);

        if (!blockers.can_reassign_safely && !force) {
            throw new Error(
                `Cannot reassign: ${blockers.active_sessions.length} active session(s), ` +
                `${blockers.pending_charges.length} pending charge(s). Use force=true to override.`
            );
        }

        const previousSpaceId = staff.space_id;

        const { data: updated, error: updateError } = await supabase
            .from('staff')
            .update({ space_id: newSpaceId, updated_at: new Date().toISOString() })
            .eq('id', staffId)
            .select()
            .single();

        if (updateError) throw new Error('Failed to reassign operator');

        // Write audit log
        await supabase
            .from('staff_reassignment_log')
            .insert({
                staff_id:                staffId,
                from_space_id:           previousSpaceId,
                to_space_id:             newSpaceId,
                active_sessions_at_move: blockers.active_sessions.length,
                pending_charges_at_move: blockers.pending_charges.length,
                forced:                  force
            });

        return {
            staff:             updated,
            previous_space_id: previousSpaceId,
            new_space_id:      newSpaceId,
            warnings: [
                ...(force && blockers.active_sessions.length
                    ? [`Moved with ${blockers.active_sessions.length} active session(s)`] : []),
                ...(force && blockers.pending_charges.length
                    ? [`Moved with ${blockers.pending_charges.length} pending charge(s)`] : [])
            ]
        };
    }
}

module.exports = new SpaceService();
