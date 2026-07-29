import 'dotenv/config';

import { getRequiredEnv, notionRequest, NOTION_API_VERSION } from './lib/notion.mjs';

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

async function retrieveDatabase({ token, databaseId }) {
  return notionRequest({
    token,
    path: `/databases/${encodeURIComponent(databaseId)}`,
  });
}

function printDataSources(database) {
  const dataSources = database?.data_sources;

  if (!Array.isArray(dataSources) || dataSources.length === 0) {
    throw new Error('No data sources were returned for the provided database ID.');
  }

  console.log(`Notion API version: ${NOTION_API_VERSION}`);
  console.log(`Found ${dataSources.length} data source(s):`);

  for (const dataSource of dataSources) {
    const name = dataSource?.name || '(unnamed)';
    const id = dataSource?.id || '(missing id)';
    console.log(`- ${name}: ${id}`);
  }
}

async function main() {
  const token = getRequiredEnv('NOTION_API_TOKEN');
  const databaseId = getRequiredEnv('NOTION_DATABASE_ID');
  const database = await retrieveDatabase({ token, databaseId });

  printDataSources(database);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
