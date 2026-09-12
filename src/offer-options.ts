type OfferCommand =
  | { command: 'list' }
  | { command: 'create'; input: string }
  | { command: 'show'; id: string }
  | { command: 'publish' | 'cancel'; id: string; seller: string }
  | { command: 'prepare'; id: string; buyer: string };
export type OfferOptions = OfferCommand & { db: string };

const COMMAND_FLAGS: Record<string, readonly string[]> = {
  list: [], create: ['--input'], show: ['--id'],
  publish: ['--id', '--seller'], cancel: ['--id', '--seller'], prepare: ['--id', '--buyer'],
};

export function parseOfferOptions(args: string[]): OfferOptions {
  const [command, ...rest] = args;
  const required = command && Object.hasOwn(COMMAND_FLAGS, command) ? COMMAND_FLAGS[command] : undefined;
  if (!command || !required) throw new Error('Usage: offers create|list|show|publish|cancel|prepare [options] [--db PATH]');
  const allowed = new Set(['--db', ...required]);
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key || !allowed.has(key)) throw new Error(`Unknown option: ${key ?? ''}.`);
    if (values.has(key)) throw new Error(`Duplicate option: ${key}.`);
    if (!value || value.startsWith('--') || value.includes('\0') || value.length > 4096) throw new Error(`${key} requires a bounded value.`);
    values.set(key, value);
  }
  const value = (key: string): string => {
    const found = values.get(key);
    if (!found) throw new Error(`${key} is required.`);
    return found;
  };
  const db = values.get('--db') ?? '.local/offers.sqlite';
  switch (command) {
    case 'list': return { command, db };
    case 'create': return { command, db, input: value('--input') };
    case 'show': return { command, db, id: value('--id') };
    case 'publish': case 'cancel': return { command, db, id: value('--id'), seller: value('--seller') };
    case 'prepare': return { command, db, id: value('--id'), buyer: value('--buyer') };
    default: throw new Error('Unknown offer command.');
  }
}
