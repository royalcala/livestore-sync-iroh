# livestore-sync-iroh

LiveStore `SyncBackend` adapter for iroh-docs — P2P sync without servers.

Replaces HTTP/WebSocket sync with direct iroh-docs operations. Events are stored in `org_<id>/data` as HLC-keyed entries and synced P2P via iroh gossip + set reconciliation.

## Usage

```ts
import { createIrohSyncBackend } from 'livestore-sync-iroh'

const backend = createIrohSyncBackend({
  orgId: 'acme',
  invoke: (cmd, args) => window.__TAURI__.invoke(cmd, args),
})
```

## Requires (Rust backend)

```rust
// In your Tauri app's lib.rs:
#[tauri::command]
fn sync_push(org_id, batch) { ... }
#[tauri::command]
fn sync_pull(org_id, cursor) { ... }
#[tauri::command]
fn sync_ping(org_id) { ... }
```

## Stack

- [LiveStore](https://livestorejs.com) — event sourcing + SQLite
- [iroh-docs](https://github.com/n0-computer/iroh-docs) — P2P sync
- [Syntrix](https://github.com/royalcala/syntrix-client) — ERP without servers
