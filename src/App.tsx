import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Code2,
  Copy,
  CopyPlus,
  Download,
  Eye,
  Monitor,
  MousePointer2,
  Move,
  Redo2,
  RefreshCcw,
  Smartphone,
  Tablet,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cleanEditorHtml, prepareEditableHtml, SAMPLE_HTML } from "./htmlDocument";

type EditorMode = "text" | "select" | "move" | "preview";
type Viewport = "desktop" | "tablet" | "mobile";

type SelectedElement = {
  id: string;
  tagName: string;
  text: string;
  childElementCount: number;
  styles: {
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontWeight: string;
    textAlign: string;
    padding: string;
    margin: string;
    width: string;
    height: string;
    borderRadius: string;
  };
};

type HistoryState = {
  stack: string[];
  index: number;
};

const viewportLabels: Record<Viewport, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

const modeButtons: Array<{ mode: EditorMode; label: string; icon: typeof Type }> = [
  { mode: "text", label: "Text", icon: Type },
  { mode: "select", label: "Select", icon: MousePointer2 },
  { mode: "move", label: "Move", icon: Move },
  { mode: "preview", label: "Preview", icon: Eye },
];

const viewportButtons: Array<{ viewport: Viewport; icon: typeof Monitor }> = [
  { viewport: "desktop", icon: Monitor },
  { viewport: "tablet", icon: Tablet },
  { viewport: "mobile", icon: Smartphone },
];

const alignButtons = [
  { label: "Left", value: "left", icon: AlignLeft },
  { label: "Center", value: "center", icon: AlignCenter },
  { label: "Right", value: "right", icon: AlignRight },
];

function fileNameFromDate() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `edited-html-${stamp}.html`;
}

function numberFromCss(value: string, fallback = "") {
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? match[0] : fallback;
}

function fallbackColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export default function App() {
  const initialHtml = useMemo(() => cleanEditorHtml(SAMPLE_HTML), []);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const historyRef = useRef<HistoryState>({ stack: [initialHtml], index: 0 });
  const pendingHistoryTimer = useRef<number>();
  const [sourceHtml, setSourceHtml] = useState(initialHtml);
  const [frameHtml, setFrameHtml] = useState(() => prepareEditableHtml(initialHtml));
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [mode, setMode] = useState<EditorMode>("text");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [historyState, setHistoryState] = useState<HistoryState>(historyRef.current);
  const [clipboardState, setClipboardState] = useState("Copy");

  const canUndo = historyState.index > 0;
  const canRedo = historyState.index < historyState.stack.length - 1;

  function syncHistoryState(next: HistoryState) {
    historyRef.current = next;
    setHistoryState(next);
  }

  function pushHistory(html: string) {
    const current = historyRef.current;
    if (current.stack[current.index] === html) return;
    const nextStack = current.stack.slice(0, current.index + 1).concat(html).slice(-80);
    const next: HistoryState = {
      stack: nextStack,
      index: nextStack.length - 1,
    };
    syncHistoryState(next);
  }

  function scheduleHistory(html: string) {
    if (pendingHistoryTimer.current) window.clearTimeout(pendingHistoryTimer.current);
    pendingHistoryTimer.current = window.setTimeout(() => pushHistory(html), 450);
  }

  function loadHtml(html: string, addToHistory = true) {
    const clean = cleanEditorHtml(html);
    setSourceHtml(clean);
    setFrameHtml(prepareEditableHtml(clean));
    setSelected(null);
    if (addToHistory) pushHistory(clean);
  }

  function postCommand(command: string, payload: Record<string, unknown> = {}) {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "wysiwyg-command",
        command,
        ...payload,
      },
      "*",
    );
  }

  function setEditorMode(nextMode: EditorMode) {
    setMode(nextMode);
    postCommand("set-mode", { mode: nextMode });
  }

  function updateSelectedStyle(styles: Record<string, string>) {
    postCommand("apply-style", { styles });
  }

  function updateSelectedText(text: string) {
    setSelected((current) => (current ? { ...current, text } : current));
    postCommand("set-text", { text });
  }

  function stepHistory(offset: number) {
    const current = historyRef.current;
    const nextIndex = current.index + offset;
    if (nextIndex < 0 || nextIndex >= current.stack.length) return;
    const html = current.stack[nextIndex];
    syncHistoryState({ stack: current.stack, index: nextIndex });
    setSourceHtml(html);
    setFrameHtml(prepareEditableHtml(html));
    setSelected(null);
  }

  async function copyHtml() {
    const clean = cleanEditorHtml(sourceHtml);
    await navigator.clipboard.writeText(clean);
    setClipboardState("Copied");
    window.setTimeout(() => setClipboardState("Copy"), 1300);
  }

  function downloadHtml() {
    const clean = cleanEditorHtml(sourceHtml);
    const blob = new Blob([clean], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileNameFromDate();
    anchor.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data || {};
      if (data.type === "wysiwyg-ready") {
        postCommand("set-mode", { mode });
      }

      if (data.type === "wysiwyg-selection") {
        setSelected(data.selected);
      }

      if (data.type === "wysiwyg-document-change" && typeof data.html === "string") {
        const clean = cleanEditorHtml(data.html);
        setSourceHtml(clean);
        scheduleHistory(clean);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (pendingHistoryTimer.current) window.clearTimeout(pendingHistoryTimer.current);
    };
  }, [mode]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Code2 size={22} aria-hidden="true" />
          </div>
          <div>
            <h1>WYSIWYG HTML Editor</h1>
            <p>Paste, touch up, export.</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="button secondary" type="button" onClick={() => loadHtml(sourceHtml)}>
            <RefreshCcw size={17} aria-hidden="true" />
            Apply source
          </button>
          <button className="button" type="button" onClick={copyHtml}>
            <Copy size={17} aria-hidden="true" />
            {clipboardState}
          </button>
          <button className="button primary" type="button" onClick={downloadHtml}>
            <Download size={17} aria-hidden="true" />
            Download
          </button>
        </div>
      </header>

      <section className="toolbar" aria-label="Editor toolbar">
        <div className="segmented" aria-label="Edit mode">
          {modeButtons.map(({ mode: buttonMode, label, icon: Icon }) => (
            <button
              aria-pressed={mode === buttonMode}
              className={mode === buttonMode ? "is-active" : ""}
              key={buttonMode}
              onClick={() => setEditorMode(buttonMode)}
              title={`${label} mode`}
              type="button"
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="toolbar-spacer" />

        <div className="icon-group" aria-label="History">
          <button disabled={!canUndo} onClick={() => stepHistory(-1)} title="Undo" type="button">
            <Undo2 size={17} aria-hidden="true" />
          </button>
          <button disabled={!canRedo} onClick={() => stepHistory(1)} title="Redo" type="button">
            <Redo2 size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="icon-group" aria-label="Viewport">
          {viewportButtons.map(({ viewport: buttonViewport, icon: Icon }) => (
            <button
              aria-label={viewportLabels[buttonViewport]}
              aria-pressed={viewport === buttonViewport}
              className={viewport === buttonViewport ? "is-active" : ""}
              key={buttonViewport}
              onClick={() => setViewport(buttonViewport)}
              title={viewportLabels[buttonViewport]}
              type="button"
            >
              <Icon size={17} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section className="workspace">
        <aside className="source-pane" aria-label="HTML source">
          <div className="pane-title">
            <span>HTML source</span>
            <span>{sourceHtml.length.toLocaleString()} chars</span>
          </div>
          <textarea
            aria-label="HTML source editor"
            spellCheck={false}
            value={sourceHtml}
            onChange={(event) => setSourceHtml(event.target.value)}
          />
        </aside>

        <section className="preview-pane" aria-label="Rendered HTML">
          <div className="pane-title">
            <span>Rendered page</span>
            <span>{viewportLabels[viewport]}</span>
          </div>
          <div className={`preview-frame preview-frame-${viewport}`}>
            <iframe
              ref={iframeRef}
              sandbox="allow-scripts allow-same-origin allow-downloads"
              srcDoc={frameHtml}
              title="Editable HTML preview"
            />
          </div>
        </section>

        <aside className="inspector" aria-label="Element inspector">
          <div className="pane-title">
            <span>Inspector</span>
            <span>{selected ? selected.tagName : "None"}</span>
          </div>

          {selected ? (
            <div className="inspector-body">
              <label>
                Text
                <textarea
                  className="text-control"
                  value={selected.text}
                  onChange={(event) => updateSelectedText(event.target.value)}
                />
              </label>

              <div className="field-grid">
                <label>
                  Text color
                  <input
                    type="color"
                    value={fallbackColor(selected.styles.color, "#1f2933")}
                    onChange={(event) => updateSelectedStyle({ color: event.target.value })}
                  />
                </label>
                <label>
                  Fill
                  <input
                    type="color"
                    value={fallbackColor(selected.styles.backgroundColor, "#ffffff")}
                    onChange={(event) => updateSelectedStyle({ backgroundColor: event.target.value })}
                  />
                </label>
                <label>
                  Font size
                  <input
                    min="8"
                    max="180"
                    type="number"
                    value={numberFromCss(selected.styles.fontSize, "16")}
                    onChange={(event) => updateSelectedStyle({ fontSize: `${event.target.value}px` })}
                  />
                </label>
                <label>
                  Radius
                  <input
                    min="0"
                    max="80"
                    type="number"
                    value={numberFromCss(selected.styles.borderRadius, "0")}
                    onChange={(event) => updateSelectedStyle({ borderRadius: `${event.target.value}px` })}
                  />
                </label>
              </div>

              <div className="align-row" aria-label="Text alignment">
                {alignButtons.map(({ label, value, icon: Icon }) => (
                  <button
                    aria-label={label}
                    aria-pressed={selected.styles.textAlign === value}
                    className={selected.styles.textAlign === value ? "is-active" : ""}
                    key={value}
                    onClick={() => updateSelectedStyle({ textAlign: value })}
                    title={label}
                    type="button"
                  >
                    <Icon size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>

              <div className="field-stack">
                <label>
                  Padding
                  <input
                    value={selected.styles.padding}
                    onChange={(event) => updateSelectedStyle({ padding: event.target.value })}
                  />
                </label>
                <label>
                  Margin
                  <input
                    value={selected.styles.margin}
                    onChange={(event) => updateSelectedStyle({ margin: event.target.value })}
                  />
                </label>
                <label>
                  Width
                  <input
                    value={selected.styles.width}
                    onChange={(event) => updateSelectedStyle({ width: event.target.value })}
                  />
                </label>
                <label>
                  Height
                  <input
                    value={selected.styles.height}
                    onChange={(event) => updateSelectedStyle({ height: event.target.value })}
                  />
                </label>
              </div>

              <div className="nudge-grid" aria-label="Move controls">
                <button type="button" onClick={() => postCommand("nudge", { dx: 0, dy: -8 })}>
                  Up
                </button>
                <button type="button" onClick={() => postCommand("nudge", { dx: -8, dy: 0 })}>
                  Left
                </button>
                <button type="button" onClick={() => postCommand("nudge", { dx: 8, dy: 0 })}>
                  Right
                </button>
                <button type="button" onClick={() => postCommand("nudge", { dx: 0, dy: 8 })}>
                  Down
                </button>
              </div>

              <div className="inspector-actions">
                <button type="button" onClick={() => postCommand("duplicate")}>
                  <CopyPlus size={16} aria-hidden="true" />
                  Duplicate
                </button>
                <button className="danger" type="button" onClick={() => postCommand("delete")}>
                  <Trash2 size={16} aria-hidden="true" />
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <MousePointer2 size={28} aria-hidden="true" />
              <span>No element selected</span>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
