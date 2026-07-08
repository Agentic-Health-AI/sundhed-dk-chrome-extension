import { addStoredResponse, clearStoredResponses, getStoredResponses } from "./shared/captureDb";
import { buildSectionProgress } from "./shared/sectionSummaries";
import { HEALTH_SECTIONS } from "./shared/sections";
import type { ActivityItem, CapturedResponse, CaptureState, RuntimeMessage, RuntimeResponse, SectionId } from "./shared/types";

const STATE_KEY = "captureState";
const MAX_ACTIVITY_ITEMS = 24;
const CAPTURE_EXPIRY_MS = 30 * 60 * 1000;

type StoredCaptureState = Omit<CaptureState, "responses"> & {
  responses?: never;
};

const initialState: StoredCaptureState = {
  status: "idle",
  responseCount: 0,
  activity: []
};

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  void getState();
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then(data => sendResponse({ ok: true, data } satisfies RuntimeResponse))
    .catch(error => sendResponse({ ok: false, error: getErrorMessage(error) } satisfies RuntimeResponse));

  return true;
});

async function handleMessage(message: RuntimeMessage, sender: chrome.runtime.MessageSender) {
  switch (message.type) {
    case "GET_STATE":
      return getStateWithProgress();
    case "START_CAPTURE":
      return startCapture(message.tabId);
    case "STOP_CAPTURE":
      return stopCapture();
    case "CLEAR_CAPTURE":
      return clearCapture();
    case "CAPTURED_RESPONSE":
      return addCapturedResponse(message.payload, sender.tab?.id);
    case "GET_CAPTURED_RESPONSES":
      return getStoredResponses();
    case "OPEN_SECTION":
      return openSection(message.url);
    default:
      throw new Error("Ukendt beskedtype.");
  }
}

async function startCapture(tabId?: number) {
  const activeTab = tabId ? await chrome.tabs.get(tabId) : await getActiveTab();
  const state = await getState();
  const activityItem: ActivityItem = {
    id: `act_${Date.now()}`,
    sectionId: "ukendt",
    label: "Opsamling startet",
    detail: "Besøg de sundhed.dk-sider, du vil eksportere.",
    at: new Date().toISOString()
  };
  const nextState: StoredCaptureState = {
    ...state,
    status: "capturing",
    activeTabId: activeTab?.id,
    activeTabUrl: activeTab?.url,
    startedAt: state.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activity: [activityItem, ...state.activity].slice(0, 20)
  };

  await setState(nextState);
  await notifyTab(activeTab?.id, nextState.status);
  return getStateWithProgress(nextState);
}

async function stopCapture() {
  const state = await getState();
  const activityItem: ActivityItem = {
    id: `act_${Date.now()}`,
    sectionId: "ukendt",
    label: "Opsamling stoppet",
    detail: `${state.responseCount ?? 0} responses ligger klar til eksport.`,
    at: new Date().toISOString()
  };
  const nextState: StoredCaptureState = {
    ...state,
    status: "idle",
    updatedAt: new Date().toISOString(),
    activity: [activityItem, ...state.activity].slice(0, 20)
  };

  await setState(nextState);
  await notifyTab(state.activeTabId, nextState.status);
  return getStateWithProgress(nextState);
}

async function clearCapture() {
  await clearStoredResponses();
  await setState(initialState);
  return getStateWithProgress(initialState);
}

async function addCapturedResponse(response: CapturedResponse, tabId?: number) {
  const state = await getState();
  if (state.status !== "capturing") {
    return getStateWithProgress(state);
  }

  if (!isValidCapturedResponse(response)) {
    throw new Error("Ugyldig response payload.");
  }

  const wasInserted = await addStoredResponse(response);
  const responses = await getStoredResponses();
  const nextState: CaptureState = {
    ...state,
    activeTabId: tabId ?? state.activeTabId,
    updatedAt: new Date().toISOString(),
    responseCount: responses.length,
    responses,
    activity: !wasInserted
      ? state.activity
      : [
          {
            id: `act_${Date.now()}_${response.sectionId}`,
            sectionId: response.sectionId,
            label: `${response.sectionLabel} fundet`,
            detail: `${response.method} ${response.status}`,
            at: response.capturedAt
          },
          ...state.activity
        ].slice(0, MAX_ACTIVITY_ITEMS)
  };

  await setState(nextState);
  chrome.runtime.sendMessage({ type: "STATE_UPDATED", payload: await getStateWithProgress(nextState) }).catch(() => undefined);
  return getStateWithProgress(nextState);
}

async function openSection(url: string) {
  if (!url.startsWith("https://www.sundhed.dk/")) {
    throw new Error("Kun sundhed.dk-sider kan åbnes fra panelet.");
  }

  const state = await getState();
  const openedSectionIds = addOpenedSectionId(state.openedSectionIds, url);
  const tab = await getActiveTab();
  if (tab?.id) {
    await chrome.tabs.update(tab.id, { url });
    await setState({ ...state, activeTabId: tab.id, activeTabUrl: url, openedSectionIds, updatedAt: new Date().toISOString() });
    return { tabId: tab.id };
  }

  const created = await chrome.tabs.create({ url });
  await setState({ ...state, activeTabId: created.id, activeTabUrl: url, openedSectionIds, updatedAt: new Date().toISOString() });
  return { tabId: created.id };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function notifyTab(tabId: number | undefined, status: CaptureState["status"]) {
  if (!tabId) {
    return;
  }

  await chrome.tabs.sendMessage(tabId, { type: "CAPTURE_STATUS", status }).catch(() => undefined);
}

async function getState(): Promise<StoredCaptureState> {
  const stored = await chrome.storage.session.get(STATE_KEY);
  const state = (stored[STATE_KEY] as StoredCaptureState | undefined) ?? initialState;
  if (isExpired(state)) {
    await clearStoredResponses();
    await chrome.storage.session.set({ [STATE_KEY]: initialState });
    return initialState;
  }

  return state;
}

async function setState(state: StoredCaptureState | CaptureState) {
  const { responses: _responses, ...storedState } = state;
  await chrome.storage.session.set({ [STATE_KEY]: storedState });
}

async function getStateWithProgress(state?: StoredCaptureState | CaptureState) {
  const storedState = state ?? (await getState());
  const responses = "responses" in storedState && Array.isArray(storedState.responses) ? storedState.responses : await getStoredResponses();
  const captureState: CaptureState = {
    ...storedState,
    responseCount: responses.length,
    responses: []
  };
  return {
    ...captureState,
    progress: HEALTH_SECTIONS.map(section => buildSectionProgress(section, responses, storedState.openedSectionIds ?? []))
  };
}

function addOpenedSectionId(existing: SectionId[] | undefined, url: string) {
  const sectionId = HEALTH_SECTIONS.find(section => section.path === url)?.id;
  if (!sectionId) {
    return existing;
  }
  return Array.from(new Set([...(existing ?? []), sectionId]));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en ukendt fejl.";
}

function isValidCapturedResponse(response: CapturedResponse) {
  if (!response || typeof response !== "object") {
    return false;
  }

  if (response.sectionId !== "ukendt" && !HEALTH_SECTIONS.some(section => section.id === response.sectionId)) {
    return false;
  }

  if (typeof response.method !== "string" || !/^[A-Z]+$/.test(response.method)) {
    return false;
  }

  if (typeof response.status !== "number" || response.status < 100 || response.status > 599) {
    return false;
  }

  if (typeof response.capturedAt !== "string" || Number.isNaN(new Date(response.capturedAt).getTime())) {
    return false;
  }

  if (!response.url.startsWith("https://www.sundhed.dk/")) {
    return false;
  }

  let encodedSize = 0;
  try {
    encodedSize = new Blob([JSON.stringify(response.body)]).size;
  } catch {
    return false;
  }
  return encodedSize < 5_000_000;
}

function isExpired(state: StoredCaptureState) {
  const timestamp = state.updatedAt ?? state.startedAt;
  if (!timestamp) {
    return false;
  }

  return Date.now() - new Date(timestamp).getTime() > CAPTURE_EXPIRY_MS;
}
