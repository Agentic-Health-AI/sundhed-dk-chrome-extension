import type { CapturedResponse } from "../shared/types";

export function findResponse(responses: CapturedResponse[], matcher: string | RegExp) {
  return responses.find(response => {
    if (typeof matcher === "string") {
      return response.url.includes(matcher);
    }

    return matcher.test(response.url);
  });
}

export function normalizeText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

export function isoDate(value: unknown) {
  if (!value) {
    return "";
  }

  const text = String(value);
  return text.includes("T") ? text.split("T")[0] : text;
}

export function valueOrDash(value: unknown) {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : "-";
}

export function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return "";
  }

  const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  return [
    columns.map(csvEscape).join(","),
    ...rows.map(row => columns.map(column => csvEscape(row[column])).join(","))
  ].join("\n");
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function getRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function readPath(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, value);
}
