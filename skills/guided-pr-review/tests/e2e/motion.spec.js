'use strict';
const { test, expect } = require('@playwright/test');
const { openReview } = require('./helpers.js');

// Records the animations the page starts from script, so a test can tell that a change was animated.
async function recordMotion(page) {
  await page.addInitScript(() => {
    window.__motion = { animate: [], scrollTo: [], transitions: [] };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      window.__motion.animate.push({ props: Object.keys((keyframes || [])[0] || {}), className: String(this.className?.baseVal ?? this.className ?? '') });
      return animate.call(this, keyframes, options);
    };
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...args) {
      window.__motion.scrollTo.push(typeof args[0] === 'object' ? args[0] : {});
      return scrollTo.apply(this, args);
    };
    // A hunk that leaves gets the leave class of its direction for as long as it slides out.
    new MutationObserver((records) => {
      for (const record of records) {
        const leaving = String(record.target.className).match(/hunk-(next|prev)-leave-active/);
        if (leaving && !String(record.oldValue).includes(leaving[0])) window.__motion.transitions.push(leaving[1]);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  });
}
const motion = (page) => page.evaluate(() => window.__motion);

// On Home the flows are the tiles on the band.
const flowRow = (page, name) => page.getByRole('banner').getByRole('button', { name: new RegExp(name) });
const stop = (page, code) => page.getByRole('button', { name: new RegExp(`^${code} `) });

async function openFlow(page) {
  await page.setViewportSize({ width: 1280, height: 560 });
  await recordMotion(page);
  await openReview(page);
  await flowRow(page, 'Show the forecast').click();
  // The tile sits on the band, so the pointer moves off the header, where it would open the compact header in full.
  await page.mouse.move(700, 540);
  await expect(stop(page, 'A1')).toHaveAttribute('aria-current', 'step');
}

test('the header shrinks and grows smoothly on scroll, and opens in full while the pointer rests on it', async ({ page }) => {
  await openFlow(page);
  const header = page.locator('header.band');
  const legend = header.locator('.legend-wrap');
  await page.locator('#main').evaluate((main) => { main.scrollTop = 400; });
  await expect(header).toHaveClass(/compact/);
  // The height animation runs to its end, not cancelled when the fades end.
  expect(await header.evaluate((element) => element.getAnimations().some((animation) => animation.playState === 'running'))).toBe(true);
  await expect(legend).toBeHidden();
  expect((await motion(page)).animate.some((call) => call.props.includes('height'))).toBe(true);

  // Scrolling back up grows the header with an animation too.
  await page.evaluate(() => { window.__motion.animate = []; });
  await page.locator('#main').evaluate((main) => { main.scrollTop = 0; });
  await expect(header).not.toHaveClass(/compact/);
  expect((await motion(page)).animate.some((call) => call.props.includes('height'))).toBe(true);
  await page.locator('#main').evaluate((main) => { main.scrollTop = 400; });
  await expect(header).toHaveClass(/compact/);

  await header.hover({ position: { x: 600, y: 20 } });
  await expect(legend).toBeVisible();
  await page.mouse.move(600, 540);
  await expect(legend).toBeHidden();
});

test('collapsible sections animate to their natural height', async ({ page }) => {
  await openFlow(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('interpolate-size'))).toBe('allow-keywords');
});

test('the next hunk slides in while the old one slides out', async ({ page }) => {
  await openFlow(page);
  await stop(page, 'A2').click();
  await expect(stop(page, 'A2')).toHaveAttribute('aria-current', 'step');
  // The fixed Ask button stays in its corner while the hunk slides.
  const ask = page.getByRole('button', { name: 'Ask the agent about this hunk' });
  const before = await ask.boundingBox();
  await stop(page, 'A3').click();
  const during = await ask.boundingBox();
  expect(Math.round(during.y)).toBe(Math.round(before.y));
  await stop(page, 'A1').click();
  await expect(stop(page, 'A1')).toHaveAttribute('aria-current', 'step');
  await expect.poll(async () => (await motion(page)).transitions.filter((move, at, all) => move !== all[at - 1])).toEqual(['next', 'prev']);
});

test('the map scrolls smoothly to the new stop, and its bar grows by a transform', async ({ page }) => {
  await openFlow(page);
  await stop(page, 'A3').click();
  await expect(stop(page, 'A3')).toHaveAttribute('aria-current', 'step');
  expect((await motion(page)).scrollTo.some((call) => call.behavior === 'smooth')).toBe(true);
  await expect(page.locator('[data-map-done]')).toHaveCSS('transform', /matrix/);
});

test('the Ask button turns its icon in when the panel opens', async ({ page }) => {
  await openFlow(page);
  await page.getByRole('button', { name: 'Ask the agent about this hunk' }).click();
  const icon = page.getByRole('button', { name: 'Close the questions about this hunk' }).locator('[data-ask-icon]');
  expect(await icon.evaluate((element) => getComputedStyle(element).animationName)).toMatch(/^icon-turn/);
});

test('the wheel over the header scrolls the hunk, so a tall header never blocks scrolling', async ({ page }) => {
  await openFlow(page);
  const main = page.locator('#main');
  await page.mouse.move(700, 60);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('a pinch or Ctrl and the wheel over the header zooms, and does not scroll the hunk', async ({ page }) => {
  await openFlow(page);
  await page.mouse.move(700, 60);
  const prevented = await page.locator('header.band').evaluate((header) => {
    const event = new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, bubbles: true, cancelable: true });
    header.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  expect(await page.locator('#main').evaluate((element) => element.scrollTop)).toBe(0);
});
