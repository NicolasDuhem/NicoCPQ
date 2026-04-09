'use client';

import { CSSProperties, useState } from 'react';

type SmokePayload = {
  ok: boolean;
  requestDebug?: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
    bodyText: string;
  };
  responseDebug?: {
    status: number;
    ok: boolean;
    statusText: string;
    headers: Record<string, string>;
    parsedJson?: unknown;
    rawText: string;
  };
  configDebug?: {
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
  error?: string;
  details?: string;
};

const preStyle: CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  background: '#f5f5f5',
  border: '1px solid #ddd',
  borderRadius: 6,
  padding: 12,
};

const CopyableBlock = ({ title, text }: { title: string; text: string }) => (
  <details open>
    <summary>{title}</summary>
    <pre style={preStyle}>{text}</pre>
  </details>
);

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

export default function CpqSmokePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SmokePayload | null>(null);

  const runSmokeTest = async (generateNewDetailId = false) => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/cpq/smoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ generateNewDetailId }),
      });

      const payload = (await response.json()) as SmokePayload;
      setResult(payload);
    } catch (error) {
      setResult({
        ok: false,
        error: 'Browser request failed',
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif', display: 'grid', gap: 12 }}>
      <h1>CPQ Smoke Test Debugger</h1>
      <p>Runs the StartConfiguration call through the Next.js server route and displays full request/response details.</p>
      <p>
        <strong>Compare this request directly to the working Postman request.</strong>
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => runSmokeTest(false)} disabled={loading}>
          {loading ? 'Running...' : 'Run CPQ Smoke Test'}
        </button>
        <button onClick={() => runSmokeTest(true)} disabled={loading}>
          {loading ? 'Running...' : 'Generate new detailId and rerun'}
        </button>
      </div>

      {result && (
        <section style={{ marginTop: 8, display: 'grid', gap: 16 }}>
          <div>
            <strong>Result:</strong> {result.ok ? 'Success' : 'Failure'}
          </div>

          {result.error && (
            <div>
              <strong>Error:</strong> {result.error}
              {result.details ? ` (${result.details})` : ''}
            </div>
          )}

          {result.configDebug && (
            <details open>
              <summary>
                <strong>Environment/config summary</strong>
              </summary>
              <pre style={preStyle}>{pretty(result.configDebug)}</pre>
            </details>
          )}

          {result.requestDebug && (
            <details open>
              <summary>
                <strong>Outgoing request</strong>
              </summary>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <div>
                  <strong>URL:</strong> {result.requestDebug.url}
                </div>
                <div>
                  <strong>Method:</strong> {result.requestDebug.method}
                </div>

                <CopyableBlock title="Request headers (copyable)" text={pretty(result.requestDebug.headers)} />
                <CopyableBlock title="Request body (copyable)" text={result.requestDebug.bodyText} />
              </div>
            </details>
          )}

          {result.responseDebug && (
            <details open>
              <summary>
                <strong>Incoming response</strong>
              </summary>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <div>
                  <strong>HTTP status:</strong> {result.responseDebug.status}
                </div>
                <div>
                  <strong>Status text:</strong> {result.responseDebug.statusText || 'n/a'}
                </div>
                <CopyableBlock title="Response headers" text={pretty(result.responseDebug.headers)} />
                <CopyableBlock
                  title="Response body (parsed JSON if available)"
                  text={result.responseDebug.parsedJson ? pretty(result.responseDebug.parsedJson) : 'JSON parse failed'}
                />
                <CopyableBlock title="Response body (raw text, copyable)" text={result.responseDebug.rawText} />
              </div>
            </details>
          )}
        </section>
      )}
    </main>
  );
}
