/**
 * WHAT: Locates the Synthea tooling, the pinned JAR and the studio's run folders, and reads version.lock.
 * NOT:  Does not download or verify the JAR; generate.sh and server.ts own that.
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE, no external authority checks what Synthea generates
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STUDIO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(STUDIO_DIR, '..');
export const GENERATE_SH = join(REPO_ROOT, 'generate.sh');
export const JAR_PATH = join(REPO_ROOT, '.cache', 'synthea-with-dependencies.jar');
export const RUNS_DIR = join(STUDIO_DIR, 'runs');
export const CLIENT_DIR = join(STUDIO_DIR, 'src', 'client');
export const FONTS_DIR = join(STUDIO_DIR, 'fonts');

export type SyntheaPin = {
  version: string;
  jarUrl: string;
  jarSha256: string;
  /** sha256 over synthea.properties then version.lock, file contents only (as generate.sh computes it). */
  configSha256: string;
};

export function parseVersionLock(text: string): { version: string; jarUrl: string; jarSha256: string } {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m?.[1] && m[2] !== undefined) values.set(m[1], m[2].trim());
  }
  const version = values.get('SYNTHEA_VERSION');
  const jarUrl = values.get('SYNTHEA_JAR_URL');
  const jarSha256 = values.get('SYNTHEA_JAR_SHA256');
  if (!version || !jarUrl || !jarSha256) throw new Error('version.lock is missing SYNTHEA_VERSION, URL or SHA256');
  return { version, jarUrl, jarSha256 };
}

export function readSyntheaPin(): SyntheaPin {
  const lock = readFileSync(join(REPO_ROOT, 'version.lock'));
  const props = readFileSync(join(REPO_ROOT, 'synthea.properties'));
  const configSha256 = createHash('sha256').update(props).update(lock).digest('hex');
  return { ...parseVersionLock(lock.toString('utf8')), configSha256 };
}
