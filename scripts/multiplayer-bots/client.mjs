const RETRYABLE_STATUS = new Set([409, 425, 429, 500, 502, 503, 504]);

export class MultiplayerApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "MultiplayerApiError";
    this.status = status;
    this.payload = payload;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MultiplayerApiClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.retries = options.retries ?? 4;
    this.retryDelayMs = options.retryDelayMs ?? 180;
  }

  async request(path, init = {}, options = {}) {
    const retries = options.retries ?? this.retries;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) return payload;

        const message = payload.error || payload.details || `HTTP ${response.status}`;
        const error = new MultiplayerApiError(String(message), response.status, payload);
        if (!RETRYABLE_STATUS.has(response.status) || attempt === retries) throw error;
        lastError = error;
      } catch (error) {
        lastError = error;
        if (error instanceof MultiplayerApiError && !RETRYABLE_STATUS.has(error.status)) throw error;
        if (attempt === retries) throw error;
      }

      await sleep(this.retryDelayMs * (attempt + 1));
    }

    throw lastError;
  }

  async createRoom({ clientId, displayName, playerCount, rolePreset }) {
    const payload = await this.request("/api/multiplayer/rooms", {
      method: "POST",
      body: JSON.stringify({ clientId, displayName, playerCount, rolePreset }),
    });
    return payload.room;
  }

  async joinRoom(code, { clientId, displayName }) {
    const payload = await this.request(`/api/multiplayer/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ clientId, displayName }),
    });
    return payload.room;
  }

  async getRoom(code, clientId) {
    const payload = await this.request(
      `/api/multiplayer/rooms/${encodeURIComponent(code)}?clientId=${encodeURIComponent(clientId)}`,
      {},
      { retries: 5 }
    );
    return payload.room;
  }

  async action(code, action) {
    const payload = await this.request(`/api/multiplayer/rooms/${encodeURIComponent(code)}/action`, {
      method: "POST",
      body: JSON.stringify(action),
    });
    return payload.room;
  }
}
