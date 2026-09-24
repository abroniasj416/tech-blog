import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import remarkNotionParagraphs from './lib/remark-notion-paragraphs.mjs';

const processor = await createMarkdownProcessor({
  remarkPlugins: [remarkNotionParagraphs],
  syntaxHighlight: false,
});
const marker = '<!-- notion-sync: generated -->\n\n';
async function render(source, generated = true) {
  return (await processor.render((generated ? marker : '') + source)).code;
}

test('Notion consecutive text blocks render as separate paragraphs', async () => {
  const html = await render('첫 문단입니다.\n**두 번째** 문단입니다.\n세 번째 문단입니다.');
  assert.match(html, /<p>첫 문단입니다\.<\/p>\s*<p><strong>두 번째<\/strong> 문단입니다\.<\/p>\s*<p>세 번째 문단입니다\.<\/p>/);
});

test('ordinary Markdown keeps soft breaks', async () => {
  assert.equal(await render('first\nsecond', false), '<p>first\nsecond</p>');
});

test('explicit inline breaks and formatted text survive', async () => {
  const html = await render('first<br>second\n[link](https://example.com) and `code`');
  assert.match(html, /<p>first<br>second<\/p>/);
  assert.match(html, /<p><a href="https:\/\/example.com">link<\/a> and <code>code<\/code><\/p>/);
});

test('headings, lists, code, quotes and tables remain unchanged', async () => {
  const source = '# Heading\n\n- item\n  continuation\n- second\n\n> quote\n> continued\n\n```text\none\ntwo\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<table>\n<tr><td>cell</td></tr>\n</table>';
  assert.equal((await render(source)).replace(marker.trim() + '\n', ''), await render(source, false));
});

test('HTML table does not swallow following headings, images, emphasis or another table', async () => {
  const source = '<table>\n<tr><td>cell</td></tr>\n</table>\n**after**\n![diagram](/diagram.png)\n### Heading\nbody\n<table>\n<tr><td>second</td></tr>\n</table>\n## Ending\nlast';
  const html = await render(source);
  assert.equal((html.match(/<table>/g) || []).length, 2);
  assert.match(html, /<p><strong>after<\/strong><\/p>/);
  assert.match(html, /<img[^>]+src="\/diagram.png"/);
  assert.match(html, /<h3[^>]*>Heading<\/h3>/);
  assert.match(html, /<h2[^>]*>Ending<\/h2>/);
  assert.match(html, /<p>last<\/p>/);
});

test('unindented prose following Notion lists becomes separate paragraphs', async () => {
  const html = await render('1. first\n2. second\nafter list\nnext paragraph\n\n- parent\n  - child\n  continuation\nafter bullets');
  assert.match(html, /<\/ol>\s*<p>after list<\/p>\s*<p>next paragraph<\/p>/);
  assert.match(html, /<\/ul>\s*<p>after bullets<\/p>/);
  assert.match(html, /child\ncontinuation/);
});

test('table and Markdown examples inside code are unchanged', async () => {
  const source = '```html\n<table>\n</table>\n### literal\n```';
  assert.equal((await render(source)).replace(marker.trim() + '\n', ''), await render(source, false));
});

test('entire published 3-Tier article retains all headings, images, tables and list boundaries', async () => {
  const source = await readFile(new URL('../src/content/blog/three-tier-architecture.md', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf(marker.trim()));
  const html = await render(body, false);
  assert.equal((html.match(/<h2\b/g) || []).length, 7);
  assert.equal((html.match(/<h3\b/g) || []).length, 3);
  assert.equal((html.match(/<img\b/g) || []).length, 3);
  assert.equal((html.match(/<table\b/g) || []).length, 3);
  assert.match(html, /<\/ol>\s*<p>반면 CSS/);
  assert.match(html, /<\/ul>\s*<p>이렇게 구성하면/);
  assert.doesNotMatch(html, /### |!\[/);
  assert.match(html, /<strong>어떤 범위를 기준으로 무엇을 분리했는지<\/strong>/);
  assert.match(html, /<p>그 질문에 답할 수 있을 때, 계층을 나눈 이유도 설명할 수 있다\.<\/p>/);
});
