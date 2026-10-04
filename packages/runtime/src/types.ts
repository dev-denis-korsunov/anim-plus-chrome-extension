export type Context = Record<string, number>;
export type Value = (context: Context) => number;
export type VariableBinding = { kind: 'selected' } | { kind: 'selector'; selector: string; all: boolean };
export type Status = 'Pending' | 'Active' | 'Paused' | 'Completed' | 'Cancelled' | 'Failed' | 'Replaced' | 'TargetDestroyed';
export interface Adapter<T extends object = object> {
  children(target: T): T[];
  name(target: T): string;
  type(target: T, category: string): boolean;
  channels(property: string): string[];
  read(target: T, channel: string): number;
  write(target: T, channel: string, value: number): void;
  geometry(target: T): { x: number; y: number };
  alive(target: T): boolean;
  query?(selector: string, all: boolean): T | T[] | null;
}
export interface NodeBase { id: number; line: number; parent: number | null }
export interface SelectionNode extends NodeBase { kind: 'selection'; command: string; args: string[] }
export interface CallNode extends NodeBase { kind: 'call'; name: string }
export interface EventNode extends NodeBase { kind: 'event'; name: string; durationValue: Value; delayValue: Value }
export interface TransitionNode extends NodeBase {
  kind: 'transition'; property: string; repeat: number; direction?: 'normal' | 'alternate';
  fromValue: Value; toValue: Value; durationValue: Value; delayValue: Value; easeValue: (t: number) => number; easingName?: string;
}
export type ScriptNode = SelectionNode | CallNode | EventNode | TransitionNode;
export interface Definition { name: string; namespace: string; nodes: ScriptNode[] }
export interface Program {
  standard: string;
  definitions: Map<string, Definition>;
  variables: Map<string, { source: string; evaluate?: Value; binding?: VariableBinding; line: number }>;
}
export interface Row<T extends object = object> { object: T; depth: number; sibling: number; parent: T | null; index?: number; grid?: boolean }
export interface Scene<T extends object = object> { rows: Row<T>[]; byObject: Map<T, Row<T>> }
export interface Transition<T extends object = object> {
  object: T; key: string; from: number; to: number; activation: number; start: number; end: number;
  duration: number; repeat: number; direction?: 'normal' | 'alternate'; easing: (t: number) => number; easingName?: string; line: number; index?: number; depth?: number; cancelledAt?: number;
}
export interface EventSegment { name: string; start: number; end: number; line: number }
export interface RunOptions<T extends object = object> {
  adapter?: Adapter<T>; variables?: Record<string, number | T | T[]>;
  bindings?: { mouse?: { x: number; y: number }; live?: boolean; selected?: T; query?: (selector: string, all: boolean) => T | T[] | null; geometry?: (target: T) => { x: number; y: number } };
  onEvent?: (name: string, run: import('./runtime.js').AnimationRun<T>) => void;
}
export interface Plan<T extends object = object> {
  adapter: Adapter<T>; snapshots: Map<T, Map<string, number>>; transitions: Transition<T>[];
  events: EventSegment[]; duration: number; onEvent: (name: string, run: import('./runtime.js').AnimationRun<T>) => void;
  refresh?: () => void;
}
