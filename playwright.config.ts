import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Electron app testing
 *
 * This config is set up to test the Open Loops Electron app.
 * Tests will launch the app in dev mode using electron-vite.
 */
export default defineConfig({
  testDir: './tests',

  // Run tests in serial (one at a time) since we're launching Electron
  fullyParallel: false,
  workers: 1,

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter to use
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL for the app (vite dev server)
    baseURL: 'http://localhost:5173',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',
  },

  // Configure projects for Electron testing
  projects: [
    {
      name: 'electron',
      use: {
        ...devices['Desktop Chrome'],
        // Electron-specific viewport (will be overridden by actual window size)
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  // Output directory for test artifacts
  outputDir: 'test-results/',
})
