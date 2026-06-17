import { getSection, HEALTH_SECTIONS } from "./sections";
import type { CapturedResponse, InjectedApiResponse, SectionId } from "./types";

export function isSundhedUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.sundhed.dk" || parsed.hostname === "sundhed.dk";
  } catch {
    return false;
  }
}

export function matchSection(url: string): SectionId | undefined {
  if (!isSundhedUrl(url)) {
    return undefined;
  }

  const normalizedUrl = url.toLowerCase();
  const looksLikeApi =
    normalizedUrl.includes("/api/") ||
    normalizedUrl.includes("/app/") ||
    normalizedUrl.includes("labsvar");

  if (!looksLikeApi) {
    return undefined;
  }

  const section = HEALTH_SECTIONS.find(candidate =>
    candidate.matchers.some(matcher => normalizedUrl.includes(matcher.toLowerCase()))
  );

  return section?.id;
}

export function toCapturedResponse(payload: InjectedApiResponse): CapturedResponse | undefined {
  const sectionId = matchSection(payload.url);
  if (!sectionId) {
    return undefined;
  }

  const section = getSection(sectionId);
  const identity = `${sectionId}:${payload.method}:${payload.status}:${payload.url}:${payload.capturedAt}`;

  return {
    id: stableHash(identity),
    sectionId,
    sectionLabel: section?.label ?? "Ukendt",
    url: payload.url,
    method: payload.method,
    status: payload.status,
    source: payload.source,
    capturedAt: payload.capturedAt,
    body: payload.body
  };
}

function stableHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `cap_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}
