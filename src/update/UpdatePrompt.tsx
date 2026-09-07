import { useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isDesktopRuntime } from "../project/runtime";

type UpdateState =
  | { kind: "checking" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; update: Update; progress?: number }
  | { kind: "error"; message: string }
  | { kind: "hidden" };

function readableError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "No se pudo consultar GitHub Releases.";
}

export default function UpdatePrompt() {
  const [state, setState] = useState<UpdateState>(
    isDesktopRuntime() ? { kind: "checking" } : { kind: "hidden" },
  );
  const mounted = useRef(true);
  const checkSequence = useRef(0);
  const activeUpdate = useRef<Update | null>(null);

  const runCheck = async () => {
    const sequence = ++checkSequence.current;
    setState({ kind: "checking" });
    try {
      const update = await check({ timeout: 10_000 });
      if (!mounted.current || sequence !== checkSequence.current) {
        await update?.close();
        return;
      }
      activeUpdate.current = update;
      setState(update ? { kind: "available", update } : { kind: "hidden" });
    } catch (error) {
      if (mounted.current) setState({ kind: "error", message: readableError(error) });
    }
  };

  useEffect(() => {
    mounted.current = true;
    if (isDesktopRuntime()) void runCheck();
    return () => {
      mounted.current = false;
      checkSequence.current += 1;
      void activeUpdate.current?.close();
      activeUpdate.current = null;
    };
  }, []);

  if (state.kind === "hidden") return null;

  if (state.kind === "checking") {
    return <div className="home-update-status">Comprobando actualizaciones…</div>;
  }

  if (state.kind === "error") {
    return (
      <div className="home-update-status home-update-status--error" role="status">
        <span>{state.message}</span>
        <button type="button" onClick={() => void runCheck()}>Reintentar</button>
        <button type="button" onClick={() => setState({ kind: "hidden" })}>Más tarde</button>
      </div>
    );
  }

  const install = async () => {
    const update = state.update;
    setState({ kind: "installing", update });
    let downloaded = 0;
    let total: number | undefined;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        if (mounted.current) {
          setState({
            kind: "installing",
            update,
            progress: total ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined,
          });
        }
      });
    } catch (error) {
      if (mounted.current) setState({ kind: "error", message: readableError(error) });
    }
  };

  const dismiss = () => {
    void state.update.close();
    activeUpdate.current = null;
    setState({ kind: "hidden" });
  };

  if (state.kind === "installing") {
    return (
      <div className="home-modal" role="dialog" aria-modal="true" aria-label="Instalando actualización">
        <div className="home-modal__card home-modal__card--confirm">
          <div className="home-modal__label">ACTUALIZANDO H.I.S. FUTURE</div>
          <p className="home-modal__hint">
            Descargando e instalando actualización…{state.progress !== undefined ? ` ${state.progress}%` : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-update" role="dialog" aria-label="Actualización de H.I.S. Future">
      <div>
        <strong>
          {`Nueva versión disponible: ${state.update.version}`}
        </strong>
      </div>
      <div className="home-update__actions">
        <button type="button" className="home-screen__button home-screen__button--primary" onClick={() => void install()}>
          Actualizar
        </button>
        <button type="button" className="home-screen__button" onClick={dismiss}>
          Más tarde
        </button>
      </div>
    </div>
  );
}
