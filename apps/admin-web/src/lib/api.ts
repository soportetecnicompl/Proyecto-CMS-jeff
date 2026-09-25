const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    throw new Error(`Error ${res.status} al consultar ${path}`);
  }

  return res.json();
}
