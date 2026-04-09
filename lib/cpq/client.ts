import { buildStartConfigurationPayload, readCpqConfig } from './config';
import { ConfigureConfiguratorRequest, CpqApiEnvelope, InitConfiguratorRequest } from './types';

type CpqRequestResult = {
  status: number;
  ok: boolean;
  data?: CpqApiEnvelope;
  text?: string;
};

const getBodySnippet = (text: string): string => text.replace(/\s+/g, ' ').slice(0, 400);

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
