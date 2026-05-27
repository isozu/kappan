import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { walkReviewProject, isLargeProject } from './walk.js';

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'kappan-walk-test-'));

  // 典型的な Re:VIEW プロジェクトを作る
  const projectDir = path.join(workDir, 'sample');
  await mkdir(path.join(projectDir, 'images'), { recursive: true });
  await writeFile(path.join(projectDir, 'config.yml'), 'bookname: x');
  await writeFile(path.join(projectDir, 'catalog.yml'), 'CHAPS: []');
  await writeFile(path.join(projectDir, 'chap01.re'), '= title');
  await writeFile(path.join(projectDir, 'chap02.re'), '= title');
  await writeFile(path.join(projectDir, '.hidden'), 'ignored');
  await writeFile(path.join(projectDir, 'README.md'), 'not collected');
  await writeFile(path.join(projectDir, 'images', 'arch.png'), Buffer.from('PNG'));
  await writeFile(path.join(projectDir, 'images', 'flow.jpg'), Buffer.from('JPG'));
  await writeFile(path.join(projectDir, 'images', '.dotfile'), 'ignored');

  // 空ディレクトリ
  await mkdir(path.join(workDir, 'empty'), { recursive: true });

  // images だけのプロジェクト
  const noChapDir = path.join(workDir, 'nochaps');
  await mkdir(path.join(noChapDir, 'images'), { recursive: true });
  await writeFile(path.join(noChapDir, 'images', 'x.png'), Buffer.from('PNG'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('walkReviewProject', () => {
  it('detects .re files', async () => {
    const layout = await walkReviewProject(path.join(workDir, 'sample'));
    expect(layout.reFiles).toHaveLength(2);
    expect(layout.reFiles[0]).toContain('chap01.re');
  });

  it('detects config.yml and catalog.yml', async () => {
    const layout = await walkReviewProject(path.join(workDir, 'sample'));
    expect(layout.configPath).toContain('config.yml');
    expect(layout.catalogPath).toContain('catalog.yml');
  });

  it('builds an image index by basename and stem', async () => {
    const layout = await walkReviewProject(path.join(workDir, 'sample'));
    expect(layout.imageIndex.get('arch.png')).toContain('arch.png');
    expect(layout.imageIndex.get('arch')).toContain('arch.png');
    expect(layout.imageIndex.get('flow.jpg')).toContain('flow.jpg');
  });

  it('ignores hidden files', async () => {
    const layout = await walkReviewProject(path.join(workDir, 'sample'));
    expect(layout.reFiles.some((p) => p.includes('.hidden'))).toBe(false);
    for (const [name] of layout.imageIndex) {
      expect(name.startsWith('.')).toBe(false);
    }
  });

  it('does not collect non-.re markdown files', async () => {
    const layout = await walkReviewProject(path.join(workDir, 'sample'));
    expect(layout.reFiles.some((p) => p.endsWith('README.md'))).toBe(false);
  });

  it('handles empty directory', async () => {
    const layout = await walkReviewProject(path.join(workDir, 'empty'));
    expect(layout.reFiles).toEqual([]);
    expect(layout.configPath).toBeUndefined();
  });

  it('handles project with only images', async () => {
    const layout = await walkReviewProject(path.join(workDir, 'nochaps'));
    expect(layout.imageIndex.get('x.png')).toBeDefined();
    expect(layout.reFiles).toEqual([]);
  });

  it('reports non-large projects under threshold', async () => {
    expect(await isLargeProject(path.join(workDir, 'sample'), 1000)).toBe(false);
  });
});
