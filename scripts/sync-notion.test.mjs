import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { getBlogPathForSlug, localizeMarkdownImages, validateSlug } from './sync-notion.mjs';

const execFileAsync = promisify(execFile);

test('validateSlug accepts the generated markdown slug format', () => {
  assert.deepEqual(validateSlug('http-redirect-test'), []);
  assert.deepEqual(validateSlug('ncp-101'), []);
});

test('validateSlug rejects path traversal and unsafe filename values', () => {
  const unsafeSlugs = [
    '',
    'HTTP',
    'bad_slug',
    '-bad',
    'bad-',
    'bad--slug',
    '../secret',
    '..',
    'blog/post',
    'blog\\post',
    'C:\\secret',
  ];

  for (const slug of unsafeSlugs) {
    assert.notEqual(validateSlug(slug).length, 0, `${slug} should be rejected`);
  }
});

test('getBlogPathForSlug resolves only a markdown file inside the blog directory', async () => {
  const tempDir = await mkTempDir();

  try {
    const filePath = getBlogPathForSlug('safe-post', tempDir);
    assert.equal(filePath, path.resolve(tempDir, 'safe-post.md'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('localizeMarkdownImages downloads external markdown images and rewrites links', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(Buffer.from('fake png'), {
      status: 200,
      headers: {
        'content-type': 'image/png',
      },
    });

  try {
    const result = await localizeMarkdownImages({
      post: { slug: 'unit-image-post' },
      markdown: 'Before\n\n![diagram](https://example.com/notion-image.png?download=1)\n\nAfter',
      dryRun: true,
      assetChanges: [],
    });

    assert.equal(result.assets.length, 1);
    assert.match(result.markdown, /!\[diagram\]\(\/notion-assets\/unit-image-post\/image-001\.png\)/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(path.resolve('.tmp', 'notion-sync-assets-dry-run', 'unit-image-post'), {
      recursive: true,
      force: true,
    });
  }
});

test('localizeMarkdownImages downloads image URLs, not links inside Notion captions', async (t) => {
  const requestedUrls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requestedUrls.push(url);
    return new Response('fake png', { headers: { 'content-type': 'image/png' } });
  });
  const slug = 'unit-linked-image-captions';
  t.after(() => rm(path.resolve('.tmp', 'notion-sync-assets-dry-run', slug), { recursive: true, force: true }));
  const captions = [
    '[**example.com**](http://example.com)에 등록된 DNS A 레코드',
    '**hosts 수정 전 **[**example.com**](http://example.com)** 접속 모습**',
    '[**http://example.com으로**](http://example.com으로)** 접속한 모습**',
  ];
  const urls = captions.map((_, index) => `https://example.com/image-${index}.png?download=1&signature=fake`);
  const markdown = `Before\n\n${captions.map((caption, index) => `![${caption}](${urls[index]})`).join('\n')}\n\nAfter`;

  const result = await localizeMarkdownImages({ post: { slug }, markdown, dryRun: true, assetChanges: [] });

  assert.deepEqual(requestedUrls, urls);
  assert.equal(result.assets.length, captions.length);
  assert.equal(result.markdown, urls.reduce(
    (source, url, index) => source.replace(url, `/notion-assets/${slug}/image-${String(index + 1).padStart(3, '0')}.png`),
    markdown,
  ));
});

test('localizeMarkdownImages preserves escaped brackets, angle URLs, titles and adjacent links', async (t) => {
  const requestedUrls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requestedUrls.push(url);
    return new Response('fake png', { headers: { 'content-type': 'image/png' } });
  });
  const slug = 'unit-image-caption-syntax';
  t.after(() => rm(path.resolve('.tmp', 'notion-sync-assets-dry-run', slug), { recursive: true, force: true }));
  const url = 'https://example.com/image.png?download=1&signature=fake';
  const markdown = String.raw`[before](https://example.com) ![\[DNS\] [first [nested]](https://example.com/first) and [second](https://example.com/second)](<${url}> "image title") [after](https://example.com/after)`;

  const result = await localizeMarkdownImages({ post: { slug }, markdown, dryRun: true, assetChanges: [] });

  assert.deepEqual(requestedUrls, [url]);
  assert.equal(result.markdown, markdown.replace(url, `/notion-assets/${slug}/image-001.png`));
});

test('localizeMarkdownImages does not download caption links when the image is local or incomplete', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('No external image should be downloaded'));
  const slug = 'unit-local-image-captions';
  const markdown = '![caption [link](https://example.com/caption)](/local.png)\n\n![[link](https://example.com/incomplete)';

  const result = await localizeMarkdownImages({ post: { slug }, markdown, dryRun: true, assetChanges: [] });

  assert.deepEqual(result.assets, []);
  assert.equal(result.markdown, markdown);
});

test('git add plus cached diff detects new, modified, and deleted blog files', async () => {
  const tempDir = await mkTempDir();

  try {
    await execFileAsync('git', ['init'], { cwd: tempDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
    await execFileAsync('git', ['config', 'user.name', 'Sync Test'], { cwd: tempDir });
    await mkdir(path.join(tempDir, 'src', 'content', 'blog'), { recursive: true });

    const trackedFile = path.join(tempDir, 'src', 'content', 'blog', 'tracked.md');
    const deletedFile = path.join(tempDir, 'src', 'content', 'blog', 'deleted.md');
    const newFile = path.join(tempDir, 'src', 'content', 'blog', 'new.md');

    await writeFile(trackedFile, 'old\n', 'utf8');
    await writeFile(deletedFile, 'remove me\n', 'utf8');
    await execFileAsync('git', ['add', 'src/content/blog'], { cwd: tempDir });
    await execFileAsync('git', ['commit', '-m', 'seed'], { cwd: tempDir });

    await writeFile(trackedFile, 'new\n', 'utf8');
    await writeFile(newFile, 'created\n', 'utf8');
    await rm(deletedFile);
    await execFileAsync('git', ['add', 'src/content/blog'], { cwd: tempDir });

    await assert.rejects(
      execFileAsync('git', ['diff', '--cached', '--quiet'], { cwd: tempDir }),
      /Command failed/,
    );

    const { stdout } = await execFileAsync('git', ['diff', '--cached', '--name-status'], { cwd: tempDir });
    assert.match(stdout, /^M\s+src\/content\/blog\/tracked\.md/m);
    assert.match(stdout, /^A\s+src\/content\/blog\/new\.md/m);
    assert.match(stdout, /^D\s+src\/content\/blog\/deleted\.md/m);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function mkTempDir() {
  return await mkdtemp(path.join(os.tmpdir(), 'notion-sync-test-'));
}
