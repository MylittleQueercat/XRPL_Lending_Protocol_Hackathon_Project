import { chmod, lstat, mkdir, mkdtemp, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function writePrivateJson(filename: string, value: unknown): Promise<void> {
  const handle = await open(filename, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
  finally { await handle.close(); }
}

export async function createRunDirectory(prefix: string): Promise<string> {
  const base = resolve('.local');
  await mkdir(base, { recursive: true, mode: 0o700 });
  if (!(await lstat(base)).isDirectory()) throw new Error('.local must be a real directory, not a symlink.');
  await chmod(base, 0o700);
  return mkdtemp(join(base, `${prefix}-`));
}
