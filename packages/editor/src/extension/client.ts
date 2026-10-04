import type { Command, Snapshot } from '../protocol.js';
function evaluate<T>(expression: string): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(expression, (result, exception) => {
      if (exception?.isException || exception?.isError) reject(new Error(exception.value || exception.description || 'Inspected page evaluation failed'));
      else resolve(result as T);
    });
  });
}
let bundle: string | null = null;
let instanceId: string | null = null;
let root: Extract<Command, { type: 'root' }> | null = null;
let source: Extract<Command, { type: 'source' }> | null = null;
async function invoke(command: Command): Promise<Snapshot> {
  const result = await evaluate<Snapshot>(`window.__ANIMPLUS_DEVTOOLS__.command(${JSON.stringify(command)}, typeof $0 === 'undefined' ? undefined : $0)`);
  if (!result || !Array.isArray(result.tree) || !Array.isArray(result.tracks)) throw new Error('Invalid response from inspected page');
  return result;
}
export async function send(command: Command): Promise<Snapshot> {
  let current = await evaluate<string | null>("window.__ANIMPLUS_DEVTOOLS__ ? (window.__ANIMPLUS_DEVTOOLS__.instanceId || 'legacy') : null");
  if (!current) {
    bundle ??= await fetch(chrome.runtime.getURL('bridge.js')).then(response => {
      if (!response.ok) throw new Error('DevTools bridge bundle is unavailable');
      return response.text();
    });
    // Only our locally bundled library is executed here. .anim text is always
    // JSON-encoded data parsed as declarations and instructions, never JS.
    current = await evaluate<string>(`${bundle}\n;window.__ANIMPLUS_DEVTOOLS__.instanceId`);
  }
  // A reload/HMR can replace the bridge even when it is already installed.
  // Restore the preview before hover, seek or polling can publish an empty snapshot.
  if (current !== instanceId && command.type !== 'dispose') {
    if (root && command.type !== 'root') {
      const restored = await invoke(root);
      if (restored.error) throw new Error(restored.error);
    }
    if (source && command.type !== 'source' && command.type !== 'root') {
      const restored = await invoke(source);
      if (restored.error) throw new Error(restored.error);
    }
    instanceId = current;
  }
  const result = await invoke(command);
  if (command.type === 'root' && !result.error) root = { ...command };
  if (command.type === 'source') source = { ...command, name: result.active || command.name };
  if (command.type === 'dispose') instanceId = null;
  return result;
}
