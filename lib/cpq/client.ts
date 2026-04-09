import { ConfigureConfiguratorRequest, CpqApiEnvelope, CpqClientConfig, InitConfiguratorRequest } from './types';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const readCpqConfig = (): CpqClientConfig => ({
  baseUrl: requireEnv('CPQ_BASE_URL'),
  ionApiToken: process.env.CPQ_ION_API_TOKEN,
  username: process.env.CPQ_USERNAME,
  password: process.env.CPQ_PASSWORD,
  timeoutMs: Number(process.env.CPQ_TIMEOUT_MS ?? 25000),
});

const buildHeaders = (config: CpqClientConfig): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (config.ionApiToken) {
    headers.Authorization = `Bearer ${config.ionApiToken}`;
  } else if (config.username && config.password) {
    const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    headers.Authorization = `Basic ${encoded}`;
  }

  return headers;
};

const post = async (path: string, body: unknown): Promise<CpqApiEnvelope> => {
  const config = readCpqConfig();
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = (await res.json()) as CpqApiEnvelope;

    if (!res.ok) {
      throw new Error(`CPQ request failed (${res.status}): ${JSON.stringify(payload)}`);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
};

export const startConfiguration = async (
  request: InitConfiguratorRequest,
  context: Record<string, unknown>,
): Promise<CpqApiEnvelope> => {
  const body = {
    ruleset: request.ruleset,
    ...context,
  };

  return post('startconfiguration', body);
};

export const configureSelection = async (
  request: ConfigureConfiguratorRequest,
  context: Record<string, unknown>,
): Promise<CpqApiEnvelope> => {
  const body = {
    sessionId: request.sessionId,
    ruleset: request.ruleset,
    changes: [
      {
        featureId: request.featureId,
        optionId: request.optionId,
      },
    ],
    ...context,
  };

  return post('configure', body);
};
