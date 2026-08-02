import 'dotenv/config';

import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRequiredEnv, notionRequest, NOTION_API_VERSION } from './lib/notion.mjs';

const PUBLISH_STATUS = '발행 대기';
const DONE_STATUS = '발행 완료';
const DELETE_PENDING_STATUS = '삭제 대기';
const DELETED_STATUS = '삭제 완료';
const FINALIZE_MISSING_DELETE_FILES = false;
const ACTION_PUBLISH = 'publish';
const ACTION_DELETE = 'delete';
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
const publicDir = path.join(rootDir, 'public');
const notionAssetsDir = path.join(publicDir, 'notion-assets');
const tmpDir = path.join(rootDir, '.tmp');
const dryRunDir = path.join(tmpDir, 'notion-sync-dry-run');
const dryRunAssetsDir = path.join(tmpDir, 'notion-sync-assets-dry-run');
const assetRollbackDir = path.join(tmpDir, 'notion-sync-asset-rollback');
const assetStagingDir = path.join(tmpDir, 'notion-sync-assets-staging');
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

export function validateSlug(slug) {
  const errors = [];

  if (!slug) errors.push('Slug is empty.');
  if (!/^[a-z0-9-]+$/.test(slug)) errors.push('Slug must contain only lowercase letters, numbers, and hyphens.');
  if (slug.startsWith('-') || slug.endsWith('-')) errors.push('Slug must not start or end with a hyphen.');
  if (slug.includes('--')) errors.push('Slug must not contain consecutive hyphens.');
  if (slug.includes('..')) errors.push('Slug must not contain parent directory segments.');
  if (slug.includes('/') || slug.includes('\\')) errors.push('Slug must not contain slashes.');
  if (/^[a-zA-Z]:/.test(slug)) errors.push('Slug must not contain a drive letter.');
  if (path.isAbsolute(slug)) errors.push('Slug must not be an absolute path.');

  return errors;
}

function validatePublishPost(post) {
  const errors = [];

  if (!post.pageId) errors.push('Missing page ID.');
  if (!post.title) errors.push('Missing title.');
  if (!post.slug) errors.push('Missing Slug.');
  if (!post.description) errors.push('Missing description.');
  if (!post.pubDate) errors.push('Missing 작성일.');

  errors.push(...validateSlug(post.slug));

  return errors;
}

function validateDeletePost(post) {
  const errors = [];

  if (!post.pageId) errors.push('Missing page ID.');
  if (!post.slug) errors.push('Missing Slug.');

  errors.push(...validateSlug(post.slug));

  return errors;
}

export function getBlogPathForSlug(slug, outputDir = blogDir) {
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

function getAssetDirForSlug(slug, dryRun) {
  return path.join(dryRun ? dryRunAssetsDir : notionAssetsDir, slug);
}

function getAssetMarkdownPath(slug, fileName) {
  return `/notion-assets/${slug}/${fileName}`;
}

function getAssetBackupDirForSlug(slug) {
  return path.join(assetRollbackDir, slug);
}

function getImageExtension({ url, contentType }) {
  const contentTypeToExtension = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/gif', '.gif'],
    ['image/webp', '.webp'],
    ['image/svg+xml', '.svg'],
    ['image/avif', '.avif'],
  ]);
  const normalizedContentType = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  const extensionFromContentType = contentTypeToExtension.get(normalizedContentType);

  if (extensionFromContentType) {
    return extensionFromContentType;
  }

  try {
    const extensionFromUrl = path.extname(new URL(url).pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'].includes(extensionFromUrl)) {
      return extensionFromUrl === '.jpeg' ? '.jpg' : extensionFromUrl;
    }
  } catch {
    // Fall through to a safe default when the URL cannot be parsed.
  }

  return '.jpg';
}

async function directoryExists(dirPath) {
  try {
    return (await stat(dirPath)).isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;

    throw error;
  }
}

async function backupAssetDir({ slug, dryRun, assetChanges }) {
  if (dryRun) {
    return;
  }

  const assetDir = getAssetDirForSlug(slug, false);
  const backupDir = getAssetBackupDirForSlug(slug);
  const existed = await directoryExists(assetDir);

  await rm(backupDir, { recursive: true, force: true });

  if (existed) {
    await mkdir(path.dirname(backupDir), { recursive: true });
    await cp(assetDir, backupDir, { recursive: true });
  }

  assetChanges.push({ slug, assetDir, backupDir, existed });
}

async function rollbackAssetChanges(assetChanges) {
  for (const change of assetChanges.toReversed()) {
    await rm(change.assetDir, { recursive: true, force: true });

    if (change.existed) {
      await mkdir(path.dirname(change.assetDir), { recursive: true });
      await cp(change.backupDir, change.assetDir, { recursive: true });
    }

    await rm(change.backupDir, { recursive: true, force: true });
  }
}

async function downloadImageAsset({ url, slug, index, outputDir, finalDir }) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Image download failed with HTTP ${response.status} ${response.statusText}.`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const extension = getImageExtension({ url, contentType });
  const fileName = `image-${String(index).padStart(3, '0')}${extension}`;
  const filePath = path.join(outputDir, fileName);
  const bytes = Buffer.from(await response.arrayBuffer());

  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, bytes);

  return {
    fileName,
    relativePath: path.relative(rootDir, path.join(finalDir, fileName)),
    markdownPath: getAssetMarkdownPath(slug, fileName),
  };
}

export async function localizeMarkdownImages({ post, markdown, dryRun, assetChanges }) {
  const imagePattern = /!\[([^\]\r\n]*)\]\((<https?:\/\/[^>\s)]+>|https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/gi;
  const matches = [...markdown.matchAll(imagePattern)];
  const finalAssetDir = getAssetDirForSlug(post.slug, dryRun);
  const outputDir = dryRun ? finalAssetDir : path.join(assetStagingDir, post.slug);

  if (matches.length === 0) {
    await backupAssetDir({ slug: post.slug, dryRun, assetChanges });
    await rm(finalAssetDir, { recursive: true, force: true });
    return { markdown, assets: [] };
  }

  await rm(outputDir, { recursive: true, force: true });

  let localized = '';
  let cursor = 0;
  const assets = [];

  for (const [index, match] of matches.entries()) {
    const [fullMatch, altText, rawUrl] = match;
    const matchIndex = match.index ?? cursor;
    const url = rawUrl.startsWith('<') && rawUrl.endsWith('>') ? rawUrl.slice(1, -1) : rawUrl;
    const asset = await downloadImageAsset({
      url,
      slug: post.slug,
      index: index + 1,
      outputDir,
      finalDir: finalAssetDir,
    });

    localized += markdown.slice(cursor, matchIndex);
    localized += `![${altText}](${asset.markdownPath})`;
    cursor = matchIndex + fullMatch.length;
    assets.push(asset);
  }

  localized += markdown.slice(cursor);

  if (!dryRun) {
    await backupAssetDir({ slug: post.slug, dryRun, assetChanges });
    await rm(finalAssetDir, { recursive: true, force: true });
    await mkdir(path.dirname(finalAssetDir), { recursive: true });
    await cp(outputDir, finalAssetDir, { recursive: true });
    await rm(outputDir, { recursive: true, force: true });
  }

  return { markdown: localized, assets };
}

async function queryPostsByStatus({ token, dataSourceId, status }) {
  const results = [];
  let nextCursor;

  do {
    const body = {
      page_size: 100,
      filter: {
        property: PROPERTIES.status,
        status: {
          equals: status,
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

async function readTextFileIfExists(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function isGeneratedPostContent(content) {
  return content.includes(GENERATED_MARKER) || content.includes('notionPageId:');
}

async function writePostFile({ post, markdown, dryRun }) {
  const outputDir = dryRun ? dryRunDir : blogDir;
  const filePath = getBlogPathForSlug(post.slug, outputDir);
  const content = renderMarkdownFile(post, markdown);
  const previousContent = await readTextFileIfExists(filePath);

  await mkdir(outputDir, { recursive: true });

  if (!dryRun && previousContent && !isGeneratedPostContent(previousContent)) {
    throw new Error(`Refusing to overwrite non-generated existing file: ${path.relative(rootDir, filePath)}`);
  }

  await writeFile(filePath, content, 'utf8');

  return {
    action: ACTION_PUBLISH,
    filePath,
    relativePath: path.relative(rootDir, filePath),
    existed: previousContent !== null,
    previousContent,
  };
}

async function deletePostFile({ post, dryRun }) {
  const filePath = getBlogPathForSlug(post.slug);
  const relativePath = path.relative(rootDir, filePath);
  const previousContent = await readTextFileIfExists(filePath);

  if (previousContent === null) {
    return {
      action: ACTION_DELETE,
      filePath,
      relativePath,
      existed: false,
      previousContent: null,
      deleted: false,
      fileMissing: true,
    };
  }

  if (!isGeneratedPostContent(previousContent)) {
    throw new Error(`Refusing to delete non-generated existing file: ${relativePath}`);
  }

  if (!dryRun) {
    await rm(filePath, { force: true });
  }

  return {
    action: ACTION_DELETE,
    filePath,
    relativePath,
    existed: true,
    previousContent,
    deleted: !dryRun,
    fileMissing: false,
  };
}

async function rollbackFileChanges(changes) {
  for (const change of changes.toReversed()) {
    if (change.action === ACTION_PUBLISH) {
      if (change.previousContent === null) {
        await rm(change.filePath, { force: true });
      } else {
        await writeFile(change.filePath, change.previousContent, 'utf8');
      }
    } else if (change.action === ACTION_DELETE && change.previousContent !== null) {
      await writeFile(change.filePath, change.previousContent, 'utf8');
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

async function updateNotionPublishedPage({ token, pageId, publishedUrl }) {
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

async function updateNotionDeletedPage({ token, pageId }) {
  await notionRequest({
    token,
    method: 'PATCH',
    path: `/pages/${encodeURIComponent(pageId)}`,
    body: {
      properties: {
        [PROPERTIES.status]: {
          status: {
            name: DELETED_STATUS,
          },
        },
        [PROPERTIES.publishedUrl]: {
          url: null,
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
        missingDeleteFilesFinalize: FINALIZE_MISSING_DELETE_FILES,
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
    publish: {
      pendingCount: 0,
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      notionUpdateSuccessCount: 0,
      notionUpdateFailureCount: 0,
    },
    delete: {
      pendingCount: 0,
      successCount: 0,
      fileMissingCount: 0,
      skippedCount: 0,
      failedCount: 0,
      notionUpdateSuccessCount: 0,
      notionUpdateFailureCount: 0,
    },
    git: {
      createdFiles: [],
      updatedFiles: [],
      deletedFiles: [],
    },
  };
}

function getActionableSuccessCount(stats) {
  return stats.publish.successCount + stats.delete.successCount;
}

function getPendingCount(stats) {
  return stats.publish.pendingCount + stats.delete.pendingCount;
}

function getFailureCount(stats) {
  return stats.publish.failedCount + stats.delete.failedCount;
}

function printStats(stats) {
  console.log('Summary:');
  console.log('Publish:');
  console.log(`- Pending publish posts: ${stats.publish.pendingCount}`);
  console.log(`- Generated or updated: ${stats.publish.successCount}`);
  console.log(`- Skipped: ${stats.publish.skippedCount}`);
  console.log(`- Failed: ${stats.publish.failedCount}`);
  console.log(`- Notion publish updates succeeded: ${stats.publish.notionUpdateSuccessCount}`);
  console.log(`- Notion publish updates failed: ${stats.publish.notionUpdateFailureCount}`);
  console.log('Delete:');
  console.log(`- Pending delete posts: ${stats.delete.pendingCount}`);
  console.log(`- Deleted: ${stats.delete.successCount}`);
  console.log(`- File missing: ${stats.delete.fileMissingCount}`);
  console.log(`- Skipped: ${stats.delete.skippedCount}`);
  console.log(`- Failed: ${stats.delete.failedCount}`);
  console.log(`- Notion delete updates succeeded: ${stats.delete.notionUpdateSuccessCount}`);
  console.log(`- Notion delete updates failed: ${stats.delete.notionUpdateFailureCount}`);
  console.log('Git:');
  console.log(`- Created files: ${stats.git.createdFiles.length}`);
  for (const file of stats.git.createdFiles) console.log(`  - ${file}`);
  console.log(`- Updated files: ${stats.git.updatedFiles.length}`);
  for (const file of stats.git.updatedFiles) console.log(`  - ${file}`);
  console.log(`- Deleted files: ${stats.git.deletedFiles.length}`);
  for (const file of stats.git.deletedFiles) console.log(`  - ${file}`);
}

async function getPublishAndDeletePosts({ token, dataSourceId }) {
  const [publishPages, deletePages] = await Promise.all([
    queryPostsByStatus({ token, dataSourceId, status: PUBLISH_STATUS }),
    queryPostsByStatus({ token, dataSourceId, status: DELETE_PENDING_STATUS }),
  ]);

  return {
    publishPosts: publishPages.map(parsePostPage),
    deletePosts: deletePages.map(parsePostPage),
  };
}

async function runQuery() {
  const token = getRequiredEnv('NOTION_API_TOKEN');
  const dataSourceId = await getDataSourceId({ token, allowDatabaseFallback: true });
  const { publishPosts, deletePosts } = await getPublishAndDeletePosts({ token, dataSourceId });
  const stats = createStats();
  stats.publish.pendingCount = publishPosts.length;
  stats.delete.pendingCount = deletePosts.length;

  console.log(`Notion API version: ${NOTION_API_VERSION}`);
  console.log(`Pending publish posts: ${publishPosts.length}`);
  console.log(`Pending delete posts: ${deletePosts.length}`);

  console.log('Publish:');
  for (const post of publishPosts) {
    const validationErrors = validatePublishPost(post);
    const status = validationErrors.length === 0 ? 'valid' : `invalid: ${validationErrors.join(' ')}`;
    console.log(`- ${post.title || '(untitled)'} [${post.slug || 'no-slug'}] ${status}`);
  }

  console.log('Delete:');
  for (const post of deletePosts) {
    const validationErrors = validateDeletePost(post);
    let status = validationErrors.length === 0 ? 'valid' : `invalid: ${validationErrors.join(' ')}`;

    if (validationErrors.length === 0) {
      const filePath = getBlogPathForSlug(post.slug);
      const content = await readTextFileIfExists(filePath);
      status = content === null ? 'file missing; Notion status will stay unchanged' : 'file exists';
    }

    console.log(`- ${post.title || post.pageId || '(untitled)'} [${post.slug || 'no-slug'}] ${status}`);
  }

  printStats(stats);
  return { stats };
}

async function handlePublishPost({ token, blogBaseUrl, post, dryRun, stats, manifestItems, fileChanges, assetChanges }) {
  const validationErrors = validatePublishPost(post);

  if (validationErrors.length > 0) {
    stats.publish.skippedCount += 1;
    console.error(`Skipping publish ${post.title || post.pageId || '(unknown page)'}: ${validationErrors.join(' ')}`);
    manifestItems.push({
      action: ACTION_PUBLISH,
      pageId: post.pageId,
      title: post.title,
      slug: post.slug,
      success: false,
      plannedStatus: DONE_STATUS,
      reason: validationErrors.join(' '),
    });
    return;
  }

  try {
    const markdown = await retrieveMarkdown({ token, pageId: post.pageId });
    const localized = await localizeMarkdownImages({ post, markdown, dryRun, assetChanges });
    const publishedUrl = joinUrl(blogBaseUrl, getPostRoute(post.slug));
    const written = await writePostFile({ post, markdown: localized.markdown, dryRun });

    fileChanges.push(written);
    stats.publish.successCount += 1;

    if (written.existed) {
      stats.git.updatedFiles.push(written.relativePath);
    } else {
      stats.git.createdFiles.push(written.relativePath);
    }

    console.log(`Prepared publish: ${post.title}`);
    console.log(`- File: ${written.relativePath}`);
    console.log(`- Frontmatter: title, description, pubDate${post.category ? ', category' : ''}${post.tags.length ? ', tags' : ''}`);
    console.log(`- Planned URL: ${publishedUrl}`);

    if (localized.assets.length > 0) {
      console.log(`- Images localized: ${localized.assets.length}`);
      for (const asset of localized.assets) {
        console.log(`  - ${asset.relativePath}`);
      }
    } else if (hasExternalMarkdownImages(markdown)) {
      console.log('- Image note: external markdown image URLs were detected but no assets were localized.');
    }

    manifestItems.push({
      action: ACTION_PUBLISH,
      pageId: post.pageId,
      title: post.title,
      slug: post.slug,
      file: path.relative(rootDir, getBlogPathForSlug(post.slug)),
      assets: localized.assets.map((asset) => asset.relativePath),
      publishedUrl,
      plannedStatus: DONE_STATUS,
      success: true,
    });
  } catch (error) {
    stats.publish.failedCount += 1;
    console.error(`Failed publish ${post.title || post.pageId}: ${error instanceof Error ? error.message : String(error)}`);
    manifestItems.push({
      action: ACTION_PUBLISH,
      pageId: post.pageId,
      title: post.title,
      slug: post.slug,
      success: false,
      plannedStatus: DONE_STATUS,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleDeletePost({ post, dryRun, stats, manifestItems, fileChanges }) {
  const validationErrors = validateDeletePost(post);

  if (validationErrors.length > 0) {
    stats.delete.failedCount += 1;
    console.error(`Skipping delete ${post.title || post.pageId || '(unknown page)'}: ${validationErrors.join(' ')}`);
    manifestItems.push({
      action: ACTION_DELETE,
      pageId: post.pageId,
      title: post.title,
      slug: post.slug,
      success: false,
      plannedStatus: DELETED_STATUS,
      reason: validationErrors.join(' '),
    });
    return;
  }

  try {
    const deleted = await deletePostFile({ post, dryRun });

    if (deleted.fileMissing) {
      stats.delete.fileMissingCount += 1;
      stats.delete.skippedCount += 1;
      console.log(`Delete skipped; file is missing: ${post.title || post.pageId} [${post.slug}]`);
      console.log(`- Expected file: ${deleted.relativePath}`);
      manifestItems.push({
        action: ACTION_DELETE,
        pageId: post.pageId,
        title: post.title,
        slug: post.slug,
        file: deleted.relativePath,
        success: FINALIZE_MISSING_DELETE_FILES,
        plannedStatus: DELETED_STATUS,
        reason: 'File is missing; default policy keeps Notion status unchanged.',
      });
      return;
    }

    fileChanges.push(deleted);
    stats.delete.successCount += 1;
    stats.git.deletedFiles.push(deleted.relativePath);

    console.log(`${dryRun ? 'Will delete' : 'Deleted'}: ${post.title || post.pageId}`);
    console.log(`- File: ${deleted.relativePath}`);

    manifestItems.push({
      action: ACTION_DELETE,
      pageId: post.pageId,
      title: post.title,
      slug: post.slug,
      file: deleted.relativePath,
      publishedUrl: '',
      plannedStatus: DELETED_STATUS,
      success: true,
    });
  } catch (error) {
    stats.delete.failedCount += 1;
    console.error(`Failed delete ${post.title || post.pageId}: ${error instanceof Error ? error.message : String(error)}`);
    manifestItems.push({
      action: ACTION_DELETE,
      pageId: post.pageId,
      title: post.title,
      slug: post.slug,
      success: false,
      plannedStatus: DELETED_STATUS,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runGenerate({ dryRun }) {
  const token = getRequiredEnv('NOTION_API_TOKEN');
  const dataSourceId = await getDataSourceId({ token, allowDatabaseFallback: dryRun });
  const blogBaseUrl = await getBlogBaseUrl({ allowAstroSiteFallback: dryRun });
  const { publishPosts, deletePosts } = await getPublishAndDeletePosts({ token, dataSourceId });
  const stats = createStats();
  const manifestItems = [];
  const fileChanges = [];
  const assetChanges = [];

  stats.publish.pendingCount = publishPosts.length;
  stats.delete.pendingCount = deletePosts.length;

  console.log(`Notion API version: ${NOTION_API_VERSION}`);
  console.log(`Pending publish posts: ${publishPosts.length}`);
  console.log(`Pending delete posts: ${deletePosts.length}`);

  if (dryRun) {
    await rm(dryRunDir, { recursive: true, force: true });
    await rm(dryRunAssetsDir, { recursive: true, force: true });
  }

  if (publishPosts.length > 0) {
    console.log('Will generate:');
  }
  for (const post of publishPosts) {
    await handlePublishPost({ token, blogBaseUrl, post, dryRun, stats, manifestItems, fileChanges, assetChanges });
  }

  if (deletePosts.length > 0) {
    console.log('Will delete:');
  }
  for (const post of deletePosts) {
    await handleDeletePost({ post, dryRun, stats, manifestItems, fileChanges });
  }

  if (!dryRun) {
    await writeManifest(manifestItems);
    console.log(`Manifest written: ${path.relative(rootDir, manifestPath)}`);
  }

  printStats(stats);
  return { stats, fileChanges, assetChanges, manifestItems };
}

async function runFinalize() {
  const token = getRequiredEnv('NOTION_API_TOKEN');
  const items = await readManifest();
  const stats = createStats();

  stats.publish.pendingCount = items.filter((item) => item.action === ACTION_PUBLISH).length;
  stats.delete.pendingCount = items.filter((item) => item.action === ACTION_DELETE).length;
  stats.publish.successCount = stats.publish.pendingCount;
  stats.delete.successCount = stats.delete.pendingCount;
  stats.git.createdFiles = items.filter((item) => item.action === ACTION_PUBLISH).map((item) => item.file).filter(Boolean);
  stats.git.deletedFiles = items.filter((item) => item.action === ACTION_DELETE).map((item) => item.file).filter(Boolean);

  for (const item of items) {
    try {
      if (item.action === ACTION_DELETE) {
        await updateNotionDeletedPage({ token, pageId: item.pageId });
        stats.delete.notionUpdateSuccessCount += 1;
        console.log(`Updated Notion delete status for slug: ${item.slug}`);
      } else {
        await updateNotionPublishedPage({ token, pageId: item.pageId, publishedUrl: item.publishedUrl });
        stats.publish.notionUpdateSuccessCount += 1;
        console.log(`Updated Notion publish status for slug: ${item.slug}`);
      }
    } catch (error) {
      if (item.action === ACTION_DELETE) {
        stats.delete.notionUpdateFailureCount += 1;
        stats.delete.failedCount += 1;
        console.error(`Failed to update Notion delete status for slug ${item.slug}: ${error instanceof Error ? error.message : String(error)}`);
      } else {
        stats.publish.notionUpdateFailureCount += 1;
        stats.publish.failedCount += 1;
        console.error(`Failed to update Notion publish status for slug ${item.slug}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  printStats(stats);

  if (stats.publish.notionUpdateFailureCount > 0 || stats.delete.notionUpdateFailureCount > 0) {
    process.exitCode = 1;
  }
}

async function runSync() {
  const { stats, fileChanges, assetChanges, manifestItems } = await runGenerate({ dryRun: false });

  if (getActionableSuccessCount(stats) === 0) {
    if (getPendingCount(stats) > 0) {
      process.exitCode = 1;
    }
    return;
  }

  try {
    await runCommand('npm', ['run', 'build']);
  } catch (error) {
    await rollbackFileChanges(fileChanges);
    await rollbackAssetChanges(assetChanges);
    await writeManifest(manifestItems.map((item) => ({ ...item, success: false, reason: 'Build failed before finalization.' })));
    throw new Error(
      `Astro build failed after Notion sync changes. Generated, updated, and deleted files from this run were rolled back. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  await runFinalize();
  await rm(assetRollbackDir, { recursive: true, force: true });

  if (getFailureCount(stats) > 0) {
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
    if (getActionableSuccessCount(stats) === 0 && getPendingCount(stats) > 0) {
      process.exitCode = 1;
    }
  } else if (mode === 'finalize') {
    await runFinalize();
  } else {
    await runSync();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
