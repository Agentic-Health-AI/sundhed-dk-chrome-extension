import { getSection, HEALTH_SECTIONS } from "./sections";
import type { CapturedResponse, InjectedApiResponse, SectionId } from "./types";

export function isSundhedUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.sundhed.dk";
  } catch {
    return false;
  }
}

export function looksLikeSundhedApi(url: string) {
  try {
    const parsed = new URL(url);
    return isSundhedUrl(url) && !isBlockedSensitiveSundhedApi(url) && (parsed.pathname.includes("/api/") || parsed.pathname.includes("/app/"));
  } catch {
    return false;
  }
}

export function isBlockedSensitiveSundhedApi(url: string) {
  try {
    const parsed = new URL(url);
    const normalized = normalizeSensitiveUrlPart(`${parsed.pathname}${parsed.search}`);
    return SENSITIVE_API_PATTERNS.some(pattern => normalized.includes(pattern));
  } catch {
    return true;
  }
}

export function matchSection(url: string): SectionId | undefined {
  if (!looksLikeSundhedApi(url)) {
    return undefined;
  }

  const normalizedUrl = url.toLowerCase();
  const section = HEALTH_SECTIONS.find(candidate =>
    candidate.matchers.some(matcher => normalizedUrl.includes(matcher.toLowerCase()))
  );

  return section?.id;
}

export function toCapturedResponse(payload: InjectedApiResponse): CapturedResponse | undefined {
  if (!looksLikeSundhedApi(payload.url)) {
    return undefined;
  }

  const sectionId = matchSection(payload.url) ?? matchSectionFromBody(payload.body) ?? "ukendt";
  if (!sectionId) {
    return undefined;
  }

  const section = getSection(sectionId);
  const identity = `${sectionId}:${payload.method}:${payload.status}:${payload.url}:${payload.capturedAt}`;

  return {
    id: stableHash(identity),
    sectionId,
    sectionLabel: section?.label ?? "Ukendt API",
    url: payload.url,
    method: payload.method.toUpperCase(),
    status: payload.status,
    source: payload.source,
    capturedAt: payload.capturedAt,
    body: payload.body
  };
}

function matchSectionFromBody(body: unknown): SectionId | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }

  if ("Svaroversigt" in body) {
    return "proevesvar";
  }

  return undefined;
}

function stableHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `cap_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

const SENSITIVE_API_PATTERNS = [
  "/api/auth",
  "/auth/mitid",
  "ott_token",
  "sessionid",
  "personvaelger",
  "personvælger",
  "logout"
];

function normalizeSensitiveUrlPart(value: string) {
  try {
    return decodeURIComponent(value).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}
