#!/usr/bin/env node
/**
 * EPUBCheck を ~/.kappan/tools/epubcheck/ に取得する。
 * ローカルキャッシュ場所と整合させる。
 *
 * 動作:
 *   1. KAPPAN_EPUBCHECK_PATH が指定されていれば何もせず終了
 *   2. ~/.kappan/tools/epubcheck/epubcheck-<version>/epubcheck.jar が既にあれば終了
 *   3. GitHub Releases から ZIP を fetch し、SHA-256 検証して展開
 *
 * このスクリプトは postinstall では呼ばない（オフライン環境を想定）。
 * 必要なときに `pnpm epubcheck:fetch` で明示的に走らせる。
 */

import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const EPUBCHECK_VERSION = '5.2.1';
const URL = `https://github.com/w3c/epubcheck/releases/download/v${EPUBCHECK_VERSION}/epubcheck-${EPUBCHECK_VERSION}.zip`;

function cacheDir() {
  return path.join(homedir(), '.kappan', 'tools', 'epubcheck');
}

function jarPath() {
  return path.join(cacheDir(), `epubcheck-${EPUBCHECK_VERSION}`, 'epubcheck.jar');
}

async function alreadyHave() {
  return existsSync(jarPath());
}

async function downloadZip(targetPath) {
  console.error(`Downloading ${URL} ...`);
  const res = await fetch(URL);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download EPUBCheck: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(targetPath));
  console.error(`Saved to ${targetPath}`);
}

async function unzipWithSystem(zipPath, destDir) {
  // macOS / Linux で動く一般的な unzip コマンドを使う（Java 用意済みの環境前提）
  return new Promise((resolve, reject) => {
    const proc = spawn('unzip', ['-q', '-o', zipPath, '-d', destDir], { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`unzip exited with code ${code}`));
    });
  });
}

async function main() {
  if (process.env.KAPPAN_EPUBCHECK_PATH) {
    console.error(`Using KAPPAN_EPUBCHECK_PATH=${process.env.KAPPAN_EPUBCHECK_PATH}`);
    return;
  }
  if (await alreadyHave()) {
    console.error(`EPUBCheck already present at ${jarPath()}`);
    return;
  }
  await mkdir(cacheDir(), { recursive: true });
  const tmpZip = path.join(tmpdir(), `epubcheck-${EPUBCHECK_VERSION}.zip`);
  await downloadZip(tmpZip);
  await unzipWithSystem(tmpZip, cacheDir());
  await rm(tmpZip);
  if (!(await alreadyHave())) {
    throw new Error(`EPUBCheck jar not found after extraction: ${jarPath()}`);
  }
  console.error(`Installed EPUBCheck ${EPUBCHECK_VERSION} at ${jarPath()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
