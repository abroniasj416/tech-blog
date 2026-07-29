# Notion Publishing

This project uses Notion as the source CMS for an Astro technical blog. Posts whose Notion `상태` value is `발행 대기` can be converted into Markdown files under `src/content/blog/` and then published through GitHub Actions.

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
| `상태` | Status (`작성 중`, `발행 대기`, `발행 완료`) | Yes |
| `Slug` | Text | Yes |
| `설명` | Text | Yes |
| `카테고리` | Select | No |
| `태그` | Multi-select | No |
| `작성일` | Date | Yes |
| `발행 URL` | URL | No |

Slug values must use lowercase English letters, numbers, and hyphens only. Slashes, backslashes, absolute paths, parent directory segments, leading/trailing hyphens, and consecutive hyphens are rejected.

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

Query pending posts and validate properties only:

```sh
npm run notion:query
```

Run a dry-run. This queries Notion, retrieves markdown, validates output, and writes only to `.tmp/notion-sync-dry-run/`:

```sh
npm run sync:notion:dry
```

Run the local publisher. This writes Markdown files, runs `npm run build`, and only then updates Notion status and `발행 URL`:

```sh
npm run sync:notion
```

The local publisher does not commit or push Git changes.

## Publishing flow

The Notion sync workflow uses a split flow to avoid marking Notion pages as published before the generated Markdown is committed, pushed, built, and deployed:

1. Query Notion for `발행 대기` posts.
2. Generate Markdown files.
3. Run the Astro build.
4. Commit and push changed Markdown files, when there are changes.
5. Upload the `dist/` Pages artifact.
6. Deploy GitHub Pages.
7. Finalize Notion pages from `.tmp/notion-sync-result.json`.

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

Invalid posts are skipped and listed in the summary. Other valid posts continue to process.

If markdown retrieval is truncated and Notion returns `unknown_block_ids`, the script attempts to fetch those IDs with the official markdown endpoint. If the content still cannot be safely completed, that post is not finalized in Notion.

If the Astro build fails during local `sync:notion`, generated files from that run are rolled back and Notion is not updated.

If GitHub push fails, the workflow stops before Pages deployment and Notion finalization.

If GitHub Pages deployment fails, Notion is not finalized.

## Image limitation

Notion markdown image URLs are currently left unchanged. Some Notion-hosted external URLs can expire. The script reports when external markdown image URLs are detected, but it does not download images into `public/images/` yet.
