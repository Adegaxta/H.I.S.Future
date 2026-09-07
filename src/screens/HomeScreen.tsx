import { FormEvent, useState } from "react";
import type { ProjectInfo } from "../project/types";
import { getCurrentWindow } from "@tauri-apps/api/window";
import hisFutureIconAsset from "../assets/original/icons/HISFuture.ico";
import hisPanelAsset from "../assets/original/ui/HIS_panel_1.svg";
import converterAsset from "../assets/original/ui/hisconverter_button.svg";
import createProjectAsset from "../assets/original/ui/create_project.svg";
import importProjectAsset from "../assets/original/ui/import_project.svg";
import panelBackgroundAsset from "../assets/original/ui/project_panel_background_alter_1.svg";
import previewCircleAsset from "../assets/original/ui/project_preview_circle.svg";
import threeLinesAsset from "../assets/original/ui/asset_3_line.svg";
import boxAsset from "../assets/original/ui/Box.svg";
import alterBoxAsset from "../assets/original/ui/alter_box_1.svg";
import deleteAsset from "../assets/original/ui/delete_button.svg";
import settingsAsset from "../assets/original/ui/settings_button_1.svg";
import windowCloseAsset from "../assets/original/ui/window_close.svg";
import windowMaximizeAsset from "../assets/original/ui/window_maximize.svg";
import windowMinimizeAsset from "../assets/original/ui/window_minimize.svg";
import UpdatePrompt from "../update/UpdatePrompt";
import { APP_WINDOW_TITLE } from "../utils/appEnvironment";

interface HomeScreenProps {
  busy: boolean;
  error: string | null;
  onCreateProject: (name: string) => Promise<void> | void;
  onLoadProject: () => Promise<void> | void;
  onConvertProject: () => Promise<string | null>;
  recentProjects: ProjectInfo[];
  onOpenRecent: (path: string) => Promise<void> | void;
  onRemoveRecent: (path: string) => void;
}

export default function HomeScreen({
  busy,
  error,
  onCreateProject,
  onLoadProject,
  onConvertProject,
  recentProjects,
  onOpenRecent,
  onRemoveRecent,
}: HomeScreenProps) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [conversionMessage, setConversionMessage] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ProjectInfo | null>(null);

  const startWindowDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target instanceof Element && event.target.closest("button")) {
      return;
    }
    void getCurrentWindow().startDragging();
  };

  const submitName = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    void onCreateProject(name.trim());
    setNaming(false);
    setName("");
  };

  const formatLastEdited = (timestamp?: number) => {
    if (!timestamp) return "--.--.-- - --:--";
    const date = new Date(timestamp * 1000);
    const twoDigits = (value: number) => String(value).padStart(2, "0");
    return `${twoDigits(date.getDate())}.${twoDigits(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)} - ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
  };

  return (
    <div className="home-screen">
      <div
        className="home-titlebar"
        data-tauri-drag-region
        onPointerDown={startWindowDrag}
      >
        <div className="home-titlebar__identity" data-tauri-drag-region>
          <img src={hisFutureIconAsset} alt="" />
          <h1 className="home-screen__brand">{APP_WINDOW_TITLE}</h1>
        </div>
        <div className="home-titlebar__controls" data-tauri-drag-region="false">
          <button type="button" title="Minimizar" onClick={() => void getCurrentWindow().minimize()}>
            <img src={windowMinimizeAsset} alt="" />
          </button>
          <button type="button" title="Maximizar" onClick={() => void getCurrentWindow().toggleMaximize()}>
            <img src={windowMaximizeAsset} alt="" />
          </button>
          <button type="button" title="Cerrar" onClick={() => void getCurrentWindow().close()}>
            <img src={windowCloseAsset} alt="" />
          </button>
        </div>
      </div>
      <main className="home-screen__content">
        <div className="home-screen__columns">
          <section className="home-screen__projects">
            <img className="home-screen__his-panel" src={hisPanelAsset} alt="HIS Future" />
            <div className="home-screen__actions">
              <div className="home-action">
                <button
                  type="button"
                  className="home-action__button"
                  disabled={busy}
                  onClick={() => {
                    setNaming(true);
                    setName("");
                  }}
                >
                  <span className="home-action__asset"><img src={createProjectAsset} alt="" /></span>
                </button>
                <span>Crea una carpeta nueva con su base SQLite.</span>
              </div>
              <div className="home-action">
                <button
                  type="button"
                  className="home-action__button"
                  disabled={busy}
                  onClick={() => void onLoadProject()}
                >
                  <span className="home-action__asset"><img src={importProjectAsset} alt="" /></span>
                </button>
                <span>Abre un proyecto que ya tengas en el disco.</span>
              </div>
              <div className="home-action home-action--dev">
                <button
                  type="button"
                  className="home-action__button"
                  title="Conversor DEV de archivos .his"
                  disabled={busy}
                  onClick={async () => {
                    setConversionMessage(null);
                    const output = await onConvertProject();
                    if (output) setConversionMessage(`Conversión completada: ${output}`);
                  }}
                >
                  <span className="home-action__asset"><img src={converterAsset} alt="" /></span>
                </button>
                <span>Convierte archivos con arquitectura his a .his <b>DEV</b></span>
              </div>
            </div>
          </section>
          <section className="home-screen__recent">
            <div className="home-recent-composition">
              <img className="home-recent-decoration home-recent-decoration--lines" src={threeLinesAsset} alt="" />
              <img className="home-recent-decoration home-recent-decoration--box" src={boxAsset} alt="" />
              <img className="home-recent-decoration home-recent-decoration--alter-box" src={alterBoxAsset} alt="" />
              <div className="home-recent-panel">
                <img className="home-recent-panel__background" src={panelBackgroundAsset} alt="" />
                <div className="home-recent-panel__content">
                  <div className="home-recent-list">
                    {recentProjects.map((recent) => (
                      <div key={recent.folderPath} className="home-recent-card">
                        <img className="home-recent-card__circle" src={previewCircleAsset} alt="" />
                        <button
                          type="button"
                          className="home-recent-card__name"
                          disabled={busy}
                          onClick={() => void onOpenRecent(recent.folderPath)}
                        >
                          {recent.name}
                        </button>
                        <time dateTime={recent.lastEdited ? new Date(recent.lastEdited * 1000).toISOString() : undefined}>
                          {formatLastEdited(recent.lastEdited)}
                        </time>
                        <button
                          type="button"
                          className="home-recent-card__delete"
                          title={`Eliminar ${recent.name} de recientes`}
                          aria-label={`Eliminar ${recent.name} de recientes`}
                          onClick={() => setPendingRemoval(recent)}
                        >
                          <img src={deleteAsset} alt="" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
        {error && <div className="home-screen__error">{error}</div>}
        {conversionMessage && <div className="home-screen__status">{conversionMessage}</div>}
      </main>
      <button type="button" className="home-settings" title="Settings" aria-label="Settings">
        <img src={settingsAsset} alt="" />
      </button>

      <UpdatePrompt />

      {naming && (
        <div className="home-modal" role="dialog" aria-modal="true">
          <form className="home-modal__card" onSubmit={submitName}>
            <div className="home-modal__label">NOMBRE DEL PROYECTO</div>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setNaming(false);
              }}
              placeholder="Ej. Crónicas del Norte"
              className="home-modal__input"
            />
            <p className="home-modal__hint">
              Después elegirás la carpeta padre. HIS Future creará dentro una
              carpeta con el manifiesto y lore.sqlite.
            </p>
            <div className="home-modal__actions">
              <button
                type="button"
                className="home-screen__button"
                onClick={() => setNaming(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="home-screen__button home-screen__button--primary"
                disabled={!name.trim() || busy}
              >
                Elegir ubicación
              </button>
            </div>
          </form>
        </div>
      )}
      {pendingRemoval && (
        <div className="home-modal" role="dialog" aria-modal="true" aria-labelledby="remove-recent-title">
          <div className="home-modal__card home-modal__card--confirm">
            <div className="home-modal__label" id="remove-recent-title">ELIMINAR DE RECIENTES</div>
            <p className="home-modal__hint">
              ¿Quieres quitar «{pendingRemoval.name}» de la lista de proyectos recientes? El archivo del proyecto no se eliminará.
            </p>
            <div className="home-modal__actions">
              <button type="button" className="home-screen__button" onClick={() => setPendingRemoval(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="home-screen__button home-screen__button--primary"
                onClick={() => {
                  onRemoveRecent(pendingRemoval.folderPath);
                  setPendingRemoval(null);
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
