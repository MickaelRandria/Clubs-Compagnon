import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';

export const origin = 'http://127.0.0.1:5174';

/** Vraies routes OAuth + cookies ; seule la réponse du fournisseur est simulée. */
export async function signIn(page: Page, account: string, returnTo = '/fc27') {
  await page.route('https://discord.com/oauth2/authorize?**', async route => {
    const url = new URL(route.request().url());
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    assert.equal(callback.origin, origin, 'Le test ne doit jamais cibler le club réel.');
    callback.searchParams.set('state', url.searchParams.get('state')!);
    callback.searchParams.set('code', account);
    await route.fulfill({ status: 302, headers: { location: callback.href } });
  });
  const start = await page.request.get(`${origin}/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`, { maxRedirects: 0 });
  assert.equal(start.status(), 302);
  await page.goto(start.headers().location);
  await page.waitForURL(`${origin}${returnTo}`);
  await page.locator('.fc27-account-name').getByText(account, { exact: true }).waitFor();
  await page.unroute('https://discord.com/oauth2/authorize?**');
}

export async function resetCampaign(page: Page) {
  const status = await page.evaluate(async () => {
    const state = await (await fetch('/api/fc27')).json();
    const response = await fetch('/api/fc27', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', campaignId: state.campaign.id }) });
    return response.status;
  });
  assert.equal(status, 200);
  await page.goto(`${origin}/fc27`);
}
