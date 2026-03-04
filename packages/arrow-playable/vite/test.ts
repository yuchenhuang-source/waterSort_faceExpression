const { base64ToGzippedBase122, decodeGzippedBase122ToBase64 } = require('./base122');

// 测试函数
function runTest(testName, fn) {
    try {
        fn();
        console.log(`✅ ${testName} passed`);
    } catch (err) {
        console.error(`❌ ${testName} failed:`, err);
    }
}

// 测试用例
function runTests() {
    runTest('Basic encode/decode', () => {
        const original = 'SGVsbG8gV29ybGQ='; // "Hello World" in base64
        const encoded = base64ToGzippedBase122(original);
        const decoded = decodeGzippedBase122ToBase64(encoded);

        if (decoded !== original) {
            throw new Error(`Expected ${original}, got ${decoded}`);
        }
    });

    runTest('Empty string', () => {
        const empty = '';
        const encoded = base64ToGzippedBase122(empty);
        const decoded = decodeGzippedBase122ToBase64(encoded);
        
        if (decoded !== empty) {
            throw new Error('Empty string test failed');
        }
    });

    runTest('Large string', () => {
        const largeString = Buffer.from('A'.repeat(1000)).toString('base64');
        const encoded = base64ToGzippedBase122(largeString);
        const decoded = decodeGzippedBase122ToBase64(encoded);
        
        if (decoded !== largeString) {
            throw new Error('Large string test failed');
        }
    });
}

// 运行测试
runTests();