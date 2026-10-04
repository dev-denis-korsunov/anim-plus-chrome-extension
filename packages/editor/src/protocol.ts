export interface TreeRow { path: string; name: string; tag: string; depth: number }
export interface Track { target: string | null; label: string; activation: number; start: number; end: number; from?: number; to?: number; repeat?: number; line: number }
export interface Snapshot {
  root: string; names: string[]; active: string; tree: TreeRow[]; tracks: Track[];
  time: number; duration: number | null; horizon: number; status: string; error: string; events: string[]; css?: string;
}
export type Command =
  | { type: 'export-css' | 'snapshot' | 'play' | 'pause' | 'reset' | 'dispose' }
  | { type: 'root'; selector?: string; selected?: boolean }
  | { type: 'source'; source: string; name?: string }
  | { type: 'seek'; time: number }
  | { type: 'highlight'; path?: string; selected?: boolean };
export interface Bridge { version: string; instanceId: string; command(command: Command, selected?: unknown): Snapshot }
declare global { interface Window { __ANIMPLUS_DEVTOOLS__?: Bridge } }
