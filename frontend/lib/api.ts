async function getToken(): Promise<string> {
  const res = await fetch("/api/token");
  if (!res.ok) throw new Error("Not authenticated");
  const json = await res.json();
  return json.token;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function apiFetch(path: string) {
  const token = await getToken();
  const res = await fetch(BASE + path, { headers: { Authorization: "Bearer " + token } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Request failed");
  return json;
}

export async function apiPost(path: string, body: unknown) {
  const token = await getToken();
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Request failed");
  return json;
}
