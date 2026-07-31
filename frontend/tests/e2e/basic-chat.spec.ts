import { test, expect } from '@playwright/test';

test.describe('Basic Chat Workflow', () => {
    test('should handle basic greeting without triggering tools', async ({ page }) => {
        await page.goto('/');

        // Wait for the chat interface to load
        await expect(page.getByRole('textbox')).toBeVisible();

        // Send "hi"
        await page.getByRole('textbox').fill('hi');
        await page.getByRole('textbox').press('Enter');

        // Wait for response
        // Assistant messages have bg-slate-800 class
        await expect(page.locator('.bg-slate-800.text-slate-100').last()).toBeVisible({ timeout: 10000 });

        // Get the text of the last assistant message
        const responseText = await page.locator('.bg-slate-800.text-slate-100').last().textContent();

        // Verify it's a greeting
        expect(responseText).toBeTruthy();

        // Verify NO raw JSON or Python tags
        expect(responseText).not.toContain('{"type":');
        expect(responseText).not.toContain('<|python_tag|>');
        expect(responseText).not.toContain('flight_options');

        // Verify NO tool execution cards
        // Tool cards have specific text like "Flight Search" or "Calendar Query"
        await expect(page.getByText('Flight Search')).not.toBeVisible();
        await expect(page.getByText('Calendar Query')).not.toBeVisible();

        // Ensure "Thinking..." is gone
        await expect(page.getByText('Thinking...')).not.toBeVisible();
    });
});
