import { archiveFilename, buildArchiveDataUrl } from "./shared/exportArchive";
import { HEALTH_SECTIONS } from "./shared/sections";
import type { ActivityItem, CapturedResponse, CaptureState, RuntimeMessage, RuntimeResponse } from "./shared/types";

const STATE_KEY = "captureState";

const initialState: CaptureState = {
  status: "idle",
  responses: [],
  activity: []
};

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
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
    case "DOWNLOAD_ARCHIVE":
      return downloadArchive();
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
  const nextState: CaptureState = {
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
    detail: `${state.responses.length} responses ligger klar til eksport.`,
    at: new Date().toISOString()
  };
  const nextState: CaptureState = {
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
  await setState(initialState);
  return getStateWithProgress(initialState);
}

async function addCapturedResponse(response: CapturedResponse, tabId?: number) {
  const state = await getState();
  if (state.status !== "capturing") {
    return getStateWithProgress(state);
  }

  const duplicate = state.responses.some(existing => existing.url === response.url && sameBody(existing.body, response.body));
  const responses = duplicate ? state.responses : [...state.responses, response];
  const nextState: CaptureState = {
    ...state,
    activeTabId: tabId ?? state.activeTabId,
    updatedAt: new Date().toISOString(),
    responses,
    activity: duplicate
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
        ].slice(0, 24)
  };

  await setState(nextState);
  chrome.runtime.sendMessage({ type: "STATE_UPDATED", payload: await getStateWithProgress(nextState) }).catch(() => undefined);
  return getStateWithProgress(nextState);
}

async function downloadArchive() {
  const state = await getState();
  if (state.responses.length === 0) {
    throw new Error("Der er ingen opsamlede data at eksportere.");
  }

  const url = await buildArchiveDataUrl(state);
  const downloadId = await chrome.downloads.download({
    url,
    filename: archiveFilename(),
    saveAs: true
  });

  return { downloadId };
}

async function openSection(url: string) {
  const tab = await getActiveTab();
  if (tab?.id) {
    await chrome.tabs.update(tab.id, { url });
    return { tabId: tab.id };
  }

  const created = await chrome.tabs.create({ url });
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

async function getState(): Promise<CaptureState> {
  const stored = await chrome.storage.session.get(STATE_KEY);
  return (stored[STATE_KEY] as CaptureState | undefined) ?? initialState;
}

async function setState(state: CaptureState) {
  await chrome.storage.session.set({ [STATE_KEY]: state });
}

async function getStateWithProgress(state?: CaptureState) {
  const captureState = state ?? (await getState());
  return {
    ...captureState,
    progress: HEALTH_SECTIONS.map(section => {
      const sectionResponses = captureState.responses.filter(response => response.sectionId === section.id);
      return {
        sectionId: section.id,
        label: section.label,
        path: section.path,
        count: sectionResponses.length,
        lastCapturedAt: sectionResponses.at(-1)?.capturedAt
      };
    })
  };
}

function sameBody(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en ukendt fejl.";
}
