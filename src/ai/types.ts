export interface AIModelDescriptor {
  family: string;
  size: string;
  quantization: string;
  variant: string;
}

export interface AIConceptAttribute {
  label: string;
  value: string;
}

export interface AIConcept {
  id: string;
  name: string;
  aliases?: readonly string[];
  type: string;
  definition: string;
  attributes: readonly AIConceptAttribute[];
}

export interface AIMessageMetrics {
  tokens: number | null;
  elapsedSeconds: number | null;
  tokensPerSecond: number | null;
}

export interface AIMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  sequence?: number;
  createdAt?: string;
  model?: AIModelDescriptor;
  metrics?: AIMessageMetrics;
  pending?: boolean;
  error?: boolean;
}

export interface AIConversationSummary {
  id: string;
  title: string;
  projectId?: string | null;
  vaultId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
  messageCount?: number;
}
