const { supabase } = require('../config/database');

/**
 * CHANGE: scoping helper for revenue queries.
 * Operators see their space only. Managers see their whole org. Admins see all.
 */
function applyScope(query, context) {
    const { staff, organization, space } = context || {};
    if (!staff || staff.role === 'admin') return query;
    if (staff.role === 'manager') {
        return query.eq('created_by_staff.organization_id', organization.id);
    }
    return query.eq('space_id', space.id);
}

class RevenueService {

    /**
     * CHANGE: now accepts context as third argument for scoping.
     */
    async getRevenueSummary(startDate, endDate, context = {}) {
        const start = startDate ? new Date(startDate) : new Date();
        const end   = endDate   ? new Date(endDate)   : new Date();

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        let query = supabase
            .from('vehicles')
            .select(`
                *,
                created_by_staff:staff!created_by!inner(id, organization_id),
                overstay_charges(fee_amount, is_collected)
            `)
            .eq('status', 'EXITED')
            .gte('exit_time', start.toISOString())
            .lte('exit_time', end.toISOString());

        // CHANGE: apply scope
        query = applyScope(query, context);

        const { data, error } = await query;

        if (error) {
            throw new Error('Failed to fetch revenue data');
        }

        const totalSessions = data.length;
        const baseFees      = data.reduce((sum, v) => sum + parseFloat(v.base_fee_paid || 0), 0);

        const overstayData = data.reduce((acc, v) => {
            const charges = v.overstay_charges || [];
            charges.forEach(charge => {
                if (charge.is_collected) {
                    acc.collected += parseFloat(charge.fee_amount || 0);
                } else {
                    acc.pending += parseFloat(charge.fee_amount || 0);
                }
            });
            return acc;
        }, { collected: 0, pending: 0 });

        const byVehicleType = data.reduce((acc, v) => {
            if (!acc[v.vehicle_type]) {
                acc[v.vehicle_type] = { count: 0, revenue: 0 };
            }
            acc[v.vehicle_type].count++;
            acc[v.vehicle_type].revenue += parseFloat(v.base_fee_paid || 0);
            (v.overstay_charges || []).forEach(charge => {
                if (charge.is_collected) {
                    acc[v.vehicle_type].revenue += parseFloat(charge.fee_amount || 0);
                }
            });
            return acc;
        }, {});

        return {
            period: {
                start: start.toISOString(),
                end:   end.toISOString()
            },
            total_sessions:          totalSessions,
            base_fees:               baseFees.toFixed(2),
            overstay_fees_collected: overstayData.collected.toFixed(2),
            overstay_fees_pending:   overstayData.pending.toFixed(2),
            total_revenue:           (baseFees + overstayData.collected).toFixed(2),
            by_vehicle_type:         Object.entries(byVehicleType).map(([type, d]) => ({
                vehicle_type: type,
                sessions:     d.count,
                revenue:      d.revenue.toFixed(2)
            }))
        };
    }

    /**
     * CHANGE: now accepts context for scoping pending charges.
     */
    async getPendingOverstayCharges(context = {}) {
        const { staff, space, organization } = context || {};

        let query = supabase
            .from('overstay_charges')
            .select(`
                *,
                vehicle:vehicles(
                    session_id, driver_phone, vehicle_type,
                    exit_time, space_id,
                    created_by_staff:staff!created_by!inner(id, organization_id)
                )
            `)
            .eq('is_collected', false)
            .order('created_at', { ascending: false });

        // CHANGE: filter via joined vehicle
        if (staff && staff.role === 'operator' && space) {
            query = query.eq('vehicle.space_id', space.id);
        } else if (staff && staff.role === 'manager' && organization) {
            query = query.eq('vehicle.created_by_staff.organization_id', organization.id);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error('Failed to fetch pending charges');
        }

        return data || [];
    }
}

module.exports = new RevenueService();
