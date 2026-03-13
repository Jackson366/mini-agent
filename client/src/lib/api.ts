export class ApiError extends Error {
  status: number;
  responseText: string;

  constructor(message: string, status: number, responseText: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.responseText = responseText;
  }
}

const getErrorMessage = (status: number, responseText: string): string => {
  const parsed = (() => {
    try {
      return JSON.parse(responseText) as { error?: string; message?: string };
    } catch {
      return null;
    }
  })();

  return parsed?.error || parsed?.message || `Request failed with status ${status}`;
};

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.ok) return res;

  const responseText = await res.text();
  throw new ApiError(getErrorMessage(res.status, responseText), res.status, responseText);
}

export async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  return res.json() as Promise<T>;
}
