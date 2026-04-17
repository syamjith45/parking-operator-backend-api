/**
 * Calculate overstay fee based on minutes over base period
 * @param {number} totalMinutes - Total parking duration in minutes
 * @param {number} baseMinutes - Base period included in base fee
 * @param {number} extraHourRate - Rate per extra hour
 * @returns {object} - { overstayMinutes, overstayFee }
 */
const calculateOverstayFee = (totalMinutes, baseMinutes, extraHourRate) => {
    if (totalMinutes <= baseMinutes) {
        return { overstayMinutes: 0, overstayFee: 0 };
    }

    const overstayMinutes = totalMinutes - baseMinutes;

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
 * @param {number} totalMinutes - Total parking duration in minutes
 * @param {number} baseMinutes - Base period included in base fee
 * @param {Array} slabs - Array of { slab_hours, slab_fee } sorted by slab_hours ascending
 * @returns {object} - { overstayMinutes, overstayFee, appliedSlab }
 */
const calculateSlabBasedOverstayFee = (totalMinutes, baseMinutes, slabs) => {
    if (totalMinutes <= baseMinutes) {
        return { overstayMinutes: 0, overstayFee: 0, appliedSlab: null };
    }

    const overstayMinutes = totalMinutes - baseMinutes;
    const totalHours = totalMinutes / 60;

    // Sort slabs by slab_hours descending to find the highest applicable slab
    const sortedSlabs = [...slabs].sort((a, b) => b.slab_hours - a.slab_hours);

    // Find the first slab where totalHours > slab_hours
    // If totalHours is 14h and slabs are [3h, 12h, 24h], we check:
    // - 24h slab: 14 > 24? No
    // - 12h slab: 14 > 12? Yes, apply 12h slab fee
    let appliedSlab = null;
    for (const slab of sortedSlabs) {
        if (totalHours > slab.slab_hours) {
            appliedSlab = slab;
            break;
        }
    }

    // If no slab found where totalHours > slab_hours, use the last (largest) slab
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
