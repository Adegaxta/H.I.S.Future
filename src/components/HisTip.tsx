import { useState } from "react";

interface HisTipProps {
  children: React.ReactNode;
}

export default function HisTip({ children }: HisTipProps) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <aside className="his-tip" role="note">
      <span>TIP</span>
      <p>{children}</p>
      <button type="button" onClick={() => setVisible(false)} aria-label="Cerrar tip">×</button>
    </aside>
  );
}
