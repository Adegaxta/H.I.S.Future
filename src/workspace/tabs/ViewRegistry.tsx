import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import type { WorkspaceTab, WorkspaceViewType } from "./model";

export interface WorkspaceViewDefinition {
  type: WorkspaceViewType;
  title: string;
  icon: ComponentType<LucideProps>;
  renderIcon?: (tab: WorkspaceTab) => ReactNode;
  contextHeader?: boolean;
  resolveContextTitle?: (tab: WorkspaceTab) => string;
  renderer: (tab: WorkspaceTab) => ReactNode;
  resolveTitle?: (tab: WorkspaceTab) => string;
  defaultState?: Record<string, unknown>;
  keepAlive?: boolean;
}

export class ViewRegistry {
  private readonly definitions = new Map<WorkspaceViewType, WorkspaceViewDefinition>();

  register(definition: WorkspaceViewDefinition) {
    this.definitions.set(definition.type, definition);
    return this;
  }

  get(type: WorkspaceViewType | null) {
    return type ? this.definitions.get(type) : undefined;
  }

  list() {
    return [...this.definitions.values()];
  }
}
