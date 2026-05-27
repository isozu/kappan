import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter.js';

describe('parseFrontmatter', () => {
  it('returns body unchanged when no front-matter present', () => {
    const { frontmatter, body } = parseFrontmatter('# Hello\n\nWorld');
    expect(frontmatter).toEqual({});
    expect(body).toBe('# Hello\n\nWorld');
  });

  it('parses title / id / next', () => {
    const source = `---
title: 第1章 はじめに
id: ch01
next: 02-architecture.md
---

本文
`;
    const { frontmatter, body } = parseFrontmatter(source);
    expect(frontmatter.title).toBe('第1章 はじめに');
    expect(frontmatter.id).toBe('ch01');
    expect(frontmatter.next).toBe('02-architecture.md');
    expect(body.trim()).toBe('本文');
  });

  it('handles quoted values', () => {
    const source = `---
title: "Quoted title"
id: 'single-quoted'
---

body
`;
    const { frontmatter } = parseFrontmatter(source);
    expect(frontmatter.title).toBe('Quoted title');
    expect(frontmatter.id).toBe('single-quoted');
  });

  it('ignores unknown fields and comments', () => {
    const source = `---
title: T
# this is a comment
author: ignored
---

body
`;
    const { frontmatter } = parseFrontmatter(source);
    expect(frontmatter.title).toBe('T');
    expect('author' in frontmatter).toBe(false);
  });

  it('handles CRLF line endings', () => {
    const source = '---\r\ntitle: CRLF\r\n---\r\n\r\nbody';
    const { frontmatter, body } = parseFrontmatter(source);
    expect(frontmatter.title).toBe('CRLF');
    expect(body.trim()).toBe('body');
  });
});
