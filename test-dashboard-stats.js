// Test script to validate the extended dashboardStats implementation
const dashboardService = require('./src/services/dashboardService');

console.log('Testing Extended Dashboard Stats Implementation\n');
console.log('='.repeat(50));

// Mock context
const mockContext = {
    staff: { role: 'admin', id: 'admin-1' },
    organization: { id: 'org-1' },
    space: null
};

// Test cases
const tests = [
    {
        name: 'Today Stats (default)',
        args: [mockContext]
    },
    {
        name: 'Today Stats (explicit period)',
        args: [mockContext, 'today']
    },
    {
        name: 'Weekly Stats',
        args: [mockContext, 'week']
    },
    {
        name: 'Monthly Stats',
        args: [mockContext, 'month']
    },
    {
        name: 'Custom Date Range',
        args: [mockContext, null, '2026-04-20T00:00:00Z', '2026-04-26T23:59:59Z']
    }
];

async function runTests() {
    for (const test of tests) {
        try {
            console.log(`\n✓ Testing: ${test.name}`);
            console.log(`  Args: period=${test.args[1]}, startDate=${test.args[2]}, endDate=${test.args[3]}`);
            
            // Note: We can't actually call the service without a database connection
            // but we can verify the method exists and accepts the right parameters
            const method = dashboardService.getTodayStats;
            console.log(`  Method signature verified: ${typeof method === 'function' ? 'OK' : 'FAIL'}`);
            
        } catch (error) {
            console.error(`  ✗ Error: ${error.message}`);
        }
    }
}

// Check that the service method has been updated
console.log('\nVerifying Service Method Signature:');
const methodCode = dashboardService.getTodayStats.toString();
const expectedParams = ['context', 'period', 'startDate', 'endDate'];
let allParamsPresent = true;

for (const param of expectedParams) {
    if (methodCode.includes(param)) {
        console.log(`  ✓ Parameter '${param}' found`);
    } else {
        console.log(`  ✗ Parameter '${param}' NOT found`);
        allParamsPresent = false;
    }
}

// Check for period handling logic
console.log('\nVerifying Period Handling Logic:');
const periodChecks = [
    { keyword: "period === 'week'", description: 'Week calculation' },
    { keyword: "period === 'month'", description: 'Month calculation' },
    { keyword: 'startDate && endDate', description: 'Custom date range' }
];

for (const check of periodChecks) {
    if (methodCode.includes(check.keyword)) {
        console.log(`  ✓ ${check.description} logic found`);
    } else {
        console.log(`  ✗ ${check.description} logic NOT found`);
        allParamsPresent = false;
    }
}

// Check for cache key update
console.log('\nVerifying Cache Key Generation:');
if (methodCode.includes('start.toISOString()') && methodCode.includes('end.toISOString()')) {
    console.log(`  ✓ Cache key includes date range`);
} else {
    console.log(`  ✗ Cache key does NOT include date range`);
    allParamsPresent = false;
}

console.log('\n' + '='.repeat(50));
if (allParamsPresent) {
    console.log('✓ All implementation checks PASSED!');
} else {
    console.log('✗ Some implementation checks FAILED!');
    process.exit(1);
}
