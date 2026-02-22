const { supabase } = require('../config/database');

class RevenueService {
    /**
     * Get revenue summary for date range
     */
    async getRevenueSummary(startDate, endDate) {
        const start = startDate ? new Date(startDate) : new Date();
        const end = endDate ? new Date(endDate) : new Date();

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
            .from('vehicles')
            .select(`
        *,
        overstay_charges(fee_amount, is_collected)
      `)
            .eq('status', 'EXITED')
            .gte('exit_time', start.toISOString())
            .lte('exit_time', end.toISOString());

        if (error) {
            throw new Error('Failed to fetch revenue data');
        }

        // Calculate totals
        const totalSessions = data.length;
        const baseFees = data.reduce((sum, v) => sum + parseFloat(v.base_fee_paid || 0), 0);

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

        // Group by vehicle type
        const byVehicleType = data.reduce((acc, v) => {
            if (!acc[v.vehicle_type]) {
                acc[v.vehicle_type] = { count: 0, revenue: 0 };
            }
            acc[v.vehicle_type].count++;
            acc[v.vehicle_type].revenue += parseFloat(v.base_fee_paid || 0);

            const charges = v.overstay_charges || [];
            charges.forEach(charge => {
                if (charge.is_collected) {
                    acc[v.vehicle_type].revenue += parseFloat(charge.fee_amount || 0);
                }
            });

            return acc;
        }, {});

        return {
            period: {
                start: start.toISOString(),
                end: end.toISOString()
            },
            total_sessions: totalSessions,
            base_fees: baseFees.toFixed(2),
            overstay_fees_collected: overstayData.collected.toFixed(2),
            overstay_fees_pending: overstayData.pending.toFixed(2),
            total_revenue: (baseFees + overstayData.collected).toFixed(2),
            by_vehicle_type: Object.entries(byVehicleType).map(([type, data]) => ({
                vehicle_type: type,
                sessions: data.count,
                revenue: data.revenue.toFixed(2)
            }))
        };
    }

    /**
     * Get pending overstay charges
     */
    async getPendingOverstayCharges() {
        const { data, error } = await supabase
            .from('overstay_charges')
            .select(`
        *,
        vehicle:vehicles(session_id, driver_phone, vehicle_type, exit_time)
      `)
            .eq('is_collected', false)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error('Failed to fetch pending charges');
        }

        return data || [];
    }
}

module.exports = new RevenueService();
