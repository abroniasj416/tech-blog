# Notion Publishing

This project uses Notion as the source CMS for an Astro technical blog. Posts whose Notion `상태` value is `발행 대기` can be converted into Markdown files under `src/content/blog/` and then published through GitHub Actions. Posts whose `상태` value is `삭제 대기` can be removed from `src/content/blog/` and finalized after the site is deployed.

The blog is published through GitHub Pages with a custom domain:

```text
https://blog.hwangsoojin.cloud/
```

Astro is configured for the custom domain root:

```js
site: 'https://blog.hwangsoojin.cloud',
```

Do not set `base` while the custom domain serves the blog from `/`.

## Notion properties

The Notion data source is expected to have these properties:

| Property | Type | Required |
| --- | --- | --- |
| `제목` | Title | Yes |
| `상태` | Status (`작성 중`, `발행 대기`, `발행 완료`, `삭제 대기`, `삭제 완료`) | Yes |
| `Slug` | Text | Yes |
| `설명` | Text | Yes |
| `카테고리` | Select | No |
| `태그` | Multi-select | No |
| `작성일` | Date | Yes |
| `발행 URL` | URL | No |

Slug values must use lowercase English letters, numbers, and hyphens only. Slashes, backslashes, absolute paths, parent directory segments, leading/trailing hyphens, and consecutive hyphens are rejected.

## Status workflow

Use these Notion status values:

```text
작성 중
발행 대기
발행 완료
삭제 대기
삭제 완료
```

Publishing:

1. Write or edit the post in Notion.
2. Set `상태` to `발행 대기`.
3. Run a dry-run locally or wait for the scheduled workflow.
4. After Markdown generation, build, commit/push, Pages deployment, and Notion finalization all succeed, the script changes the status to `발행 완료` and writes `발행 URL`.

Editing a published post:

1. Keep the same `Slug`.
2. Edit the Notion page.
3. Set `상태` back to `발행 대기`.
4. The sync updates the existing generated Markdown file.

Deleting a published post:

1. Do not delete the Notion row first.
2. Set `상태` to `삭제 대기`.
3. The sync validates `Slug` and deletes only `src/content/blog/{Slug}.md`.
4. After build, commit/push, and Pages deployment succeed, finalization changes the status to `삭제 완료` and clears `발행 URL`.
5. After `삭제 완료`, you may manually delete the Notion row if you no longer need the source record.

The script does not archive, trash, or delete Notion rows.

## Environment variables

Local `.env`:

```text
NOTION_API_TOKEN=...
NOTION_DATABASE_ID=...
NOTION_DATA_SOURCE_ID=...
BLOG_BASE_URL=...
```

For publishing with the custom domain, set `BLOG_BASE_URL` to:

```text
https://blog.hwangsoojin.cloud
```

GitHub Actions secrets:

```text
NOTION_API_TOKEN
NOTION_DATA_SOURCE_ID
BLOG_BASE_URL
```

Never commit real token values, Authorization headers, `.env`, or copied API responses containing private content.

## Local commands

Check the data source ID:

```sh
npm run notion:data-source
```

Query pending publish/delete posts and validate properties only:

```sh
npm run notion:query
```

Run a dry-run. This queries Notion, retrieves markdown for publish items, validates delete items, writes publish previews only to `.tmp/notion-sync-dry-run/`, and does not delete real files:

```sh
npm run sync:notion:dry
```

Run the local sync. This writes or deletes Markdown files, runs `npm run build`, and only then updates Notion status and `발행 URL`:

```sh
npm run sync:notion
```

The local publisher does not commit or push Git changes.

## Publishing flow

The Notion sync workflow uses a split flow to avoid marking Notion pages as published before the generated Markdown is committed, pushed, built, and deployed:

1. Query Notion for `발행 대기` and `삭제 대기` posts.
2. Generate or update Markdown files and delete only matching generated Markdown files.
3. Run the Astro build.
4. Commit and push changed Markdown files, including staged deletions, when there are changes.
5. Upload the `dist/` Pages artifact.
6. Deploy GitHub Pages.
7. Finalize Notion pages from `.tmp/notion-sync-result.json`.

The manifest stores `action: "publish"` or `action: "delete"` per successful item. It stores page ID, slug, file path, planned status, and planned URL for publish items. It never stores tokens, Authorization headers, full Notion responses, or page body markdown.

This ordering matters because GitHub does not start a new `push` workflow from a push made with the default `GITHUB_TOKEN`. The Notion sync workflow therefore deploys Pages directly after its own push instead of relying on the separate `Deploy Pages` workflow to be triggered by that automated push.

The separate `Deploy Pages` workflow still runs for normal human pushes to `main` and from manual `workflow_dispatch` runs.

## GitHub Pages settings

In the GitHub repository UI:

1. Open `Settings`.
2. Open `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Make sure Actions are allowed to read the repository and deploy Pages.

Manual runs are available from the workflow's `workflow_dispatch` button. A scheduled run also checks once per hour.

## Failure behavior

Invalid publish posts are skipped and listed in the summary. Other valid posts continue to process.

Invalid delete posts are not deleted. Unsafe Slug values are rejected before any file path is used. The script deletes only `src/content/blog/{Slug}.md`; it never searches for similar file names.

If the target delete file is missing, the default policy is conservative: the item is reported as `file missing`, no file is changed, and Notion remains `삭제 대기`. Check the slug and repository history manually. If the post is already gone from the deployed site and you want to close the Notion record, change the status manually or adjust the policy in code with care.

If a target delete file exists but does not contain the generated marker or `notionPageId`, the script refuses to delete it. This protects hand-written posts and unrelated content.

If markdown retrieval is truncated and Notion returns `unknown_block_ids`, the script attempts to fetch those IDs with the official markdown endpoint. If the content still cannot be safely completed, that post is not finalized in Notion.

If the Astro build fails during local `sync:notion`, generated, updated, and deleted files from that run are rolled back and Notion is not updated.

If GitHub push fails, the workflow stops before Pages deployment and Notion finalization.

If GitHub Pages deployment fails, Notion is not finalized.

If Notion finalization fails after Pages deployment, the Markdown and deployed site have already changed. The log distinguishes publish finalization failures from delete finalization failures so you can retry `npm run sync:notion:finalize` with the existing `.tmp/notion-sync-result.json` in the same environment, or manually update the affected Notion rows.

## Image handling

Notion markdown image URLs are temporary download URLs, so the sync downloads Markdown images into `public/notion-assets/{Slug}/` and rewrites the generated Markdown image links to those local assets.

When a post is republished with the same `Slug`, that post's asset directory is replaced from the current Notion content. If an image is removed from Notion and the post is set back to the publish-pending status, the old local image file is removed during the next sync.
