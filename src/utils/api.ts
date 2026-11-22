export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, body, ...rest } = options;
  const reqHeaders = new Headers(headers);

  if (token) {
    reqHeaders.set('Authorization', `Bearer ${token}`);
  }
  if (body && !(body instanceof FormData) && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...rest,
    headers: reqHeaders,
    body,
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const rawText = await response.text().catch(() => '');
    if (rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(rawText);
        if (!response.ok) {
          throw new ApiError(parsed?.error || `Request failed (${response.status})`, response.status);
        }
        return parsed as T;
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
    throw new ApiError(
      response.ok
        ? 'Unexpected non-JSON response from server. Please refresh and try again.'
        : `Request failed (${response.status})`,
      response.status
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(`Invalid JSON response from server (${response.status})`, response.status);
  }

  if (!response.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${response.status})`;
    throw new ApiError(errMsg, response.status);
  }

  if (!data || typeof data !== 'object') {
    throw new ApiError('Unexpected empty response from server.', response.status);
  }

  return data as T;
}
