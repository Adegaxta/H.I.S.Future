import { NODE_REGISTRY } from "../../defs/nodeTypes";
import { useLocale } from "../../i18n/LocaleContext";
import type { BaseNodeType } from "../../types/nodes";
import type { TimeFormat } from "../../utils/temporalMeta";

interface ProjectSettingsPanelProps {
  projectName: string;
  projectImage: string | null;
  projectInitial: string;
  avatarColor: string;
  defaultNodeType: BaseNodeType;
  onDefaultNodeTypeChange: (type: BaseNodeType) => void;
  timeFormat: TimeFormat;
  onTimeFormatChange: (format: TimeFormat) => void;
  appVersion: string | null;
}

export function ProjectSettingsPanel({
  projectName,
  projectImage,
  projectInitial,
  avatarColor,
  defaultNodeType,
  onDefaultNodeTypeChange,
  timeFormat,
  onTimeFormatChange,
  appVersion,
}: ProjectSettingsPanelProps) {
  const { locale, setLocale, t } = useLocale();
  return <section className="project-settings">
    <div className="project-settings__hero">
      <div className="project-settings__image" style={projectImage ? { backgroundImage: `url(${projectImage})` } : { backgroundColor: avatarColor }}>
        {!projectImage && projectInitial}
      </div>
      <div><div className="project-settings__eyebrow">{t("settings.project.heading")}</div><h1>{projectName}</h1></div>
    </div>
    <label className="project-settings__field">
      {t("settings.defaultNodeType")}
      <select value={defaultNodeType} onChange={(event) => onDefaultNodeTypeChange(event.target.value as BaseNodeType)}>
        {NODE_REGISTRY.availableForCreation().map((definition) => <option key={definition.type} value={definition.type}>{t(definition.labelKey)}</option>)}
      </select>
    </label>
    <label className="project-settings__field">
      {t("settings.projectLocale")}
      <select value={locale} onChange={(event) => void setLocale(event.target.value as "es" | "en")}>
        <option value="es">{t("settings.locale.es")}</option>
        <option value="en">{t("settings.locale.en")}</option>
      </select>
    </label>
    <label className="project-settings__field">
      {t("settings.timeFormat")}
      <select value={timeFormat} onChange={(event) => onTimeFormatChange(event.target.value as TimeFormat)}>
        <option value="12h">{t("settings.timeFormat.12h")}</option>
        <option value="24h">{t("settings.timeFormat.24h")}</option>
      </select>
    </label>
    <div className="project-settings__version" aria-label={t("settings.appVersion")}>{appVersion ? `v${appVersion}` : "v—"}</div>
  </section>;
}
