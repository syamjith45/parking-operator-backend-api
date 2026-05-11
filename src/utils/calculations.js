/**
 * Calculate overstay fee based on overstay minutes
 * @param {number} overstayMinutes - Total overstay duration in minutes
 * @param {number} extraHourRate - Rate per extra hour
 * @returns {object} - { overstayMinutes, overstayFee }
 */
const calculateOverstayFee = (overstayMinutes, extraHourRate) => {
    if (overstayMinutes <= 0) {
        return { overstayMinutes: 0, overstayFee: 0 };
    }

    // Calculate extra hours (round up)
    const extraHours = Math.ceil(overstayMinutes / 60);
    const overstayFee = extraHours * extraHourRate;

    return {
        overstayMinutes: Math.round(overstayMinutes),
        overstayFee: parseFloat(overstayFee.toFixed(2))
    };
};

/**
 * Calculate slab-based overstay fee
 * @param {number} overstayMinutes - Total overstay duration in minutes
 * @param {Array} slabs - Array of { slab_hours, slab_fee } sorted by slab_hours ascending
 * @returns {object} - { overstayMinutes, overstayFee, appliedSlab }
 */
const calculateSlabBasedOverstayFee = (overstayMinutes, slabs) => {
    if (overstayMinutes <= 0) {
        return { overstayMinutes: 0, overstayFee: 0, appliedSlab: null };
    }

    const overstayHours = overstayMinutes / 60;

    // Sort slabs by slab_hours descending to find the highest applicable slab
    const sortedSlabs = [...slabs].sort((a, b) => b.slab_hours - a.slab_hours);

    // Find the first slab where overstayHours > slab_hours
    let appliedSlab = null;
    for (const slab of sortedSlabs) {
        if (overstayHours > slab.slab_hours) {
            appliedSlab = slab;
            break;
        }
    }

    // If no slab found where overstayHours > slab_hours, use the last (largest) slab
    if (!appliedSlab && sortedSlabs.length > 0) {
        appliedSlab = sortedSlabs[sortedSlabs.length - 1];
    }

    const overstayFee = appliedSlab ? parseFloat(appliedSlab.slab_fee.toFixed(2)) : 0;

    return {
        overstayMinutes: Math.round(overstayMinutes),
        overstayFee,
        appliedSlab
    };
};

/**
 * Calculate duration in minutes between two timestamps
 */
const calculateDurationMinutes = (entryTime, exitTime) => {
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const diffMs = exit - entry;
    return Math.round(diffMs / (1000 * 60));
};

/**
 * Format currency amount
 */
const formatCurrency = (amount) => {
    return parseFloat(amount).toFixed(2);
};

module.exports = {
    calculateOverstayFee,
    calculateSlabBasedOverstayFee,
    calculateDurationMinutes,
    formatCurrency
};
