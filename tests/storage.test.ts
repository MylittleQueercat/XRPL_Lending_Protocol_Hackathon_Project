import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { writePrivateJson } from '../src/storage.js';
it('creates private files with owner-only permissions and refuses to overwrite them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'raise-storage-'));
  const filename = join(directory, 'wallets.json');
  try {
    await writePrivateJson(filename, { seed: 'synthetic-test-fixture' });
    const mode = await stat(filename).then((value) => value.mode & 0o777).catch(() => null);
    expect(mode).toBe(0o600);
    await expect(writePrivateJson(filename, { seed: 'replacement' })).rejects.toThrow();
    expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual({ seed: 'synthetic-test-fixture' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
