export const NOTION_API_VERSION = '2026-03-11';
export const NOTION_API_BASE_URL = 'https://api.notion.com/v1';

export function getRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export async function parseResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function getErrorDetail(body) {
  if (!body || typeof body !== 'object') {
    return 'No response body returned.';
  }

  const details = [];

  if (typeof body.code === 'string') {
    details.push(`code=${body.code}`);
  }

  if (typeof body.message === 'string') {
    details.push(`message=${body.message}`);
  }

  return details.length > 0 ? details.join(', ') : 'No Notion error details returned.';
}

export async function notionRequest({ token, path, method = 'GET', body }) {
  const response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(
      `Notion API request failed with HTTP ${response.status} ${response.statusText}. ${getErrorDetail(responseBody)}`,
    );
  }

  return responseBody;
}
