import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { addStoredResponse, clearStoredResponses, getStoredResponses } from "./captureDb";
import { capturedResponse } from "../test/fixtures";

describe("captureDb", () => {
  beforeEach(async () => {
    await clearStoredResponses();
  });

  it("stores and deduplicates captured responses", async () => {
    const response = capturedResponse("diagnoser", "https://www.sundhed.dk/app/diagnoser/api/v1/diagnoser", {
      diagnoser: [{ diagnoseTekst: "Test" }]
    });

    await expect(addStoredResponse(response)).resolves.toBe(true);
    await expect(addStoredResponse({ ...response, id: "different-id" })).resolves.toBe(false);

    const stored = await getStoredResponses();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(response);
  });

  it("clears stored responses", async () => {
    await addStoredResponse(capturedResponse("aftaler", "https://www.sundhed.dk/app/aftaler/api/v1/aftaler/cpr", {}));
    await clearStoredResponses();

    await expect(getStoredResponses()).resolves.toEqual([]);
  });
});
