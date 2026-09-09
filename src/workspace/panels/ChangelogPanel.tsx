import { CHANGELOG_ENTRIES } from "../../defs/changelog";
import { useLocale } from "../../i18n/LocaleContext";

export function ChangelogPanel() {
  const { t } = useLocale();
  return <section className="project-settings">
    <div className="project-settings__eyebrow">{t("changelog.heading")}</div>
    <h1>Changelog</h1>
    <div className="changelog-list">
      {CHANGELOG_ENTRIES.map((entry) => <article className="changelog-entry" key={entry.version}>
        <div className="changelog-entry__meta">
          <span>{entry.category}</span><span>v{entry.version}</span><span>{entry.date}</span>
        </div>
        <h2>{"titleKey" in entry ? t(entry.titleKey) : entry.title}</h2>
        {"summaryKey" in entry && entry.summaryKey
          ? <p className="changelog-entry__summary">{t(entry.summaryKey)}</p>
          : "summary" in entry && entry.summary && <p className="changelog-entry__summary">{entry.summary}</p>}
        {"sections" in entry && entry.sections ? <div className="changelog-entry__sections">
          {entry.sections.map((section) => <section className={section.kind === "fix" ? "is-fix" : ""} key={"titleKey" in section ? section.titleKey : section.title}>
            <h3>{"titleKey" in section ? t(section.titleKey) : section.title}</h3>
            <ul>{("changeKeys" in section ? section.changeKeys.map((key) => t(key)) : section.changes).map((change) => <li key={change}>{change}</li>)}</ul>
          </section>)}
        </div> : <ul>
          {("changeKeys" in entry ? entry.changeKeys.map((key) => t(key)) : entry.changes).map((change) => <li key={change}>{change}</li>)}
        </ul>}
      </article>)}
    </div>
  </section>;
}
