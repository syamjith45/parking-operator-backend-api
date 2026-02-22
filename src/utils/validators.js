const validatePhoneNumber = (phone) => {
    const phoneRegex = /^[0-9]{10,15}$/;
    return phoneRegex.test(phone.replace(/[\s-]/g, ''));
};

const validateVehicleType = (type) => {
    const validTypes = ['bike', 'car', 'truck'];
    return validTypes.includes(type.toLowerCase());
};

const validateVehicleNumber = (number) => {
    // Basic validation - can be customized per region
    // Allowing alphanumeric and some common separators
    if (!number) return false;
    const cleanNumber = number.replace(/[\s-]/g, '');
    return cleanNumber.length >= 4 && cleanNumber.length <= 20;
};

const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
};

module.exports = {
    validatePhoneNumber,
    validateVehicleType,
    validateVehicleNumber,
    sanitizeInput
};
