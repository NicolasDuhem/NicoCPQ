import { buildStartConfigurationPayload, readCpqConfig } from './config';
import { ConfigureConfiguratorRequest, CpqApiEnvelope, InitConfiguratorRequest } from './types';

type CpqRequestResult = {
  status: number;
  ok: boolean;
  data?: CpqApiEnvelope;
  text?: string;
};

export type CpqRequestDebug = {
  url: string;
  method: 'POST';
  headers: {
    Authorization: string;
    'Content-Type': string;
    Accept: string;
  };
  body: unknown;
  bodyText: string;
};

export type CpqResponseDebug = {
  status: number;
  ok: boolean;
  statusText: string;
  headers: Record<string, string>;
  parsedJson?: CpqApiEnvelope;
  rawText: string;
};

export type CpqConfigDebug = {
  apiKeyPresent: boolean;
  apiKeyPreview: string | null;
  baseUrl: string;
  instance: string;
  profile: string;
  namespace: string;
  partName: string;
  company: string;
  currency: string;
  customerLocation: string;
  headerId: string;
  detailId: string;
};

export type CpqSmokeDebugResult = {
  requestDebug: CpqRequestDebug;
  responseDebug: CpqResponseDebug;
  configDebug: CpqConfigDebug;
};

const getBodySnippet = (text: string): string => text.replace(/\s+/g, ' ').slice(0, 400);

const maskApiKey = (apiKey: string): string => {
  if (!apiKey) return 'ApiKey ****';
  const suffix = apiKey.slice(-4);
  return `ApiKey ****${suffix}`;
};

const buildConfigDebug = (detailIdOverride?: string): CpqConfigDebug => {
  const config = readCpqConfig();

  return {
    apiKeyPresent: Boolean(config.apiKey),
    apiKeyPreview: config.apiKey ? `****${config.apiKey.slice(-4)}` : null,
    baseUrl: config.baseUrl,
    instance: config.defaults.instance,
    profile: config.defaults.profile,
    namespace: config.defaults.namespace,
    partName: config.defaults.partName,
    company: config.defaults.company,
    currency: config.defaults.currency,
    customerLocation: config.defaults.customerLocation,
    headerId: config.defaults.headerId,
    detailId: detailIdOverride ?? config.defaults.detailId,
  };
};

const post = async (path: string, body: unknown, logPrefix: string): Promise<CpqRequestResult> => {
  const config = readCpqConfig();
  const endpoint = `${config.baseUrl}/${path.replace(/^\//, '')}`;
  const apiKeyPresent = Boolean(config.apiKey);

  console.log(`${logPrefix} request`, {
    url: endpoint,
    apiKeyPresent,
    apiKeyPreview: apiKeyPresent ? `${config.apiKey.slice(0, 4)}...` : undefined,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const responseText = await response.text();
    console.log(`${logPrefix} response`, {
      status: response.status,
      bodySnippet: getBodySnippet(responseText),
    });

    try {
      const parsed = JSON.parse(responseText) as CpqApiEnvelope;
      return { status: response.status, ok: response.ok, data: parsed, text: responseText };
    } catch {
      return { status: response.status, ok: response.ok, text: responseText };
    }
  } catch (error) {
    console.error(`${logPrefix} fetch failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const startConfigurationRaw = async (): Promise<CpqRequestResult> => {
  const payload = buildStartConfigurationPayload();
  return post('StartConfiguration', payload, '[cpq/start]');
};

export const startConfigurationSmokeDebug = async (detailId?: string): Promise<CpqSmokeDebugResult> => {
  const config = readCpqConfig();
  const endpoint = `${config.baseUrl}/StartConfiguration`;

  const payload = buildStartConfigurationPayload(detailId);
  const requestBodyText = JSON.stringify(payload);
  const requestHeaders = {
    Authorization: `ApiKey ${config.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  } as const;

  const requestDebug: CpqRequestDebug = {
    url: endpoint,
    method: 'POST',
    headers: {
      Authorization: maskApiKey(config.apiKey),
      'Content-Type': requestHeaders['Content-Type'],
      Accept: requestHeaders.Accept,
    },
    body: payload,
    bodyText: requestBodyText,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: requestBodyText,
      signal: controller.signal,
    });

    const responseText = await response.text();
    let parsedJson: CpqApiEnvelope | undefined;
    try {
      parsedJson = JSON.parse(responseText) as CpqApiEnvelope;
    } catch {
      parsedJson = undefined;
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      requestDebug,
      responseDebug: {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        headers: responseHeaders,
        parsedJson,
        rawText: responseText,
      },
      configDebug: buildConfigDebug(detailId),
    };
  } finally {
    clearTimeout(timer);
  }
};

export const startConfiguration = async (
  _request: InitConfiguratorRequest,
  _context?: Record<string, unknown>,
): Promise<CpqApiEnvelope> => {
  const result = await startConfigurationRaw();

  if (!result.ok) {
    throw new Error(
      `CPQ StartConfiguration failed (${result.status}): ${
        result.data ? JSON.stringify(result.data) : result.text ?? 'No response body'
      }`,
    );
  }

  if (!result.data) {
    throw new Error(`CPQ StartConfiguration returned non-JSON (${result.status}): ${result.text ?? ''}`);
  }

  return result.data;
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

  const result = await post('Configure', body, '[cpq/configure]');

  if (!result.ok || !result.data) {
    throw new Error(
      `CPQ Configure failed (${result.status}): ${result.data ? JSON.stringify(result.data) : result.text ?? 'No response body'}`,
    );
  }

  return result.data;
};
