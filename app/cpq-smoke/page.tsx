'use client';

import { useState } from 'react';

type SmokePayload = {
  ok: boolean;
  upstreamStatus?: number;
  json?: Record<string, unknown>;
  text?: string;
  error?: string;
  details?: string;
};

const extractHighlights = (payload?: Record<string, unknown>) => {
  if (!payload) return {};

  const root = payload as Record<string, unknown>;
  return {
    sessionId: root.sessionId ?? root.SessionId ?? root.configurationId ?? null,
    description: root.description ?? root.Description ?? root.productDescription ?? null,
    details: root.details ?? root.Details ?? null,
    screensCount: Array.isArray(root.screens) ? root.screens.length : Array.isArray(root.Screens) ? root.Screens.length : null,
    optionsCount: Array.isArray(root.options) ? root.options.length : Array.isArray(root.Options) ? root.Options.length : null,
  };
};

export default function CpqSmokePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SmokePayload | null>(null);

  const runSmokeTest = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/cpq/smoke', {
        method: 'POST',
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

  const highlights = extractHighlights(result?.json);

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>CPQ Smoke Test</h1>
      <p>Runs the known-working StartConfiguration call through the Next.js server route.</p>

      <button onClick={runSmokeTest} disabled={loading}>
        {loading ? 'Running...' : 'Run CPQ Smoke Test'}
      </button>

      {result && (
        <section style={{ marginTop: 20, display: 'grid', gap: 8 }}>
          <div>
            <strong>Result:</strong> {result.ok ? 'Success' : 'Failure'}
          </div>
          <div>
            <strong>HTTP status:</strong> {result.upstreamStatus ?? 'n/a'}
          </div>
          <div>
            <strong>sessionId:</strong> {String(highlights.sessionId ?? '-')}
          </div>
          <div>
            <strong>description:</strong> {String(highlights.description ?? '-')}
          </div>
          <div>
            <strong>details:</strong> {String(highlights.details ?? '-')}
          </div>
          <div>
            <strong>screens:</strong> {String(highlights.screensCount ?? '-')}
          </div>
          <div>
            <strong>options:</strong> {String(highlights.optionsCount ?? '-')}
          </div>

          <details open>
            <summary>Response body</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result.json ?? result.text ?? result, null, 2)}</pre>
          </details>
        </section>
      )}
    </main>
  );
}
