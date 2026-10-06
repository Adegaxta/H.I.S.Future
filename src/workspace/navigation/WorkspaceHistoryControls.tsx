import { useEffect, useState, type RefObject } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import backAsset from "../../assets/third-party/google-material/icons/arrow_back_ios_new.svg";
import forwardAsset from "../../assets/third-party/google-material/icons/arrow_forward_ios.svg";

interface WorkspaceHistoryControlsProps {
  mainRef: RefObject<HTMLElement | null>;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

export default function WorkspaceHistoryControls({ mainRef, canBack, canForward, onBack, onForward }: WorkspaceHistoryControlsProps) {
  const { t } = useLocale();
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const updateBounds = () => {
      const rect = main.getBoundingClientRect();
      setLeft(rect.left);
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(main);
    window.addEventListener("resize", updateBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [mainRef]);

  return (
    <div className="workspace-history-controls" style={{ left }}>
      <div className="workspace-history-controls__buttons">
        <button type="button" disabled={!canBack} aria-label={t("page.navigation.back")} title={t("page.navigation.back")} onClick={onBack}><img src={backAsset} alt="" /></button>
        <button type="button" disabled={!canForward} aria-label={t("page.navigation.forward")} title={t("page.navigation.forward")} onClick={onForward}><img src={forwardAsset} alt="" /></button>
      </div>
    </div>
  );
}
