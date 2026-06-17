import type { CapturedResponse, CaptureStatus, InjectedApiResponse, SectionId } from "./shared/types";

type ContentSection = {
  id: Exclude<SectionId, "ukendt">;
  label: string;
  matchers: string[];
};

// Keep this file standalone. Chrome loads manifest content scripts as classic scripts,
// so importing shared modules can make dist/content.js unusable.
const CONTENT_SECTIONS: ContentSection[] = [
  { id: "medicin", label: "Medicin", matchers: ["medicinkort2borger"] },
  { id: "proevesvar", label: "Prøvesvar", matchers: ["labsvar", "proevesvarportal"] },
  { id: "journaler", label: "Journaler", matchers: ["ejournal", "ejournalportalborger", "ejournalportalsj"] },
  { id: "vaccinationer", label: "Vaccinationer", matchers: ["vaccination"] },
  { id: "aftaler", label: "Aftaler", matchers: ["aftaler", "aftalerborger"] },
  { id: "henvisninger", label: "Henvisninger", matchers: ["henvisning", "envisning", "dennationalehenvisningsformidling"] },
  { id: "egen-laege", label: "Egen læge", matchers: ["organisation", "organization", "minlaegeorganization", "eserviceslink"] },
  { id: "roentgen", label: "Røntgen", matchers: ["billedbeskrivelser", "billedbeskrivelserborger"] },
  { id: "diagnoser", label: "Diagnoser", matchers: ["diagnoser", "diagnoserborger"] },
  { id: "hjemmemaalinger", label: "Hjemmemålinger", matchers: ["maalinger", "hjemmemaalingborger", "hjemmemaalingerborger"] },
  { id: "forloebsplaner", label: "Forløbsplaner", matchers: ["planer", "planerportalborger"] }
];

let captureStatus: CaptureStatus = "idle";
let overlay: HTMLButtonElement | undefined;

void refreshCaptureStatus();

window.addEventListener("message", event => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }

  const data = event.data as { source?: string; type?: string; payload?: InjectedApiResponse };
  if (data.source !== "sundhedsarkiv:page-hook" || data.type !== "API_RESPONSE" || captureStatus !== "capturing") {
    return;
  }

  const captured = data.payload ? toCapturedResponse(data.payload) : undefined;
  if (!captured) {
    return;
  }

  chrome.runtime.sendMessage({ type: "CAPTURED_RESPONSE", payload: captured }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === "CAPTURE_STATUS") {
    captureStatus = message.status;
    renderOverlay();
  }
});

async function refreshCaptureStatus() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" }).catch(() => undefined);
  if (response?.ok && response.data?.status) {
    captureStatus = response.data.status;
  }
  renderOverlay();
}

function toCapturedResponse(payload: InjectedApiResponse): CapturedResponse | undefined {
  if (!looksLikeSundhedApi(payload.url)) {
    return undefined;
  }

  const section = matchSection(payload.url) ?? matchSectionFromBody(payload.body);
  const sectionId = section?.id ?? "ukendt";
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

function matchSection(url: string) {
  const normalizedUrl = url.toLowerCase();
  return CONTENT_SECTIONS.find(candidate =>
    candidate.matchers.some(matcher => normalizedUrl.includes(matcher.toLowerCase()))
  );
}

function matchSectionFromBody(body: unknown): ContentSection | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }

  if ("Svaroversigt" in body) {
    return CONTENT_SECTIONS.find(section => section.id === "proevesvar");
  }

  return undefined;
}

function looksLikeSundhedApi(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.sundhed.dk" && (parsed.pathname.includes("/api/") || parsed.pathname.includes("/app/"));
  } catch {
    return false;
  }
}

function stableHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `cap_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

function renderOverlay() {
  if (captureStatus !== "capturing") {
    overlay?.remove();
    overlay = undefined;
    return;
  }

  if (!document.documentElement || overlay) {
    return;
  }

  overlay = document.createElement("button");
  overlay.type = "button";
  overlay.textContent = "Sundhedsarkiv opsamler";
  overlay.setAttribute("aria-label", "Sundhedsarkiv opsamler data fra sundhed.dk");
  Object.assign(overlay.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    padding: "10px 12px",
    border: "1px solid rgba(47, 111, 94, 0.28)",
    borderRadius: "999px",
    background: "rgba(248, 250, 249, 0.94)",
    color: "#173b33",
    boxShadow: "0 12px 32px rgba(23, 59, 51, 0.16)",
    font: "500 12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    cursor: "pointer"
  });

  overlay.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }).catch(() => undefined);
  });

  document.documentElement.appendChild(overlay);
}
