import assert from 'node:assert/strict';
import test from 'node:test';
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
