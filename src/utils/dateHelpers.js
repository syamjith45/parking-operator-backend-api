/**
 * Get current timestamp in ISO format
 */
const getCurrentTimestamp = () => {
    return new Date().toISOString();
};

/**
 * Format duration as human-readable string
 */
const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
};

/**
 * Check if timestamp is today
 */
const isToday = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();

    return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
};

module.exports = {
    getCurrentTimestamp,
    formatDuration,
    isToday
};
