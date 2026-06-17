import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

describe("injected hook bundle", () => {
  it("captures JSON API responses on www.sundhed.dk even with misleading content-types", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const messages: unknown[] = [];

    await page.route("https://www.sundhed.dk/app/medicinkort2borger/api/v1/ordinations/", route => {
      void route.fulfill({
        contentType: "text/plain",
        body: JSON.stringify([{ DrugMedication: "Ovison" }])
      });
    });
    await page.route("https://www.sundhed.dk/api/labsvar/svaroversigt", route => {
      void route.fulfill({
        contentType: "text/html",
        body: JSON.stringify({ Svaroversigt: { Laboratorieresultater: [] } })
      });
    });
    await page.route("https://www.sundhed.dk/app/vaccination/api/v1/overview", route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ NumberOfEffectuatedVaccinations: 1 })
      });
    });

    await page.goto("https://www.sundhed.dk/test");
    await page.evaluate(readFileSync(resolve("dist/injected.js"), "utf8"));
    await page.evaluate(() => {
      window.addEventListener("message", event => {
        (window as unknown as { capturedMessages: unknown[] }).capturedMessages.push(event.data);
      });
      (window as unknown as { capturedMessages: unknown[] }).capturedMessages = [];
    });

    await page.evaluate(async () => {
      await fetch("https://www.sundhed.dk/app/medicinkort2borger/api/v1/ordinations/");
      await fetch("https://www.sundhed.dk/api/labsvar/svaroversigt");
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "https://www.sundhed.dk/app/vaccination/api/v1/overview");
      xhr.responseType = "json";
      await new Promise<void>(resolve => {
        xhr.onloadend = () => resolve();
        xhr.send();
      });
    });

    await page.waitForFunction(() => (window as unknown as { capturedMessages: unknown[] }).capturedMessages.length >= 3);
    messages.push(...(await page.evaluate(() => (window as unknown as { capturedMessages: unknown[] }).capturedMessages)));
    await browser.close();

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "sundhedsarkiv:page-hook",
          type: "API_RESPONSE",
          payload: expect.objectContaining({ source: "fetch", status: 200, body: [{ DrugMedication: "Ovison" }] })
        }),
        expect.objectContaining({
          source: "sundhedsarkiv:page-hook",
          type: "API_RESPONSE",
          payload: expect.objectContaining({ source: "fetch", body: { Svaroversigt: { Laboratorieresultater: [] } } })
        }),
        expect.objectContaining({
          source: "sundhedsarkiv:page-hook",
          type: "API_RESPONSE",
          payload: expect.objectContaining({ source: "xhr", body: { NumberOfEffectuatedVaccinations: 1 } })
        })
      ])
    );
  });
});
