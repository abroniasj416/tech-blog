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

test('Notion paragraph followed by a divider stays a paragraph and a horizontal rule', async () => {
  const html = await render('그래서 `yum install`을 입력해도 실제로는 dnf가 동작한다.\n---\n## 다음 제목');
  assert.match(html, /<p>그래서 <code>yum install<\/code>을 입력해도 실제로는 dnf가 동작한다\.<\/p>\s*<hr>/);
  assert.equal((html.match(/<h2\b/g) || []).length, 1);
});

test('Notion divider preserves separate paragraphs and inline formatting with CRLF', async () => {
  const html = await render('first **paragraph**\r\n[link](https://example.com) and `code`<br>continued\r\n---\r\nafter');
  assert.match(html, /<p>first <strong>paragraph<\/strong><\/p>\s*<p><a href="https:\/\/example.com">link<\/a> and <code>code<\/code><br>continued<\/p>\s*<hr>\s*<p>after<\/p>/);
  assert.doesNotMatch(html, /<h2\b/);
});

test('Notion divider is repaired in content reparsed after HTML tables and lists', async () => {
  const html = await render('<table>\n<tr><td>cell</td></tr>\n</table>\nafter table\n---\n## Heading\n1. item\nafter list\n---\nlast');
  assert.match(html, /<\/table>\s*<p>after table<\/p>\s*<hr>/);
  assert.match(html, /<\/ol>\s*<p>after list<\/p>\s*<hr>\s*<p>last<\/p>/);
  assert.equal((html.match(/<h2\b/g) || []).length, 1);
});

test('Notion dividers inside quotes and list items do not turn their paragraphs into headings', async () => {
  const html = await render('> quote\n> ---\n\n- item\n  ---');
  assert.match(html, /<blockquote>\s*<p>quote<\/p>\s*<hr>\s*<\/blockquote>/);
  assert.match(html, /<li>item\s*<hr>\s*<\/li>/);
  assert.doesNotMatch(html, /<h2\b/);
});

test('ordinary Markdown setext headings and explicit Notion headings are preserved', async () => {
  assert.match(await render('Title\n---', false), /<h2[^>]*>Title<\/h2>/);
  const source = '# First\n\n## Second\n\n### Third\n\nUnderlined\n===\n\n---';
  assert.equal((await render(source)).replace(marker.trim() + '\n', ''), await render(source, false));
});

test('divider examples inside fenced, indented and inline code stay unchanged', async () => {
  const source = '```markdown\nparagraph\n---\n```\n\n~~~text\nparagraph\n---\n~~~\n\n    paragraph\n    ---\n\n`paragraph\n---`\n\n\\---';
  assert.equal((await render(source)).replace(marker.trim() + '\n', ''), await render(source, false));
});

test('walking nested blocks preserves quoted lists and nested code examples', async () => {
  const source = '> - first\n> - second\n>\n> paragraph\n\n- example\n  ```markdown\n  paragraph\n  ---\n  ```';
  assert.equal((await render(source)).replace(marker.trim() + '\n', ''), await render(source, false));
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

test('Notion table cells render hyperlinks with their labels and destinations', async () => {
  const source = '<table header-row="true">\n<tr><td>API</td><td>Role</td></tr>\n<tr><td>[getTargetList](https://example.com/gettargetlist)</td><td>List targets</td></tr>\n</table>';
  const html = await render(source);
  assert.match(html, /<td>\s*<a href="https:\/\/example.com\/gettargetlist">getTargetList<\/a>\s*<\/td>/);
  assert.doesNotMatch(html, /\[getTargetList\]\(/);
  assert.equal((html.match(/<tr>/g) || []).length, 2);
  assert.equal((html.match(/<td>/g) || []).length, 4);
});

test('Notion table cell formatting preserves complex URLs, inline code, breaks and HTML attributes', async () => {
  const source = '<table><tr><th scope="col">**API**</th><td colspan="2">[**guide**](https://example.com/a_(b)?x=1&y=2 "API guide")<br>`undo <id>` and *text* &amp; more</td></tr></table>';
  const html = await render(source);
  assert.match(html, /<th scope="col">\s*<strong>API<\/strong>\s*<\/th>/);
  assert.match(html, /<td colspan="2">/);
  assert.match(html, /<a href="https:\/\/example.com\/a_\(b\)\?x=1&#x26;y=2" title="API guide">\s*<strong>guide<\/strong>\s*<\/a>/);
  assert.match(html, /<br>/);
  assert.match(html, /<code>undo &#x3C;id><\/code>/);
  assert.match(html, /<em>text<\/em>/);
  assert.doesNotMatch(html, /<id>/);
});

test('Notion table links coexist with existing HTML links and trailing paragraphs and dividers', async () => {
  const source = '<table><tr><td><a href="https://example.com/existing">existing</a> and [second](https://example.com/second)</td></tr></table>\nafter\n---\n## Heading\n<table><tr><td>[third](https://example.com/third)</td></tr></table>';
  const html = await render(source);
  assert.equal((html.match(/<a href=/g) || []).length, 3);
  assert.equal((html.match(/<table>/g) || []).length, 2);
  assert.match(html, /<\/table>\s*<p>after<\/p>\s*<hr>\s*<h2/);
});

test('ordinary HTML tables and Markdown link examples inside code remain literal', async () => {
  const table = '<table><tr><td>[label](https://example.com)</td></tr></table>';
  const ordinary = await render(table, false);
  assert.match(ordinary, /\[label\]\(https:\/\/example.com\)/);
  assert.doesNotMatch(ordinary, /<a href=/);
  const source = '```html\n' + table + '\n```\n\n<table><tr><td>`[label](https://example.com)`</td></tr></table>';
  const html = await render(source);
  assert.doesNotMatch(html, /<a href=/);
  assert.match(html, /<td>\s*<code>\[label\]\(https:\/\/example.com\)<\/code>\s*<\/td>/);
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

test('code following a Notion HTML table retains blank lines, indentation and literal Markdown', async () => {
  for (const newline of ['\n', '\r\n']) {
    for (const fence of ['```', '~~~']) {
      const code = '[Debian 계열]\nDebian\n└── Ubuntu\n\n[Red Hat 계열]\n    └── RHEL\n\n<table>literal</table>\n## literal heading\n**literal emphasis**';
      const source = '<table>\n<tr><td>[link](https://example.com)</td></tr>\n</table>\n## Map\n' + fence + 'text\n' + code + '\n' + fence + '\nafter code\n<table>\n<tr><td>last cell</td></tr>\n</table>\nlast paragraph';
      const html = await render(source.replaceAll('\n', newline));
      const expected = await render(('```text\n' + code + '\n```').replaceAll('\n', newline), false);
      assert.ok(html.includes(expected), 'the entire code block should render unchanged');
      assert.equal((html.match(/<pre\b/g) || []).length, 1);
      assert.equal((html.match(/<table>/g) || []).length, 2);
      assert.equal((html.match(/<h2\b/g) || []).length, 1);
      assert.match(html, /<a href="https:\/\/example.com">link<\/a>/);
      assert.match(html, /<\/pre>\s*<p>after code<\/p>\s*<table>/);
      assert.match(html, /<\/table>\s*<p>last paragraph<\/p>/);
    }
  }
});

test('published Linux distribution map keeps all five families in one complete code block', async () => {
  const source = await readFile(new URL('../src/content/blog/linux-distribution-families-and-relationships.md', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf(marker.trim()));
  const html = await render(body, false);
  const blocks = [...html.matchAll(/<pre\b[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g)];
  assert.equal(blocks.length, 2, 'only the map and the Red Hat timeline should be code blocks');
  for (const family of ['Debian 계열', 'Red Hat 계열', 'SUSE 계열', 'Arch 계열', '기타 독립 배포판']) {
    assert.ok(blocks[0][1].includes(`[${family}]`), `${family} should be inside the map`);
    assert.ok(!html.includes(`<p>[${family}]</p>`));
  }
  const originalMap = /```plain text\r?\n([\s\S]*?)\r?\n```/.exec(body)[1];
  const expected = await render('```plain text\n' + originalMap + '\n```', false);
  assert.ok(html.includes(expected), 'preserve the complete original map, including spacing');
  assert.match(html, /<\/pre>\s*<p>Red Hat 계열은/);
  assert.equal((html.match(/<table\b/g) || []).length, 4);
  assert.equal((html.match(/<h2\b/g) || []).length, 7);
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

test('published rpm/yum/dnf article renders the reported sentence as body text before a divider', async () => {
  const source = await readFile(new URL('../src/content/blog/rpm-yum-dnf-package-management.md', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf(marker.trim()));
  const html = await render(body, false);
  assert.match(html, /<p>그래서 <code>yum install<\/code>을 입력해도 실제로는 dnf가 동작한다\.<\/p>\s*<hr>/);
  assert.doesNotMatch(html, /<h2[^>]*>그래서/);
  assert.match(html, /<h2[^>]*>dnf install은 실제로 무슨 일을 할까\?<\/h2>/);
});

test('published NLB article keeps all three API documentation links in their table cells', async () => {
  const source = await readFile(new URL('../src/content/blog/ncp-udp-nlb-target-automation.md', import.meta.url), 'utf8');
  const html = await render(source.slice(source.indexOf(marker.trim())), false);
  for (const label of ['getTargetList', 'removeTarget', 'addTarget']) {
    const url = `https://api.ncloud-docs.com/docs/networking-vloadbalancer-targetgroup-${label.toLowerCase()}`;
    assert.ok(html.includes(`<a href="${url}">${label}</a>`), `${label} should be a hyperlink`);
    assert.ok(!html.includes(`[${label}](${url})`), `${label} should not show literal Markdown`);
  }
});
