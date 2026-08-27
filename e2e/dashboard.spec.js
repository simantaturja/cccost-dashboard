const { test, expect } = require('@playwright/test');

const TABS = ['Overview', 'Breakdown', 'Advisor', 'Waste', 'Sessions'];

// Collect page errors and console errors for the whole test, then assert at the
// end — asserting eagerly inside the handler would report the failure against
// whichever step happened to be running.
function watchForErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

test('dashboard renders against the demo fixtures', async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Claude Code Cost Dashboard' })).toBeVisible();

  // The demo fixtures contain priced messages, so a dollar amount must render.
  await expect(page.getByText(/\$\d/).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('every tab renders without errors', async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto('/');
  for (const label of TABS) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }

  expect(errors).toEqual([]);
});
