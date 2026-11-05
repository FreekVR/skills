'use strict';
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
});
