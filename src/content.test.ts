import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

describe("content script bundle", () => {
  it("runs as a classic content script and forwards section-specific responses", async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto("https://www.sundhed.dk/test");
    await page.evaluate(() => {
      const runtimeMessages: unknown[] = [];
      (window as unknown as { runtimeMessages: unknown[] }).runtimeMessages = runtimeMessages;
      (window as unknown as { chrome: unknown }).chrome = {
        runtime: {
          sendMessage: async (message: unknown) => {
            runtimeMessages.push(message);
            if ((message as { type?: string }).type === "GET_STATE") {
              return { ok: true, data: { status: "capturing" } };
            }
            return { ok: true };
          },
          onMessage: {
            addListener: () => undefined
          }
        }
      };
    });

    await page.addScriptTag({ content: readFileSync(resolve("dist/content.js"), "utf8") });
    await page.waitForFunction(() =>
      (window as unknown as { runtimeMessages: Array<{ type?: string }> }).runtimeMessages.some(
        message => message.type === "GET_STATE"
      )
    );
    await page.evaluate(() => {
      window.postMessage(
        {
          source: "sundhedsarkiv:page-hook",
          type: "API_RESPONSE",
          payload: {
            url: "https://www.sundhed.dk/app/proevesvarportal/api/v1/svaroversigt",
            method: "GET",
            status: 200,
            source: "fetch",
            capturedAt: "2026-06-17T12:00:00.000Z",
            body: { Svaroversigt: { Laboratorieresultater: [] } }
          }
        },
        window.location.origin
      );
      window.postMessage(
        {
          source: "sundhedsarkiv:page-hook",
          type: "API_RESPONSE",
          payload: {
            url: "https://www.sundhed.dk/app/billedbeskrivelserborger/api/v1/billedbeskrivelser/henvisninger/",
            method: "GET",
            status: 200,
            source: "fetch",
            capturedAt: "2026-06-17T12:00:01.000Z",
            body: { TotalItems: 1, Svar: [{}] }
          }
        },
        window.location.origin
      );
    });

    await page.waitForFunction(() =>
      (window as unknown as { runtimeMessages: Array<{ type?: string }> }).runtimeMessages.filter(
        message => message.type === "CAPTURED_RESPONSE"
      ).length >= 2
    );
    const messages = await page.evaluate(() => (window as unknown as { runtimeMessages: unknown[] }).runtimeMessages);
    await browser.close();

    expect(readFileSync(resolve("dist/content.js"), "utf8").startsWith("import")).toBe(false);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "CAPTURED_RESPONSE",
          payload: expect.objectContaining({
            sectionId: "proevesvar",
            sectionLabel: "Prøvesvar",
            url: "https://www.sundhed.dk/app/proevesvarportal/api/v1/svaroversigt"
          })
        }),
        expect.objectContaining({
          type: "CAPTURED_RESPONSE",
          payload: expect.objectContaining({
            sectionId: "roentgen",
            sectionLabel: "Røntgen",
            url: "https://www.sundhed.dk/app/billedbeskrivelserborger/api/v1/billedbeskrivelser/henvisninger/"
          })
        })
      ])
    );
  });
});
