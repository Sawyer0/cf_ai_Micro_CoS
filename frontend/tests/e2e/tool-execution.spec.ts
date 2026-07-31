import { test, expect } from '@playwright/test';

test.describe('Tool Execution Workflow', () => {
    test('should trigger flight search tool and render results', async ({ page }) => {
        await page.goto('/');

        // Wait for the chat interface to load
        await expect(page.getByRole('textbox')).toBeVisible();

        // Send flight request
        await page.getByRole('textbox').fill('find flights from SFO to JFK next week');
        await page.getByRole('textbox').press('Enter');

        // 1. Verify "Thinking..." appears
        // It might be fast, so we use a short timeout or just check if it appears at some point if we could, 
        // but for now let's just check that the tool card appears which implies the flow started.

        // 2. Verify Tool Card appears
        // "Flight Search" text should be visible
        await expect(page.getByText('Flight Search')).toBeVisible({ timeout: 30000 });

        // 3. Verify "Executing..." state (might be too fast to catch reliably in E2E, but let's try or skip)
        // Better to wait for "Complete" or the result.

        // 4. Wait for "Complete" status
        await expect(page.getByText('Complete')).toBeVisible({ timeout: 30000 });

        // 5. Verify JSON data is rendered (ToolExecutionCard renders a <pre> tag)
        // We expect some flight data in the pre tag
        const preTag = page.locator('pre');
        await expect(preTag).toBeVisible();
        const jsonContent = await preTag.textContent();
        expect(jsonContent).toContain('flight_options');
        expect(jsonContent).toContain('flights');

        // 6. Verify Assistant follows up with a message
        // The assistant should summarize the flights after the tool result
        await expect(page.locator('.bg-slate-800.text-slate-100').last()).toBeVisible();
        const responseText = await page.locator('.bg-slate-800.text-slate-100').last().textContent();
        expect(responseText).toMatch(/Flight|Airline|USD|options|search/i);

        // Ensure "Thinking..." is gone
        await expect(page.getByText('Thinking...')).not.toBeVisible();
    });
});
