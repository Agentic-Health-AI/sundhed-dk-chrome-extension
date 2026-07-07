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
    await page.route("https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/filter", async route => {
      const requestBody = route.request().postDataJSON() as { Side?: number };
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          NumberOfForloeb: 11,
          Forloeb:
            requestBody.Side === 2
              ? [
                  {
                    AntalKontaktperioder: 0,
                    AntalEpikriser: 0,
                    AntalNotater: 1,
                    IdNoegle: { Database: null, Noegle: "forloeb-2", VaerdispringNoegle: null }
                  }
                ]
              : []
        })
      });
    });
    await page.route("https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/kontaktperioder**", route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ kontaktperioder: [{ status: "Afsluttet" }] })
      });
    });
    await page.route(/\/app\/ejournalportalborger\/api\/ejournal\/epikriser-page\?/, route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ Notater: [{ overskrift: "Epikrise page" }] })
      });
    });
    await page.route(/\/app\/ejournalportalborger\/api\/ejournal\/notater-page\?/, route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ Notater: [{ overskrift: "Notat page" }] })
      });
    });
    await page.route(/\/app\/ejournalportalborger\/api\/ejournal\/epikriser\?/, route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ epikriser: [{ overskrift: "Epikrise" }] })
      });
    });
    await page.route(/\/app\/ejournalportalborger\/api\/ejournal\/notater\?/, route => {
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
      await fetch("https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/filtervalg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          DatoFra: "1999-12-02T22:00:00.000Z",
          DatoTil: "2026-07-07T22:38:47.000Z",
          Sektorer: ["OffentligSygehus", "PrivatHospital", "SpecialLaege", "None"]
        })
      });
      await fetch(
        "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt?Side=1&Sortering=updated&SortDesc=true&ItemsPerPage=10"
      );
    });

    await page.waitForFunction(() => {
      const urls = (window as unknown as { capturedMessages: Array<{ payload?: { url?: string } }> }).capturedMessages
        .map(message => message.payload?.url ?? "")
        .join("\n");
      return (
        urls.includes("/ejournal/filter") &&
        urls.includes("/kontaktperioder") &&
        urls.includes("/epikriser") &&
        urls.includes("/epikriser-page") &&
        urls.includes("/notater") &&
        urls.includes("/notater-page")
      );
    });

    const urls = await page.evaluate(() =>
      (window as unknown as { capturedMessages: Array<{ payload?: { url?: string } }> }).capturedMessages.map(
        message => message.payload?.url ?? ""
      )
    );
    await browser.close();

    expect(urls.some(url => url.endsWith("/app/ejournalportalborger/api/ejournal/filter"))).toBe(true);
    expect(urls.some(url => url.includes("/kontaktperioder"))).toBe(true);
    expect(urls.some(url => url.includes("/epikriser"))).toBe(true);
    expect(urls.some(url => url.includes("/epikriser-page"))).toBe(true);
    expect(urls.some(url => url.includes("/notater?"))).toBe(true);
    expect(urls.some(url => url.includes("/notater-page"))).toBe(true);
  });

  it("replays journal expansion when capture status arrives after the overview response", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.route("https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt**", route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          NumberOfForloeb: 1,
          Forloeb: [
            {
              AntalKontaktperioder: 0,
              AntalEpikriser: 0,
              AntalNotater: 1,
              IdNoegle: { Database: null, Noegle: "forloeb-late-status", VaerdispringNoegle: null }
            }
          ]
        })
      });
    });
    await page.route(/\/app\/ejournalportalborger\/api\/ejournal\/notater\?/, route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ Notater: [{ Overskrift: "Sent notat" }] })
      });
    });
    await page.route(/\/app\/ejournalportalborger\/api\/ejournal\/notater-page\?/, route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ Notater: [{ Overskrift: "Sent notat page" }] })
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

    await page.evaluate(async () => {
      await fetch(
        "https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt?Side=1&Sortering=updated&SortDesc=true&ItemsPerPage=10"
      );
    });

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

    await page.waitForFunction(() => {
      const urls = (window as unknown as { capturedMessages: Array<{ payload?: { url?: string } }> }).capturedMessages
        .map(message => message.payload?.url ?? "")
        .join("\n");
      return urls.includes("/notater?") && urls.includes("/notater-page");
    });

    const urls = await page.evaluate(() =>
      (window as unknown as { capturedMessages: Array<{ payload?: { url?: string } }> }).capturedMessages.map(
        message => message.payload?.url ?? ""
      )
    );
    await browser.close();

    expect(urls.some(url => url.includes("/notater?"))).toBe(true);
    expect(urls.some(url => url.includes("/notater-page"))).toBe(true);
  });

  it("expands journal note page endpoints until all DataTables pages are requested", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.route("https://www.sundhed.dk/app/ejournalportalborger/api/ejournal/forloebsoversigt**", route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          NumberOfForloeb: 1,
          Forloeb: [
            {
              AntalKontaktperioder: 0,
              AntalEpikriser: 0,
              AntalNotater: 125,
              IdNoegle: { Database: null, Noegle: "forloeb-many-notes", VaerdispringNoegle: null }
            }
          ]
        })
      });
    });
    await page.route(/\/app\/ejournalportalborger\/api\/ejournal\/notater\?/, route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ Notater: [] })
      });
    });
    await page.route(/\/app\/ejournalportalborger\/api\/ejournal\/notater-page\?/, route => {
      const body = route.request().postDataJSON() as { start?: number; length?: number };
      const start = body.start ?? 0;
      const length = body.length ?? 50;
      const remaining = Math.max(0, 125 - start);
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          TotalCount: 125,
          Filtered: 125,
          Notater: Array.from({ length: Math.min(length, remaining) }, (_, index) => ({
            Overskrift: `Notat ${start + index + 1}`
          }))
        })
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
      const starts = (window as unknown as { capturedMessages: Array<{ payload?: { url?: string; body?: unknown } }> }).capturedMessages
        .filter(message => message.payload?.url?.includes("/notater-page"))
        .map(message => {
          const body = message.payload?.body as { Notater?: unknown[] } | undefined;
          return body?.Notater?.[0] ? String((body.Notater[0] as { Overskrift?: string }).Overskrift ?? "") : "";
        });
      return starts.some(value => value.includes("Notat 1")) && starts.some(value => value.includes("Notat 51")) && starts.some(value => value.includes("Notat 101"));
    });

    const notePageFirstTitles = await page.evaluate(() =>
      (window as unknown as { capturedMessages: Array<{ payload?: { url?: string; body?: unknown } }> }).capturedMessages
        .filter(message => message.payload?.url?.includes("/notater-page"))
        .map(message => {
          const body = message.payload?.body as { Notater?: unknown[] } | undefined;
          return body?.Notater?.[0] ? String((body.Notater[0] as { Overskrift?: string }).Overskrift ?? "") : "";
        })
    );
    await browser.close();

    expect(notePageFirstTitles).toEqual(expect.arrayContaining(["Notat 1", "Notat 51", "Notat 101"]));
  });

  it("expands proevesvar overview requests to a two year lookback while capturing", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.route("https://www.sundhed.dk/app/proevesvarportal/api/v1/svaroversigt**", route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ Svaroversigt: { Laboratorieresultater: [] } })
      });
    });

    await page.goto("https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/laboratoriesvar/");
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
        "https://www.sundhed.dk/app/proevesvarportal/api/v1/svaroversigt?fra=2026-01-08T00:00:00&til=2026-07-08T23:59:59&source=RegionaleProevesvar&omraade=Alle"
      );
    });

    await page.waitForFunction(() =>
      (window as unknown as { capturedMessages: Array<{ payload?: { url?: string } }> }).capturedMessages.some(message => {
        const url = message.payload?.url;
        return url ? new URL(url).searchParams.get("fra") === "2024-07-08T00:00:00" : false;
      })
    );

    const expandedFraValues = await page.evaluate(() =>
      (window as unknown as { capturedMessages: Array<{ payload?: { url?: string } }> }).capturedMessages
        .map(message => message.payload?.url)
        .filter((url): url is string => Boolean(url))
        .map(url => new URL(url).searchParams.get("fra"))
    );
    await browser.close();

    expect(expandedFraValues).toContain("2024-07-08T00:00:00");
  });

  it("expands roentgen result pagination while capturing", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.route("https://www.sundhed.dk/app/billedbeskrivelserborger/api/v1/billedbeskrivelser/henvisninger/**", route => {
      void route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          TotalItems: 25,
          Svar: Array.from({ length: 10 }, (_, index) => ({ Id: index + 1 }))
        })
      });
    });

    await page.goto("https://www.sundhed.dk/borger/min-side/min-sundhedsjournal/billedbeskrivelser/");
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
        "https://www.sundhed.dk/app/billedbeskrivelserborger/api/v1/billedbeskrivelser/henvisninger/?Fra=2012-01-01&Til=2026-07-08&Direction=desc&SortColumn=1&ItemsPerPage=10&CurrentPage=1"
      );
    });

    await page.waitForFunction(() => {
      const pages = (window as unknown as { capturedMessages: Array<{ payload?: { url?: string } }> }).capturedMessages
        .map(message => message.payload?.url)
        .filter((url): url is string => Boolean(url))
        .map(url => new URL(url).searchParams.get("CurrentPage"));
      return pages.includes("2") && pages.includes("3");
    });

    const capturedPages = await page.evaluate(() =>
      (window as unknown as { capturedMessages: Array<{ payload?: { url?: string } }> }).capturedMessages
        .map(message => message.payload?.url)
        .filter((url): url is string => Boolean(url))
        .map(url => new URL(url).searchParams.get("CurrentPage"))
    );
    await browser.close();

    expect(capturedPages).toEqual(expect.arrayContaining(["1", "2", "3"]));
  });
});
