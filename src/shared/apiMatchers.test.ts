import { describe, expect, it } from "vitest";
import { isSundhedUrl, matchSection, toCapturedResponse } from "./apiMatchers";

describe("api matchers", () => {
  it("matches supported sundhed.dk API sections", () => {
    expect(matchSection("https://www.sundhed.dk/app/medicinkort2borger/api/v1/ordinations/")).toBe("medicin");
    expect(matchSection("https://www.sundhed.dk/api/labsvar/svaroversigt")).toBe("proevesvar");
  });

  it("does not match non-sundhed domains", () => {
    expect(isSundhedUrl("https://evil.example/app/medicinkort2borger/api/v1/ordinations/")).toBe(false);
    expect(matchSection("https://evil.example/app/medicinkort2borger/api/v1/ordinations/")).toBeUndefined();
  });

  it("normalizes injected payloads to captured responses", () => {
    const result = toCapturedResponse({
      url: "https://www.sundhed.dk/app/vaccination/api/v1/overview",
      method: "GET",
      status: 200,
      source: "fetch",
      body: { NumberOfEffectuatedVaccinations: 1 },
      capturedAt: "2026-06-17T12:00:00.000Z"
    });

    expect(result).toEqual(expect.objectContaining({ sectionId: "vaccinationer", sectionLabel: "Vaccinationer" }));
  });
});
