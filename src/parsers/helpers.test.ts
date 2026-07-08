import { describe, expect, it } from "vitest";
import { csvEscape } from "./helpers";

describe("parser helpers", () => {
  it("escapes spreadsheet formula-like CSV cells", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+SUM(A1:A2)")).toBe("'+SUM(A1:A2)");
    expect(csvEscape("-10")).toBe("'-10");
    expect(csvEscape("@cmd")).toBe("'@cmd");
  });

  it("keeps normal CSV quoting behavior after formula escaping", () => {
    expect(csvEscape('=HYPERLINK("https://example.com")')).toBe(`\"'=HYPERLINK(\"\"https://example.com\"\")\"`);
  });
});
