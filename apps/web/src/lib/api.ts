export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error ?? "Cererea nu a putut fi procesată.");
  return data as T;
}
