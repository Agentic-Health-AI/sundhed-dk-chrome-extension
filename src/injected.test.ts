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

  it("expands journal overview responses into additional pages and detail calls while capturing", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.route("https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt**", route => {
      const requestUrl = new URL(route.request().url());
      const side = requestUrl.searchParams.get("Side") ?? "1";
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          NumberOfForloeb: 11,
          Forloeb:
            side === "1"
              ? [
                  {
                    AntalKontaktperioder: 1,
                    AntalEpikriser: 1,
                    AntalNotater: 1,
                    IdNoegle: { Database: null, Noegle: "forloeb-1", VaerdispringNoegle: null }
                  }
                ]
              : [
                  {
                    AntalKontaktperioder: 0,
                    AntalEpikriser: 0,
                    AntalNotater: 1,
                    IdNoegle: { Database: null, Noegle: "forloeb-2", VaerdispringNoegle: null }
                  }
                ]
        })
      });
    });
    await page.route("https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/kontaktperioder**", route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ kontaktperioder: [{ status: "Afsluttet" }] })
      });
    });
    await page.route("https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/epikriser**", route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ epikriser: [{ overskrift: "Epikrise" }] })
      });
    });
    await page.route("https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/notater**", route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ notater: [{ overskrift: "Notat" }] })
      });
    });

    await page.goto("https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/journal-fra-sygehus/");
    await page.evaluate(() => {
      (window as unknown as { capturedMessages: unknown[] }).capturedMessages = [];
      window.addEventListener("message", event => {
        if (event.data?.source === "sundhedsarkiv:page-hook") {
          (window as unknown as { capturedMessages: unknown[] }).capturedMessages.push(event.data);
        }
      });
    });
    await page.evaluate(readFileSync(resolve("dist/injected.js"), "utf8"));
    await page.evaluate(() => {
      window.postMessage(
        {
          source: "sundhedsarkiv:content-script",
          type: "CAPTURE_STATUS",
          status: "capturing"
        },
        window.location.origin
      );
    });

    await page.evaluate(async () => {
      await fetch(
        "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt?Side=1&Sortering=updated&SortDesc=true&ItemsPerPage=10"
      );
    });

    await page.waitForFunction(() => {
      const urls = (window as unknown as { capturedMessages: Array<{ payload?: { url?: string } }> }).capturedMessages
        .map(message => message.payload?.url ?? "")
        .join("\n");
      return (
        urls.includes("forloebsoversigt?Side=2") &&
        urls.includes("/kontaktperioder") &&
        urls.includes("/epikriser") &&
        urls.split("/notater").length - 1 === 2
      );
    });

    const urls = await page.evaluate(() =>
      (window as unknown as { capturedMessages: Array<{ payload?: { url?: string } }> }).capturedMessages.map(
        message => message.payload?.url ?? ""
      )
    );
    await browser.close();

    expect(urls.some(url => url.includes("forloebsoversigt?Side=2"))).toBe(true);
    expect(urls.some(url => url.includes("/kontaktperioder"))).toBe(true);
    expect(urls.some(url => url.includes("/epikriser"))).toBe(true);
    expect(urls.filter(url => url.includes("/notater"))).toHaveLength(2);
  });
});
