#!/usr/bin/env node

/**
 * Anti-Cheat Testing Script for 2D Game
 * Tests various console-based attack scenarios
 */

import http from 'http';

const SERVER_URL = 'http://localhost:5000';
const API_ENDPOINT = '/api/sessions';

// Test data - adjusted to match actual game mechanics
const legitimateSession = {
  durationSeconds: 45,
  finalScore: 150,
  coinsCollected: 150,
  obstaclesHit: 3,
  powerupsCollected: 2,
  distanceTraveled: 8000, // More realistic distance for 45 seconds (avg ~177 pixels/sec)
  gameResult: 'died'
};

const cheatingScenarios = [
  {
    name: 'Infinite Score',
    data: { ...legitimateSession, finalScore: 999999 },
    expectedError: 'Invalid score'
  },
  {
    name: 'Negative Values',
    data: { ...legitimateSession, finalScore: -100 },
    expectedError: 'Invalid score'
  },
  {
    name: 'Impossible Speed',
    data: { ...legitimateSession, durationSeconds: 1, distanceTraveled: 2000 },
    expectedError: 'Game speed appears manipulated'
  },
  {
    name: 'Coin Farming',
    data: { ...legitimateSession, coinsCollected: 800, distanceTraveled: 100 },
    expectedError: 'Coin collection appears manipulated'
  },
  {
    name: 'Perfect Game',
    data: { ...legitimateSession, obstaclesHit: 0, finalScore: 250 }, // Valid score (between 150 and 300)
    expectedError: null // Should pass individual validation but trigger pattern detection
  },
  {
    name: 'Invalid Game Result',
    data: { ...legitimateSession, gameResult: 'invalid' },
    expectedError: 'Invalid game result'
  },
  {
    name: 'Score Mismatch',
    data: { ...legitimateSession, finalScore: 50, coinsCollected: 100 },
    expectedError: 'Score must be between coins collected'
  }
];

class AntiCheatTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async makeRequest(data, description) {
    return new Promise((resolve) => {
      const postData = JSON.stringify(data);

      const options = {
        hostname: 'localhost',
        port: 5000,
        path: API_ENDPOINT,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            resolve({
              statusCode: res.statusCode,
              response,
              description
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              response: body,
              description
            });
          }
        });
      });

      req.on('error', (err) => {
        resolve({
          statusCode: null,
          error: err.message,
          description
        });
      });

      req.write(postData);
      req.end();
    });
  }

  async testLegitimateSession() {
    console.log('\n🟢 Testing LEGITIMATE session...');
    const result = await this.makeRequest(legitimateSession, 'Legitimate Session');

    if (result.statusCode === 200 && result.response.message === 'Session saved successfully!') {
      this.recordTest('✅ Legitimate Session', true, 'Session saved successfully');
    } else {
      this.recordTest('❌ Legitimate Session', false, `Expected success, got: ${result.statusCode} - ${JSON.stringify(result.response)}`);
    }
  }

  async testCheatingScenarios() {
    console.log('\n🔴 Testing CHEATING scenarios...');

    for (const scenario of cheatingScenarios) {
      console.log(`  Testing: ${scenario.name}`);
      const result = await this.makeRequest(scenario.data, scenario.name);

      const isRejected = result.statusCode === 400 || result.statusCode === 429;
      const hasExpectedError = !scenario.expectedError ||
        (result.response && result.response.message && result.response.message.includes(scenario.expectedError));

      if (isRejected && hasExpectedError) {
        this.recordTest(`✅ ${scenario.name}`, true, `Properly rejected: ${result.response?.message || 'Rejected'}`);
      } else {
        this.recordTest(`❌ ${scenario.name}`, false, `Expected rejection, got: ${result.statusCode} - ${JSON.stringify(result.response)}`);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async testRateLimiting() {
    console.log('\n⏱️  Testing RATE LIMITING...');

    const rapidRequests = [];
    for (let i = 0; i < 15; i++) {
      rapidRequests.push(this.makeRequest(legitimateSession, `Rate Limit Test ${i + 1}`));
    }

    const results = await Promise.all(rapidRequests);
    const rejectedCount = results.filter(r => r.statusCode === 429).length;

    if (rejectedCount > 0) {
      this.recordTest('✅ Rate Limiting', true, `${rejectedCount} requests properly rate limited`);
    } else {
      this.recordTest('❌ Rate Limiting', false, 'No rate limiting detected');
    }
  }

  async testSuspiciousPatterns() {
    console.log('\n🎯 Testing SUSPICIOUS PATTERNS...');

    // Use the same guestId for all requests to accumulate under one user
    const guestId = 'PATTERN_TEST_' + Date.now();

    // Send multiple perfect games sequentially to build up pattern detection
    const results = [];
    for (let i = 0; i < 5; i++) {
      const result = await this.makeRequest({
        ...legitimateSession,
        obstaclesHit: 0,
        finalScore: 250 + i * 10, // Valid scores that pass individual validation
        guestId: guestId // Use same guest ID for pattern accumulation
      }, `Perfect Game ${i + 1}`);
      results.push(result);

      // Longer delay to ensure pattern detection has time to accumulate
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const rejectedCount = results.filter(r => r.statusCode === 400 &&
      r.response?.message?.includes('perfect games')).length;

    if (rejectedCount > 0) {
      this.recordTest('✅ Suspicious Pattern Detection', true, `${rejectedCount} suspicious patterns detected`);
    } else {
      this.recordTest('❌ Suspicious Pattern Detection', false, 'Pattern detection not triggered');
    }
  }

  recordTest(name, passed, details) {
    this.results.tests.push({ name, passed, details });
    if (passed) {
      this.results.passed++;
    } else {
      this.results.failed++;
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🎮 ANTI-CHEAT TESTING RESULTS');
    console.log('='.repeat(60));

    console.log(`\n📊 SUMMARY:`);
    console.log(`   ✅ Passed: ${this.results.passed}`);
    console.log(`   ❌ Failed: ${this.results.failed}`);
    console.log(`   📋 Total Tests: ${this.results.tests.length}`);

    console.log(`\n📋 DETAILED RESULTS:`);
    this.results.tests.forEach((test, index) => {
      console.log(`   ${index + 1}. ${test.name}`);
      console.log(`      ${test.details}`);
    });

    const successRate = (this.results.passed / this.results.tests.length * 100).toFixed(1);
    console.log(`\n🎯 SUCCESS RATE: ${successRate}%`);

    if (this.results.failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Anti-cheat protection is working correctly.');
    } else {
      console.log(`\n⚠️  ${this.results.failed} TESTS FAILED! Check the protection implementation.`);
    }

    console.log('='.repeat(60));
  }

  async waitForServer(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const checkServer = () => {
        http.get(`${SERVER_URL}/api/active-users`, (res) => {
          resolve(true);
        }).on('error', () => {
          setTimeout(checkServer, 500);
        });
      };

      checkServer();

      setTimeout(() => {
        reject(new Error('Server not responding'));
      }, timeout);
    });
  }

  async run() {
    console.log('🚀 Starting Anti-Cheat Testing Script...');
    console.log('📡 Checking server connection...');

    try {
      await this.waitForServer();
      console.log('✅ Server is running');
    } catch (error) {
      console.log('❌ Server not running. Please start the server first: npm start');
      process.exit(1);
    }

    console.log('🧪 Running tests...');

    await this.testLegitimateSession();
    await this.testCheatingScenarios();
    await this.testRateLimiting();
    await this.testSuspiciousPatterns();

    this.printResults();
  }
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new AntiCheatTester();
  tester.run().catch(console.error);
}

export default AntiCheatTester;