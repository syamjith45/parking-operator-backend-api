const { PARKING_MODES } = require('../constants/parkingModes');

const calculateAllowedUntil = (vehicle, pricingRule) => {
    if (vehicle.parking_mode === PARKING_MODES.CUSTOM_DATE && vehicle.expected_exit_date) {
        return new Date(vehicle.expected_exit_date);
    }

    // Default to HOURLY
    const entryDate = new Date(vehicle.entry_time);
    const baseMinutes = Math.max(
        (pricingRule?.base_hours || 0) * 60,
        (vehicle.declared_duration_hours || 0) * 60
    );

    return new Date(entryDate.getTime() + baseMinutes * 60000);
};

module.exports = {
    calculateAllowedUntil
};
