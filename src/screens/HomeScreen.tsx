import { FormEvent, useState } from "react";
import type { ProjectInfo } from "../project/types";
import { getCurrentWindow } from "@tauri-apps/api/window";
import hisFutureIconAsset from "../assets/original/HISFuture_ICONS/HISFUTURE_ICON.png";
import hisFileIconAsset from "../assets/original/HISFuture_ICONS/HIS_FILE_ICON.png";
import hisPanelAsset from "../assets/original/ui/HIS_panel_1.svg";
import converterAsset from "../assets/original/ui/hisconverter_button.svg";
import createProjectAsset from "../assets/original/ui/create_project.svg";
import importProjectAsset from "../assets/original/ui/import_project.svg";
import panelBackgroundAsset from "../assets/original/ui/project_panel_background_alter_1.svg";
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
import { useLocale } from "../i18n/LocaleContext";
import type { Translate } from "../i18n/core";

interface HomeScreenProps {
  busy: boolean;
  error: string | null;
  onCreateProject: (name: string, t: Translate) => Promise<void> | void;
  onLoadProject: (t: Translate) => Promise<void> | void;
  onConvertProject: (t: Translate) => Promise<string | null>;
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
  const { t } = useLocale();
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
    void onCreateProject(name.trim(), t);
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
          <button type="button" title={t("common.window.minimize")} onClick={() => void getCurrentWindow().minimize()}>
            <img src={windowMinimizeAsset} alt="" />
          </button>
          <button type="button" title={t("common.window.maximize")} onClick={() => void getCurrentWindow().toggleMaximize()}>
            <img src={windowMaximizeAsset} alt="" />
          </button>
          <button type="button" title={t("common.window.close")} onClick={() => void getCurrentWindow().close()}>
            <img src={windowCloseAsset} alt="" />
          </button>
        </div>
      </div>
      <main className="home-screen__content">
        <div className="home-screen__columns">
          <section className="home-screen__projects">
            <img className="home-screen__his-panel" src={hisPanelAsset} alt="H.I.S. Future" />
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
                <span>{t("home.create.description")}</span>
              </div>
              <div className="home-action">
                <button
                  type="button"
                  className="home-action__button"
                  disabled={busy}
                  onClick={() => void onLoadProject(t)}
                >
                  <span className="home-action__asset"><img src={importProjectAsset} alt="" /></span>
                </button>
                <span>{t("home.open.description")}</span>
              </div>
              <div className="home-action home-action--dev">
                <button
                  type="button"
                  className="home-action__button"
                  title={t("home.convert.title")}
                  disabled={busy}
                  onClick={async () => {
                    setConversionMessage(null);
                    const output = await onConvertProject(t);
                    if (output) setConversionMessage(t("home.convert.complete", { path: output }));
                  }}
                >
                  <span className="home-action__asset"><img src={converterAsset} alt="" /></span>
                </button>
                <span>{t("home.convert.description")} <b>DEV</b></span>
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
                        <img className="home-recent-card__icon" src={hisFileIconAsset} alt="" />
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
                          title={t("home.recent.removeAction", { name: recent.name })}
                          aria-label={t("home.recent.removeAction", { name: recent.name })}
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
      <button type="button" className="home-settings" title={t("home.settings")} aria-label={t("home.settings")}>
        <img src={settingsAsset} alt="" />
      </button>

      <UpdatePrompt />

      {naming && (
        <div className="home-modal" role="dialog" aria-modal="true">
          <form className="home-modal__card" onSubmit={submitName}>
            <div className="home-modal__label">{t("home.projectName.title")}</div>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setNaming(false);
              }}
              placeholder={t("home.projectName.placeholder")}
              className="home-modal__input"
            />
            <p className="home-modal__hint">
              {t("home.projectName.hint")}
            </p>
            <div className="home-modal__actions">
              <button
                type="button"
                className="home-screen__button"
                onClick={() => setNaming(false)}
              >
                {t("common.actions.cancel")}
              </button>
              <button
                type="submit"
                className="home-screen__button home-screen__button--primary"
                disabled={!name.trim() || busy}
              >
                {t("home.projectName.chooseLocation")}
              </button>
            </div>
          </form>
        </div>
      )}
      {pendingRemoval && (
        <div className="home-modal" role="dialog" aria-modal="true" aria-labelledby="remove-recent-title">
          <div className="home-modal__card home-modal__card--confirm">
            <div className="home-modal__label" id="remove-recent-title">{t("home.recent.removeTitle")}</div>
            <p className="home-modal__hint">
              {t("home.recent.removeConfirm", { name: pendingRemoval.name })}
            </p>
            <div className="home-modal__actions">
              <button type="button" className="home-screen__button" onClick={() => setPendingRemoval(null)}>
                {t("common.actions.cancel")}
              </button>
              <button
                type="button"
                className="home-screen__button home-screen__button--primary"
                onClick={() => {
                  onRemoveRecent(pendingRemoval.folderPath);
                  setPendingRemoval(null);
                }}
              >
                {t("common.actions.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
