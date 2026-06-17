import type { CaptureStatus, CapturedResponse, InjectedApiResponse, SectionId } from "./shared/types";

const SECTION_MATCHERS: Array<{ id: Exclude<SectionId, "ukendt">; label: string; matchers: string[] }> = [
  { id: "medicin", label: "Medicin", matchers: ["medicinkort2borger"] },
  { id: "proevesvar", label: "Prøvesvar", matchers: ["labsvar"] },
  { id: "journaler", label: "Journaler", matchers: ["ejournal"] },
  { id: "vaccinationer", label: "Vaccinationer", matchers: ["vaccination"] },
  { id: "aftaler", label: "Aftaler", matchers: ["aftaler"] },
  { id: "henvisninger", label: "Henvisninger", matchers: ["henvisning", "envisning"] },
  { id: "egen-laege", label: "Egen læge", matchers: ["organisation"] },
  { id: "roentgen", label: "Røntgen", matchers: ["billedbeskrivelser"] },
  { id: "diagnoser", label: "Diagnoser", matchers: ["diagnoser"] },
  { id: "hjemmemaalinger", label: "Hjemmemålinger", matchers: ["maalinger"] },
  { id: "forloebsplaner", label: "Forløbsplaner", matchers: ["planer"] }
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
  const normalizedUrl = payload.url.toLowerCase();
  const section = SECTION_MATCHERS.find(candidate =>
    candidate.matchers.some(matcher => normalizedUrl.includes(matcher.toLowerCase()))
  );

  if (!section || !looksLikeSundhedApi(payload.url)) {
    return undefined;
  }

  return {
    id: `cap_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`,
    sectionId: section.id,
    sectionLabel: section.label,
    url: payload.url,
    method: payload.method.toUpperCase(),
    status: payload.status,
    source: payload.source,
    capturedAt: payload.capturedAt,
    body: payload.body
  };
}

function looksLikeSundhedApi(url: string) {
  try {
    const parsed = new URL(url);
    const isSundhed = parsed.hostname === "www.sundhed.dk";
    return isSundhed && (parsed.pathname.includes("/api/") || parsed.pathname.includes("/app/"));
  } catch {
    return false;
  }
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
