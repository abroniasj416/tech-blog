import 'dotenv/config';

import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRequiredEnv, notionRequest, NOTION_API_VERSION } from './lib/notion.mjs';

const PUBLISH_STATUS = '발행 대기';
const DONE_STATUS = '발행 완료';
const PROPERTIES = {
  title: '제목',
  status: '상태',
  slug: 'Slug',
  description: '설명',
  category: '카테고리',
  tags: '태그',
  pubDate: '작성일',
  publishedUrl: '발행 URL',
};
const GENERATED_MARKER = '<!-- notion-sync: generated -->';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blogDir = path.join(rootDir, 'src', 'content', 'blog');
const tmpDir = path.join(rootDir, '.tmp');
const dryRunDir = path.join(tmpDir, 'notion-sync-dry-run');
const manifestPath = path.join(tmpDir, 'notion-sync-result.json');

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

function getMode() {
  const args = new Set(process.argv.slice(2));

  if (args.has('--query')) return 'query';
  if (args.has('--dry-run')) return 'dry-run';
  if (args.has('--generate')) return 'generate';
  if (args.has('--finalize')) return 'finalize';
  return 'sync';
}

function getOptionalEnv(name) {
  return process.env[name]?.trim() || '';
}

async function getDataSourceId({ token, allowDatabaseFallback }) {
  const dataSourceId = getOptionalEnv('NOTION_DATA_SOURCE_ID');

  if (dataSourceId) {
    return dataSourceId;
  }

  if (!allowDatabaseFallback) {
    return getRequiredEnv('NOTION_DATA_SOURCE_ID');
  }

  const databaseId = getRequiredEnv('NOTION_DATABASE_ID');
  const database = await notionRequest({
    token,
    path: `/databases/${encodeURIComponent(databaseId)}`,
  });
  const dataSources = Array.isArray(database?.data_sources) ? database.data_sources : [];

  if (dataSources.length === 0 || typeof dataSources[0]?.id !== 'string') {
    throw new Error('NOTION_DATA_SOURCE_ID is missing and no data source could be found from NOTION_DATABASE_ID.');
  }

  console.log('Warning: NOTION_DATA_SOURCE_ID is missing; using the first data source returned by NOTION_DATABASE_ID for this read-only run.');

  return dataSources[0].id;
}

async function getBlogBaseUrl({ allowAstroSiteFallback }) {
  const blogBaseUrl = getOptionalEnv('BLOG_BASE_URL');

  if (blogBaseUrl) {
    return blogBaseUrl;
  }

  if (!allowAstroSiteFallback) {
    return getRequiredEnv('BLOG_BASE_URL');
  }

  const config = await readFile(path.join(rootDir, 'astro.config.mjs'), 'utf8');
  const siteMatch = config.match(/site:\s*['"]([^'"]+)['"]/);
  const baseMatch = config.match(/base:\s*['"]([^'"]+)['"]/);

  if (!siteMatch?.[1]) {
    throw new Error('BLOG_BASE_URL is missing and no site value could be read from astro.config.mjs.');
  }

  console.log('Warning: BLOG_BASE_URL is missing; using astro.config.mjs site/base for dry-run URL previews.');

  return joinUrl(siteMatch[1], baseMatch?.[1] ?? '/');
}

function plainText(items) {
  if (!Array.isArray(items)) {
    return '';
  }

  return items.map((item) => item?.plain_text ?? '').join('');
}

function parsePropertyValue(properties, name) {
  const property = properties?.[name];

  if (!property || typeof property !== 'object') {
    return { value: '', type: 'missing' };
  }

  switch (property.type) {
    case 'title':
      return { value: plainText(property.title).trim(), type: property.type };
    case 'rich_text':
      return { value: plainText(property.rich_text).trim(), type: property.type };
    case 'status':
      return { value: property.status?.name?.trim() ?? '', type: property.type };
    case 'select':
      return { value: property.select?.name?.trim() ?? '', type: property.type };
    case 'multi_select':
      return {
        value: Array.isArray(property.multi_select)
          ? property.multi_select.map((item) => item?.name).filter(Boolean)
          : [],
        type: property.type,
      };
    case 'date':
      return { value: property.date?.start?.trim() ?? '', type: property.type };
    case 'url':
      return { value: property.url?.trim() ?? '', type: property.type };
    default:
      return { value: '', type: property.type ?? 'unknown' };
  }
}

function parsePostPage(page) {
  const properties = page?.properties ?? {};
  const tags = parsePropertyValue(properties, PROPERTIES.tags);

  return {
    pageId: typeof page?.id === 'string' ? page.id : '',
    title: parsePropertyValue(properties, PROPERTIES.title).value,
    status: parsePropertyValue(properties, PROPERTIES.status).value,
    slug: parsePropertyValue(properties, PROPERTIES.slug).value,
    description: parsePropertyValue(properties, PROPERTIES.description).value,
    category: parsePropertyValue(properties, PROPERTIES.category).value,
    tags: Array.isArray(tags.value) ? tags.value : [],
    pubDate: parsePropertyValue(properties, PROPERTIES.pubDate).value,
    publishedUrl: parsePropertyValue(properties, PROPERTIES.publishedUrl).value,
  };
}

function validateSlug(slug) {
  const errors = [];

  if (!slug) errors.push('Slug is empty.');
  if (!/^[a-z0-9-]+$/.test(slug)) errors.push('Slug must contain only lowercase letters, numbers, and hyphens.');
  if (slug.startsWith('-') || slug.endsWith('-')) errors.push('Slug must not start or end with a hyphen.');
  if (slug.includes('--')) errors.push('Slug must not contain consecutive hyphens.');
  if (slug.includes('../') || slug.includes('..\\')) errors.push('Slug must not contain parent directory segments.');
  if (slug.includes('/') || slug.includes('\\')) errors.push('Slug must not contain slashes.');
  if (path.isAbsolute(slug)) errors.push('Slug must not be an absolute path.');

  return errors;
}

function validatePost(post) {
  const errors = [];

  if (!post.pageId) errors.push('Missing page ID.');
  if (!post.title) errors.push('Missing title.');
  if (!post.slug) errors.push('Missing Slug.');
  if (!post.description) errors.push('Missing description.');
  if (!post.pubDate) errors.push('Missing 작성일.');

  errors.push(...validateSlug(post.slug));

  return errors;
}

function getBlogPathForSlug(slug, outputDir = blogDir) {
  const filePath = path.resolve(outputDir, `${slug}.md`);
  const normalizedBase = `${path.resolve(outputDir)}${path.sep}`;

  if (!filePath.startsWith(normalizedBase)) {
    throw new Error(`Resolved file path escapes blog directory for slug: ${slug}`);
  }

  return filePath;
}

function joinUrl(baseUrl, routePath) {
  const base = baseUrl.replace(/\/+$/, '');
  const route = routePath.startsWith('/') ? routePath : `/${routePath}`;

  return `${base}${route}`;
}

function getPostRoute(slug) {
  return `/blog/${slug}/`;
}

function yamlScalar(value) {
  return JSON.stringify(value ?? '');
}

function renderFrontmatter(post) {
  const lines = [
    '---',
    `title: ${yamlScalar(post.title)}`,
    `description: ${yamlScalar(post.description)}`,
    `pubDate: ${yamlScalar(post.pubDate)}`,
  ];

  if (post.category) {
    lines.push(`category: ${yamlScalar(post.category)}`);
  }

  if (post.tags.length > 0) {
    lines.push('tags:');
    for (const tag of post.tags) {
      lines.push(`  - ${yamlScalar(tag)}`);
    }
  }

  lines.push(`notionPageId: ${yamlScalar(post.pageId)}`);
  lines.push('---');

  return lines.join('\n');
}

function renderMarkdownFile(post, markdown) {
  return `${renderFrontmatter(post)}\n\n${GENERATED_MARKER}\n\n${markdown.trim()}\n`;
}

function hasExternalMarkdownImages(markdown) {
  return /!\[[^\]]*\]\(https?:\/\/[^)]+\)/i.test(markdown);
}

async function queryPendingPosts({ token, dataSourceId }) {
  const results = [];
  let nextCursor;

  do {
    const body = {
      page_size: 100,
      filter: {
        property: PROPERTIES.status,
        status: {
          equals: PUBLISH_STATUS,
        },
      },
    };

    if (nextCursor) {
      body.start_cursor = nextCursor;
    }

    const response = await notionRequest({
      token,
      method: 'POST',
      path: `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
      body,
    });

    if (!Array.isArray(response?.results)) {
      throw new Error('Notion data source query response did not include a results array.');
    }

    results.push(...response.results);
    nextCursor = response.has_more ? response.next_cursor : undefined;
  } while (nextCursor);

  return results;
}

async function retrieveMarkdown({ token, pageId }) {
  const markdown = await retrieveMarkdownPart({ token, id: pageId });
  const unknownBlockIds = Array.isArray(markdown.unknown_block_ids) ? markdown.unknown_block_ids : [];

  if (unknownBlockIds.length === 0) {
    return markdown.markdown.trim();
  }

  const extraParts = [];

  for (const blockId of unknownBlockIds) {
    try {
      const extra = await retrieveMarkdownPart({ token, id: blockId });

      if (extra.truncated || (Array.isArray(extra.unknown_block_ids) && extra.unknown_block_ids.length > 0)) {
        throw new Error(`Additional markdown for unknown block ${blockId} is still truncated or incomplete.`);
      }

      extraParts.push(extra.markdown.trim());
    } catch (error) {
      throw new Error(
        `Markdown response included unknown blocks and block ${blockId} could not be fully retrieved: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (markdown.truncated) {
    throw new Error('Markdown response was truncated; fetched unknown block content separately but cannot safely merge it in place.');
  }

  return [markdown.markdown.trim(), ...extraParts].filter(Boolean).join('\n\n');
}

async function retrieveMarkdownPart({ token, id }) {
  const response = await notionRequest({
    token,
    path: `/pages/${encodeURIComponent(id)}/markdown`,
  });

  if (typeof response?.markdown !== 'string') {
    throw new Error('Notion markdown response did not include a markdown string.');
  }

  return response;
}

async function writePostFile({ post, markdown, dryRun }) {
  const outputDir = dryRun ? dryRunDir : blogDir;
  const filePath = getBlogPathForSlug(post.slug, outputDir);
  const content = renderMarkdownFile(post, markdown);
  let previousContent = null;

  await mkdir(outputDir, { recursive: true });

  try {
    previousContent = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  if (!dryRun && previousContent && !previousContent.includes(GENERATED_MARKER) && !previousContent.includes('notionPageId:')) {
    throw new Error(`Refusing to overwrite non-generated existing file: ${path.relative(rootDir, filePath)}`);
  }

  await writeFile(filePath, content, 'utf8');

  return {
    filePath,
    relativePath: path.relative(rootDir, filePath),
    existed: previousContent !== null,
    previousContent,
  };
}

async function rollbackWrittenFiles(writtenFiles) {
  for (const written of writtenFiles.toReversed()) {
    if (written.previousContent === null) {
      await rm(written.filePath, { force: true });
    } else {
      await writeFile(written.filePath, written.previousContent, 'utf8');
    }
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}.`));
      }
    });
  });
}

async function updateNotionPage({ token, pageId, publishedUrl }) {
  await notionRequest({
    token,
    method: 'PATCH',
    path: `/pages/${encodeURIComponent(pageId)}`,
    body: {
      properties: {
        [PROPERTIES.status]: {
          status: {
            name: DONE_STATUS,
          },
        },
        [PROPERTIES.publishedUrl]: {
          url: publishedUrl,
        },
      },
    },
  });
}

async function writeManifest(items) {
  await mkdir(tmpDir, { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        notionApiVersion: NOTION_API_VERSION,
        items,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function readManifest() {
  const content = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(content);

  if (!Array.isArray(manifest?.items)) {
    throw new Error(`Manifest does not contain an items array: ${path.relative(rootDir, manifestPath)}`);
  }

  return manifest.items.filter((item) => item?.success === true);
}

function createStats() {
  return {
    pendingCount: 0,
    successCount: 0,
    skippedCount: 0,
    failedCount: 0,
    files: [],
    notionUpdateSuccessCount: 0,
    notionUpdateFailureCount: 0,
  };
}

function printStats(stats) {
  console.log('Summary:');
  console.log(`- Pending posts queried: ${stats.pendingCount}`);
  console.log(`- Successful posts: ${stats.successCount}`);
  console.log(`- Skipped posts: ${stats.skippedCount}`);
  console.log(`- Failed posts: ${stats.failedCount}`);
  console.log(`- Files generated or updated: ${stats.files.length}`);
  for (const file of stats.files) {
    console.log(`  - ${file}`);
  }
  console.log(`- Notion updates succeeded: ${stats.notionUpdateSuccessCount}`);
  console.log(`- Notion updates failed: ${stats.notionUpdateFailureCount}`);
}

async function runQuery() {
  const token = getRequiredEnv('NOTION_API_TOKEN');
  const dataSourceId = await getDataSourceId({ token, allowDatabaseFallback: true });
  const pages = await queryPendingPosts({ token, dataSourceId });
  const posts = pages.map(parsePostPage);
  const stats = createStats();
  stats.pendingCount = posts.length;

  console.log(`Notion API version: ${NOTION_API_VERSION}`);
  console.log(`Found ${posts.length} pending post(s).`);

  for (const post of posts) {
    const validationErrors = validatePost(post);
    const status = validationErrors.length === 0 ? 'valid' : `invalid: ${validationErrors.join(' ')}`;
    console.log(`- ${post.title || '(untitled)'} [${post.slug || 'no-slug'}] ${status}`);
  }

  printStats(stats);
  return { stats };
}

async function runGenerate({ dryRun }) {
  const token = getRequiredEnv('NOTION_API_TOKEN');
  const dataSourceId = await getDataSourceId({ token, allowDatabaseFallback: dryRun });
  const blogBaseUrl = await getBlogBaseUrl({ allowAstroSiteFallback: dryRun });
  const pages = await queryPendingPosts({ token, dataSourceId });
  const posts = pages.map(parsePostPage);
  const stats = createStats();
  const manifestItems = [];
  const writtenFiles = [];

  stats.pendingCount = posts.length;

  console.log(`Notion API version: ${NOTION_API_VERSION}`);
  console.log(`Found ${posts.length} pending post(s).`);

  if (dryRun) {
    await rm(dryRunDir, { recursive: true, force: true });
  }

  for (const post of posts) {
    const validationErrors = validatePost(post);

    if (validationErrors.length > 0) {
      stats.skippedCount += 1;
      console.error(`Skipping ${post.title || post.pageId || '(unknown page)'}: ${validationErrors.join(' ')}`);
      manifestItems.push({ pageId: post.pageId, slug: post.slug, success: false, reason: validationErrors.join(' ') });
      continue;
    }

    try {
      const markdown = await retrieveMarkdown({ token, pageId: post.pageId });
      const publishedUrl = joinUrl(blogBaseUrl, getPostRoute(post.slug));
      const written = await writePostFile({ post, markdown, dryRun });

      writtenFiles.push(written);
      stats.successCount += 1;
      stats.files.push(written.relativePath);

      console.log(`Prepared ${post.title}`);
      console.log(`- File: ${written.relativePath}`);
      console.log(`- Frontmatter: title, description, pubDate${post.category ? ', category' : ''}${post.tags.length ? ', tags' : ''}`);
      console.log(`- Planned URL: ${publishedUrl}`);

      if (hasExternalMarkdownImages(markdown)) {
        console.log('- Image note: external markdown image URLs were left unchanged and may expire.');
      }

      manifestItems.push({
        pageId: post.pageId,
        slug: post.slug,
        file: path.relative(rootDir, getBlogPathForSlug(post.slug)),
        publishedUrl,
        success: true,
      });
    } catch (error) {
      stats.failedCount += 1;
      console.error(`Failed ${post.title || post.pageId}: ${error instanceof Error ? error.message : String(error)}`);
      manifestItems.push({
        pageId: post.pageId,
        slug: post.slug,
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!dryRun) {
    await writeManifest(manifestItems);
    console.log(`Manifest written: ${path.relative(rootDir, manifestPath)}`);
  }

  printStats(stats);
  return { stats, writtenFiles, manifestItems };
}

async function runFinalize() {
  const token = getRequiredEnv('NOTION_API_TOKEN');
  const items = await readManifest();
  const stats = createStats();

  stats.pendingCount = items.length;
  stats.successCount = items.length;
  stats.files = items.map((item) => item.file).filter(Boolean);

  for (const item of items) {
    try {
      await updateNotionPage({ token, pageId: item.pageId, publishedUrl: item.publishedUrl });
      stats.notionUpdateSuccessCount += 1;
      console.log(`Updated Notion page for slug: ${item.slug}`);
    } catch (error) {
      stats.notionUpdateFailureCount += 1;
      stats.failedCount += 1;
      console.error(`Failed to update Notion page for slug ${item.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  printStats(stats);

  if (stats.notionUpdateFailureCount > 0) {
    process.exitCode = 1;
  }
}

async function runSync() {
  const { stats, writtenFiles, manifestItems } = await runGenerate({ dryRun: false });

  if (stats.successCount === 0) {
    if (stats.pendingCount > 0) {
      process.exitCode = 1;
    }
    return;
  }

  try {
    await runCommand('npm', ['run', 'build']);
  } catch (error) {
    await rollbackWrittenFiles(writtenFiles);
    await writeManifest(manifestItems.map((item) => ({ ...item, success: false, reason: 'Build failed before finalization.' })));
    throw new Error(
      `Astro build failed after Markdown generation. Generated files were rolled back. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  await runFinalize();

  if (stats.failedCount > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const mode = getMode();

  if (mode === 'query') {
    await runQuery();
  } else if (mode === 'dry-run') {
    await runGenerate({ dryRun: true });
  } else if (mode === 'generate') {
    const { stats } = await runGenerate({ dryRun: false });
    if (stats.successCount === 0 && stats.pendingCount > 0) {
      process.exitCode = 1;
    }
  } else if (mode === 'finalize') {
    await runFinalize();
  } else {
    await runSync();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
