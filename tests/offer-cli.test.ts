import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('persists an advertised offer across separate CLI processes and cancels it locally', () => {
  const directory = mkdtempSync(join(tmpdir(), 'raise-offer-cli-'));
  const db = join(directory, 'offers.sqlite');
  const input = join(directory, 'offer.json');
  const seller = 'rHmFRk6rLPAbWzDXaH1nUvxbhHgQiMxXag';
  const run = (...args: string[]) => JSON.parse(execFileSync(process.execPath,
    ['--import', 'tsx', 'src/offer-cli.ts', ...args, '--db', db],
    { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] }) as string) as Record<string, unknown>;
  try {
    writeFileSync(input, JSON.stringify({
      networkId: 4001,
      vaultId: '84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF',
      shareMptId: '000000016D8E5748CD5FA882BDFF41D6619F430CF479D096',
      seller, sharesRaw: '1000000', priceAsset: { currency: 'XRP' }, priceDrops: '950000',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }));
    const draft = run('create', '--input', input);
    expect(draft.state).toBe('draft');
    expect(typeof draft.id).toBe('string');
    const id = String(draft.id);
    expect(run('list')).toEqual([]);
    expect(run('publish', '--id', id, '--seller', seller).state).toBe('open');
    expect(run('list')).toMatchObject([{ id, state: 'open' }]);
    expect(run('cancel', '--id', id, '--seller', seller).state).toBe('cancelled');
    expect(run('list')).toEqual([]);
    expect(run('show', '--id', id).state).toBe('cancelled');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
