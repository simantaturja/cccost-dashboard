const { defineConfig, devices } = require('@playwright/test');

const PORT = 3457; // not 3456 — avoid colliding with a dashboard the dev is already running

module.exports = defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    {
      name: 'light',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light' },
    },
    {
      name: 'dark',
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
  ],
  webServer: {
    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      CLAUDE_PROJECTS_DIR: require('node:path').join(__dirname, 'demo', 'projects'),
    },
  },
});
