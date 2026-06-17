/**
 * livestore-sync-iroh — LiveStore SyncBackend adapter for iroh-docs.
 *
 * Replaces HTTP/WebSocket sync with direct P2P iroh-docs operations.
 * Events are stored in `org_<id>/data` namespace as HLC-keyed entries.
 *
 * Usage:
 * ```ts
 * import { createIrohSyncBackend } from 'livestore-sync-iroh'
 *
 * const backend = createIrohSyncBackend({
 *   orgId: 'acme',
 *   invoke: (cmd, args) => window.__TAURI__.invoke(cmd, args),
 * })
 * ```
 *
 * The backend communicates with the Rust iroh node via Tauri commands:
 *   - `sync_push(orgId, batch)` → writes events to org_<id>/data
 *   - `sync_pull(orgId, cursor)` → reads events from org_<id>/data
 *   - `sync_ping(orgId)` → health check
 */

// ── Types ──

/** A single event as stored in iroh-docs. */
export interface EventEncoded {
  name: string
  args: unknown
  seqNum: number
  parentSeqNum: number
  clientId: string
  sessionId: string
}

/** HLC timestamp used as cursor position. */
export interface HlcCursor {
  ts: number
  count: number
  node: string
}

/** Batch of events returned from pull. */
export interface PullBatch {
  eventEncoded: EventEncoded
  metadata?: unknown
}

/** Result of a pull operation. */
export interface PullResult {
  batch: PullBatch[]
  hasMore: boolean
  cursor: HlcCursor | null
}

/** Connectivity state. */
export interface ConnectionState {
  connected: boolean
  peers: number
}

/** Configuration for the iroh sync backend. */
export interface IrohSyncConfig {
  /** Org identifier (e.g. "acme"). Events are stored in `org_<orgId>/data`. */
  orgId: string
  /** Generic invoke function (Tauri IPC or custom bridge). */
  invoke: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>
}

// ── Backend implementation ──

export function createIrohSyncBackend(config: IrohSyncConfig) {
  const { orgId, invoke } = config

  /** Push a batch of events to iroh-docs. */
  async function push(batch: readonly EventEncoded[]): Promise<void> {
    if (batch.length === 0) return
    // Each event gets an HLC assigned by the Rust backend and written to org_<id>/data
    await invoke('sync_push', {
      orgId,
      batch: batch.map((e) => ({
        name: e.name,
        args: e.args,
        seqNum: e.seqNum,
        parentSeqNum: e.parentSeqNum,
        clientId: e.clientId,
        sessionId: e.sessionId,
      })),
    })
  }

  /** Pull events from iroh-docs starting from cursor. */
  async function pull(cursor: HlcCursor | null): Promise<PullResult> {
    const result = await invoke<PullResult>('sync_pull', {
      orgId,
      cursor: cursor ? { ts: cursor.ts, count: cursor.count, node: cursor.node } : null,
    })
    return result
  }

  /** Stream events live as they arrive from other peers. */
  async function* pullLive(cursor: HlcCursor | null): AsyncGenerator<PullResult> {
    let currentCursor = cursor
    while (true) {
      const result = await pull(currentCursor)
      if (result.batch.length > 0) {
        yield result
        // Advance cursor to last event in batch
        currentCursor = result.cursor
      }
      // Poll interval (iroh gossip delivers events asynchronously)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  /** Health check — pings the iroh endpoint. */
  async function ping(): Promise<void> {
    await invoke('sync_ping', { orgId })
  }

  /** Check if iroh is connected to peers. */
  async function getConnectionState(): Promise<ConnectionState> {
    return invoke<ConnectionState>('sync_status', { orgId })
  }

  return {
    push,
    pull,
    pullLive,
    ping,
    getConnectionState,
    /** Metadata for devtools */
    metadata: {
      name: 'livestore-sync-iroh',
      description: `iroh-docs P2P sync for org:${orgId}`,
    },
    supports: {
      pullPageInfoKnown: false,
      pullLive: true,
    },
  }
}
