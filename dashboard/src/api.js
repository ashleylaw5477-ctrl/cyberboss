let csrfToken = "";

export function setCsrfToken(value) {
  csrfToken = typeof value === "string" ? value : "";
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && csrfToken) {
    headers.set("X-Cyberboss-CSRF", csrfToken);
  }
  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
    body: hasBody && !(options.body instanceof FormData) && typeof options.body !== "string"
      ? JSON.stringify(options.body)
      : options.body,
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const error = new Error(payload?.message || "请求失败，请稍后再试。");
    error.status = response.status;
    error.code = payload?.error || "";
    throw error;
  }
  return payload;
}

export const dashboardApi = {
  session: () => apiRequest("/api/session"),
  login: (password) => apiRequest("/api/login", { method: "POST", body: { password } }),
  logout: () => apiRequest("/api/logout", { method: "POST", body: {} }),
  overview: () => apiRequest("/api/overview"),
  desk: () => apiRequest("/api/desk"),
  instructions: () => apiRequest("/api/instructions"),
  updateInstructions: (markdown) => apiRequest("/api/instructions", {
    method: "PATCH",
    body: { markdown },
  }),
  diary: (date = "") => apiRequest(`/api/diary${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  updateDiary: (date, markdown) => apiRequest(`/api/diary?date=${encodeURIComponent(date)}`, {
    method: "PATCH",
    body: { markdown },
  }),
  deleteDiary: (date) => apiRequest(`/api/diary?date=${encodeURIComponent(date)}`, {
    method: "DELETE",
  }),
  notes: () => apiRequest("/api/notes"),
  note: (id) => apiRequest(`/api/notes/${encodeURIComponent(id)}`),
  updateNote: (id, value) => apiRequest(`/api/notes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: value,
  }),
  deleteNote: (id) => apiRequest(`/api/notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }),
  activity: (type = "") => apiRequest(`/api/activity${type ? `?type=${encodeURIComponent(type)}` : ""}`),
  stickers: () => apiRequest("/api/stickers"),
  updateSticker: (stickerId, value) => apiRequest(`/api/stickers/${encodeURIComponent(stickerId)}`, {
    method: "PATCH",
    body: value,
  }),
  deleteSticker: (stickerId) => apiRequest(`/api/stickers/${encodeURIComponent(stickerId)}`, {
    method: "DELETE",
  }),
  uploadSticker: (formData) => apiRequest("/api/stickers", {
    method: "POST",
    body: formData,
  }),
};
