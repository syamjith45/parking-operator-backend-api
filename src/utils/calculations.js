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
    calculateDurationMinutes,
    formatCurrency
};
