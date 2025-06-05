import { expect, test } from '@playwright/test';

test('home page has .svedit element', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.svedit')).toBeVisible();
});
