import {
  CheckCircledIcon,
  Cross2Icon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeClosedIcon,
  FileTextIcon,
  LockClosedIcon,
  PlayIcon,
  ReloadIcon,
  StopIcon,
  TrashIcon
} from "@radix-ui/react-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { archiveFilename, buildArchiveBlob } from "../shared/exportArchive";
import { HEALTH_SECTIONS } from "../shared/sections";
import { sendRuntimeMessage } from "../shared/messages";
import type { ActivityItem, CapturedResponse, CaptureState, SectionProgress } from "../shared/types";

type PanelState = CaptureState & {
  progress: SectionProgress[];
};

type AutoRunState = {
  currentIndex: number;
  total: number;
  label: string;
  stopping: boolean;
};

const emptyState: PanelState = {
  status: "idle",
  responses: [],
  activity: [],
  progress: HEALTH_SECTIONS.map(section => ({
    sectionId: section.id,
    label: section.label,
    path: section.path,
    count: 0,
    apiResponseCount: 0,
    recordCount: 0,
    recordLabel: "API-responses",
    status: "not-started",
    detail: "Ikke gennemgået endnu"
  }))
};

const LOGIN_URL = "https://www.sundhed.dk/borger/min-side/";

export function SidePanel() {
  const [state, setState] = useState<PanelState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [consented, setConsented] = useState(false);
  const [autoRun, setAutoRun] = useState<AutoRunState | undefined>();
  const autoRunAbortRef = useRef(false);

  useEffect(() => {
    void chrome.storage.local.get("consented").then(value => {
      setConsented(Boolean(value.consented));
    });
  }, []);

  useEffect(() => {
    void refreshState();

    const listener = (message: { type?: string; payload?: PanelState }) => {
      if (message.type === "STATE_UPDATED" && message.payload) {
        setState(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const foundSections = useMemo(() => state.progress.filter(section => isSectionUseful(section)), [state.progress]);
  const isCapturing = state.status === "capturing";
  const isAutoRunning = Boolean(autoRun);
  const onSundhed = state.activeTabUrl?.includes("sundhed.dk") ?? false;
  const loginLikelyDone = onSundhed && (getResponseCount(state) > 0 || state.activeTabUrl?.includes("/borger/min-side"));

  async function refreshState() {
    setLoading(true);
    const response = await sendRuntimeMessage<PanelState>({ type: "GET_STATE" });
    if (response.ok && response.data) {
      setState(response.data);
      setError(undefined);
    } else {
      setError(response.error ?? "Panelet kunne ikke hente status.");
    }
    setLoading(false);
  }

  async function runAction(name: string, action: () => Promise<void>) {
    setBusyAction(name);
    setError(undefined);
    try {
      await action();
      await refreshState();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Handlingen kunne ikke udføres.");
    } finally {
      setBusyAction(undefined);
    }
  }

  async function acceptConsent() {
    await chrome.storage.local.set({ consented: true });
    setConsented(true);
  }

  async function openLogin() {
    await sendRuntimeMessage({ type: "OPEN_SECTION", url: LOGIN_URL });
  }

  async function openGuidedSection(section: SectionProgress) {
    if (!isCapturing) {
      await sendRuntimeMessage({ type: "START_CAPTURE" });
    }
    await sendRuntimeMessage({ type: "OPEN_SECTION", url: section.path });
  }

  async function runAutomaticTour() {
    autoRunAbortRef.current = false;
    if (!isCapturing) {
      await sendRuntimeMessage({ type: "START_CAPTURE" });
    }

    const sections = state.progress.length > 0 ? state.progress : emptyState.progress;
    for (let index = 0; index < sections.length; index += 1) {
      if (autoRunAbortRef.current) {
        break;
      }

      const section = sections[index];
      setAutoRun({ currentIndex: index + 1, total: sections.length, label: section.label, stopping: false });
      await sendRuntimeMessage({ type: "OPEN_SECTION", url: section.path });
      await wait(getAutoRunWaitMs(section.sectionId));
      await refreshState();
    }

    setAutoRun(undefined);
  }

  function stopAutomaticTour() {
    autoRunAbortRef.current = true;
    setAutoRun(current => (current ? { ...current, stopping: true } : undefined));
  }

  return (
    <main className="panel-shell">
      <header className="panel-header">
        <div className="brand-mark" aria-hidden="true">
          <img src="icons/icon.svg" alt="" />
        </div>
        <div>
          <h1>Sundhedsarkiv</h1>
          <p>Lokal eksport fra sundhed.dk</p>
        </div>
      </header>

      {!consented ? (
        <ConsentGate onAccept={() => void acceptConsent()} />
      ) : (
        <>
          <section className="status-band" data-state={isCapturing ? "active" : "idle"}>
            <div>
              <span className="eyebrow">Status</span>
              <strong>{isCapturing ? "Opsamler data" : getResponseCount(state) > 0 ? "Data klar til eksport" : "Klar til login"}</strong>
              <p>
                {isCapturing
                  ? "Åbn en sektion nedenfor, og vent på at data-tallet opdateres."
                  : getResponseCount(state) > 0
                    ? `${foundSections.length} sektioner har brugbare data.`
                    : "Start med at logge ind på sundhed.dk."}
              </p>
            </div>
            <div className="live-indicator" aria-hidden="true" />
          </section>

          {error ? (
            <div className="inline-error" role="alert">
              <Cross2Icon />
              <span>{error}</span>
            </div>
          ) : null}

          <section className="section-block">
            <div className="section-heading">
              <span className="eyebrow">Trin 1</span>
              <span>{loginLikelyDone ? "Login registreret" : "Login"}</span>
            </div>
            <div className="login-step">
              <div>
                <strong>Log ind på sundhed.dk</strong>
                <p>Vi sender dig til Min side. Du logger selv ind med MitID, og bagefter kan data-runden køres trin for trin.</p>
              </div>
              <button
                className="button button-primary"
                disabled={busyAction === "login"}
                onClick={() => void runAction("login", openLogin)}
              >
                <ExternalLinkIcon />
                Log ind
              </button>
            </div>
          </section>

          <section className="primary-actions">
            {isCapturing ? (
              <button
                className="button button-secondary"
                disabled={busyAction === "stop"}
                onClick={() => void runAction("stop", async () => {
                  await sendRuntimeMessage({ type: "STOP_CAPTURE" });
                })}
              >
                <StopIcon />
                Stop opsamling
              </button>
            ) : (
              <button
                className="button button-primary"
                disabled={busyAction === "start"}
                onClick={() => void runAction("start", async () => {
                  await sendRuntimeMessage({ type: "START_CAPTURE" });
                })}
              >
                <PlayIcon />
                Start opsamling
              </button>
            )}

            <button className="icon-button" title="Opdater status" onClick={() => void refreshState()}>
              <ReloadIcon />
            </button>
          </section>

          {!onSundhed && getResponseCount(state) === 0 ? <NotOnSundhed /> : null}

          <section className="section-block">
            <div className="section-heading">
              <span className="eyebrow">Trin 2</span>
              <span>{foundSections.length} af {state.progress.length}</span>
            </div>
            <div className="automation-panel" data-running={isAutoRunning ? "true" : "false"}>
              <div>
                <strong>{autoRun ? `${autoRun.label}` : "Kør data-runde"}</strong>
                <p>
                  {autoRun
                    ? `${autoRun.currentIndex} af ${autoRun.total}. ${autoRun.stopping ? "Stopper efter den aktuelle side." : "Venter på at siden indlæser data."}`
                    : "Åbner hver sektion i rækkefølge og opsamler data automatisk, når sundhed.dk svarer."}
                </p>
              </div>
              {autoRun ? (
                <button className="button button-secondary" onClick={stopAutomaticTour}>
                  <StopIcon />
                  Stop
                </button>
              ) : (
                <button
                  className="button button-primary"
                  disabled={Boolean(busyAction)}
                  onClick={() => void runAction("auto-tour", runAutomaticTour)}
                >
                  <PlayIcon />
                  Kør alle
                </button>
              )}
            </div>
            {loading ? (
              <SkeletonList />
            ) : (
              <ProgressList
                progress={state.progress}
                busyAction={busyAction}
                onOpen={section => void runAction(`open-${section.sectionId}`, async () => openGuidedSection(section))}
              />
            )}
          </section>

          <section className="section-block">
            <div className="section-heading">
              <span className="eyebrow">Seneste aktivitet</span>
            </div>
            <ActivityList activity={state.activity} />
          </section>

          <section className="export-panel">
            <div>
              <span className="eyebrow">Eksport</span>
              <h2>Samlet arkiv</h2>
              <p>{exportReadinessText(state.progress)}</p>
            </div>
            <button
              className="button button-primary"
              disabled={getResponseCount(state) === 0 || busyAction === "download"}
              onClick={() => void runAction("download", async () => {
                await downloadArchive(state);
              })}
            >
              <DownloadIcon />
              Download arkiv
            </button>
            <button
              className="button button-ghost"
              disabled={getResponseCount(state) === 0 || busyAction === "clear"}
              onClick={() => void runAction("clear", async () => {
                await sendRuntimeMessage({ type: "CLEAR_CAPTURE" });
              })}
            >
              <TrashIcon />
              Ryd opsamlede data
            </button>
          </section>
        </>
      )}

      <footer className="panel-footer">
        <LockClosedIcon />
        <span>Data gemmes midlertidigt i Chrome, ryddes efter inaktivitet og sendes ikke til en server.</span>
      </footer>
    </main>
  );
}

async function downloadArchive(state: PanelState) {
  const response = await sendRuntimeMessage<CapturedResponse[]>({ type: "GET_CAPTURED_RESPONSES" });
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "Eksporten kunne ikke hentes.");
  }
  if (response.data.length === 0) {
    throw new Error("Der er ingen opsamlede data at eksportere.");
  }

  const blob = await buildArchiveBlob({ ...state, responses: response.data, responseCount: response.data.length });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: archiveFilename(),
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function getResponseCount(state: PanelState) {
  return state.responseCount ?? state.responses.length;
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getAutoRunWaitMs(sectionId: SectionProgress["sectionId"]) {
  if (sectionId === "journaler") {
    return 8_000;
  }
  if (sectionId === "proevesvar" || sectionId === "roentgen") {
    return 6_000;
  }
  return 4_000;
}

function ConsentGate({ onAccept }: { onAccept: () => void }) {
  return (
    <section className="consent-gate">
      <div className="large-icon" aria-hidden="true">
        <EyeClosedIcon />
      </div>
      <h2>Du styrer eksporten</h2>
      <p>
        Extensionen kan læse JSON-svar fra sundhed.dk, mens du selv er logget ind og navigerer.
        Den automatiserer ikke MitID, sender ikke data væk fra browseren og rydder midlertidig opsamling efter inaktivitet.
      </p>
      <button className="button button-primary" onClick={onAccept}>
        <CheckCircledIcon />
        Jeg forstår
      </button>
    </section>
  );
}

function NotOnSundhed() {
  return (
    <section className="empty-state">
      <FileTextIcon />
      <div>
        <strong>Åbn sundhed.dk for at begynde</strong>
        <p>Brug login-knappen, log ind med MitID, og fortsæt derefter med data-runden.</p>
      </div>
    </section>
  );
}

function ProgressList({
  progress,
  busyAction,
  onOpen
}: {
  progress: SectionProgress[];
  busyAction?: string;
  onOpen: (section: SectionProgress) => void;
}) {
  return (
    <div className="progress-list">
      {progress.map(section => (
        <div className="guided-row" key={section.sectionId} data-status={section.status}>
          <div className="progress-dot" data-found={isSectionUseful(section)} />
          <div className="guided-copy">
            <div className="guided-title">
              <span>{section.label}</span>
              <strong>{statusLabel(section)}</strong>
            </div>
            <p>{section.detail}</p>
            {section.actionHint ? <small>{section.actionHint}</small> : null}
          </div>
          <button className="icon-button" title={`Saml ${section.label}`} disabled={Boolean(busyAction)} onClick={() => onOpen(section)}>
            <ExternalLinkIcon />
          </button>
        </div>
      ))}
    </div>
  );
}

function ActivityList({ activity }: { activity: ActivityItem[] }) {
  if (activity.length === 0) {
    return <p className="muted">Ingen aktivitet endnu.</p>;
  }

  return (
    <div className="activity-list">
      {activity.slice(0, 5).map(item => (
        <div className="activity-row" key={item.id}>
          <time>{formatTime(item.at)}</time>
          <div>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="skeleton-list" aria-label="Indlæser status">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="skeleton-row" key={index} />
      ))}
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function isSectionUseful(section: SectionProgress) {
  return section.status === "data-found" || section.status === "raw-only";
}

function statusLabel(section: SectionProgress) {
  if (section.status === "data-found") {
    return `${section.recordCount} ${section.recordLabel}`;
  }
  if (section.status === "raw-only") {
    return "Rå JSON";
  }
  if (section.status === "needs-action") {
    return "Kræver handling";
  }
  if (section.status === "opened") {
    return "Åbnet";
  }
  return "Ikke startet";
}

function exportReadinessText(progress: SectionProgress[]) {
  const structured = progress.filter(section => section.status === "data-found").length;
  const rawOnly = progress.filter(section => section.status === "raw-only").length;
  const needsAction = progress.filter(section => section.status === "needs-action" || section.status === "opened").length;

  if (structured + rawOnly + needsAction === 0) {
    return "ZIP med rå JSON, Markdown og CSV bliver klar, når du har gennemgået mindst én sektion.";
  }

  return `${structured} sektioner med struktureret data, ${rawOnly} med rå JSON og ${needsAction} der kræver mere handling.`;
}
