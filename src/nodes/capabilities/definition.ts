import type { ComposableNodeCapability, ComposableNodeCapabilityId } from "../definition";

export const defineComposableCapability = <const T extends ComposableNodeCapabilityId>(id: T): ComposableNodeCapability & { id: T } => ({ id });

export const RICH_TEXT_CAPABILITY = defineComposableCapability("rich-text");
