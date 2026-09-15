import { useEffect, useRef, useState, type RefObject } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import backAsset from "../../assets/third-party/google-material/icons/arrow_back_ios_new.svg";
import forwardAsset from "../../assets/third-party/google-material/icons/arrow_forward_ios.svg";

interface WorkspaceHistoryControlsProps {
  mainRef: RefObject<HTMLElement | null>;
  locationKey: string;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

export default function WorkspaceHistoryControls({ mainRef, locationKey, canBack, canForward, onBack, onForward }: WorkspaceHistoryControlsProps) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(true);
  const [left, setLeft] = useState(0);
  const timeoutRef = useRef<number | null>(null);

  const clearHideTimer = () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };
  const scheduleHide = (delay = 10_000) => {
    clearHideTimer();
    timeoutRef.current = window.setTimeout(() => setVisible(false), delay);
  };

  useEffect(() => {
    setVisible(true);
    scheduleHide();
    return clearHideTimer;
  }, [locationKey]);

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
    <div className={`workspace-history-controls${visible ? " is-visible" : ""}`} style={{ left }} onPointerEnter={() => { clearHideTimer(); setVisible(true); }} onPointerLeave={() => scheduleHide(1_800)}>
      <div className="workspace-history-controls__buttons">
        <button type="button" disabled={!canBack} aria-label={t("page.navigation.back")} title={t("page.navigation.back")} onClick={onBack}><img src={backAsset} alt="" /></button>
        <button type="button" disabled={!canForward} aria-label={t("page.navigation.forward")} title={t("page.navigation.forward")} onClick={onForward}><img src={forwardAsset} alt="" /></button>
      </div>
    </div>
  );
}
