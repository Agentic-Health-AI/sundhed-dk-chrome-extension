import {
  ArchiveIcon,
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
import { useEffect, useMemo, useState } from "react";
import { HEALTH_SECTIONS } from "../shared/sections";
import { sendRuntimeMessage } from "../shared/messages";
import type { ActivityItem, CaptureState, SectionProgress } from "../shared/types";

type PanelState = CaptureState & {
  progress: SectionProgress[];
};

const emptyState: PanelState = {
  status: "idle",
  responses: [],
  activity: [],
  progress: HEALTH_SECTIONS.map(section => ({
    sectionId: section.id,
    label: section.label,
    path: section.path,
    count: 0
  }))
};

export function SidePanel() {
  const [state, setState] = useState<PanelState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [consented, setConsented] = useState(false);

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

  const foundSections = useMemo(() => state.progress.filter(section => section.count > 0), [state.progress]);
  const isCapturing = state.status === "capturing";
  const onSundhed = state.activeTabUrl?.includes("sundhed.dk") ?? false;

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

  return (
    <main className="panel-shell">
      <header className="panel-header">
        <div className="brand-mark" aria-hidden="true">
          <ArchiveIcon />
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
              <strong>{isCapturing ? "Opsamler data" : state.responses.length > 0 ? "Eksport klar" : "Klar"}</strong>
              <p>
                {isCapturing
                  ? "Besøg de sundhed.dk-sider, du vil have med."
                  : state.responses.length > 0
                    ? `${state.responses.length} responses ligger klar.`
                    : "Start opsamling og naviger selv på sundhed.dk."}
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

          {!onSundhed && state.responses.length === 0 ? <NotOnSundhed /> : null}

          <section className="section-block">
            <div className="section-heading">
              <span className="eyebrow">Data fundet</span>
              <span>{foundSections.length} af {state.progress.length}</span>
            </div>
            {loading ? <SkeletonList /> : <ProgressList progress={state.progress} />}
          </section>

          <section className="section-block">
            <div className="section-heading">
              <span className="eyebrow">Foreslåede sider</span>
            </div>
            <div className="quick-links">
              {HEALTH_SECTIONS.slice(0, 6).map(section => (
                <button
                  key={section.id}
                  className="link-row"
                  onClick={() => void runAction(`open-${section.id}`, async () => {
                    await sendRuntimeMessage({ type: "OPEN_SECTION", url: section.path });
                  })}
                >
                  <span>{section.label}</span>
                  <ExternalLinkIcon />
                </button>
              ))}
            </div>
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
              <p>ZIP med rå JSON, Markdown og CSV for understøttede sektioner.</p>
            </div>
            <button
              className="button button-primary"
              disabled={state.responses.length === 0 || busyAction === "download"}
              onClick={() => void runAction("download", async () => {
                await sendRuntimeMessage({ type: "DOWNLOAD_ARCHIVE" });
              })}
            >
              <DownloadIcon />
              Download arkiv
            </button>
            <button
              className="button button-ghost"
              disabled={state.responses.length === 0 || busyAction === "clear"}
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
        <span>Data gemmes midlertidigt i Chrome og sendes ikke til en server.</span>
      </footer>
    </main>
  );
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
        Den automatiserer ikke MitID og sender ikke data væk fra browseren.
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
        <p>Log ind med MitID i fanen, start opsamling, og besøg de sider der skal med.</p>
      </div>
    </section>
  );
}

function ProgressList({ progress }: { progress: SectionProgress[] }) {
  return (
    <div className="progress-list">
      {progress.map(section => (
        <div className="progress-row" key={section.sectionId}>
          <div className="progress-dot" data-found={section.count > 0} />
          <span>{section.label}</span>
          <strong>{section.count > 0 ? `${section.count} svar` : "Mangler"}</strong>
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
