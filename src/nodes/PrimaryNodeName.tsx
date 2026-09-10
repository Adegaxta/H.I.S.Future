import type { ReactNode } from "react";
import type { NodeItem } from "../types/nodes";
import { isVaultPrimaryNode } from "./project/domain";
import starIcon from "../assets/third-party/google-material/icons/star.svg";

interface PrimaryNodeNameProps {
  node: NodeItem;
  children?: ReactNode;
  className?: string;
}

export function PrimaryNodeName({ node, children, className = "" }: PrimaryNodeNameProps) {
  const primary = isVaultPrimaryNode(node);
  return (
    <span className={`primary-node-name ${className}`.trim()}>
      {primary && <img className="primary-node-name__icon" src={starIcon} alt="" aria-hidden="true" />}
      <span className="primary-node-name__text">{children ?? node.name}</span>
    </span>
  );
}
