# Capabilities v1

## Icon

The `icon` Node capability is declared by Node definitions and implemented in
`icon.ts`. It owns the format-neutral icon state transitions used by the
existing Page metadata (`iconNodeId` and `iconVisual`), including image,
emoji, glyph and clear operations. The visual pickers remain UI providers;
they are not duplicated by the capability. A future Node can opt in by
declaring `icon: true` and adapting its persisted metadata to the same
operations. Globo is intentionally not opted in yet.

`proyecto` is the first consumer of the composable capability path. Its definition declares the stable `rich-text` capability identity, and the composition host resolves that reusable content without knowing which Node type consumes it. The rich-text implementation includes the editor's existing mentions behavior. Mentions are therefore not declared as a second capability, and connections will not become one until they have real reusable behavior.

A capability is reusable behavior, not a property or configurable data field. Existing Node types intentionally remain on the current architecture: `pagina` only consumes the extracted rich-text component directly so its behavior stays unchanged. No property schema, dynamic plugin system, or Node type builder is introduced. Future migrations should happen one Node type at a time only if this small pattern proves useful.

## Primary Project

The primary Project Node represents the Vault inside the Nodal system. Every Vault has exactly one, identified by the persisted `vault-primary` role rather than its name, and it cannot be moved to Trash or permanently deleted. It is not a hierarchical root and creates no automatic relations. Graph gives it visual emphasis only; simulation mass, forces, springs, and centering remain unchanged.
