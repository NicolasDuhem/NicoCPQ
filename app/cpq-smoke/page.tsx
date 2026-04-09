'use client';

import { CSSProperties, useMemo, useState } from 'react';
import { NormalizedBikeBuilderState } from '../../lib/cpq/types';

type InitResponse = {
  sessionId: string;
  parsed: NormalizedBikeBuilderState;
  rawResponse: unknown;
  error?: string;
  details?: string;
};

type ConfigureResponse = {
  sessionId: string;
  parsed: NormalizedBikeBuilderState;
  rawResponse: unknown;
  requestBody: unknown;
  error?: string;
  details?: string;
};

const defaultRuleset = process.env.NEXT_PUBLIC_CPQ_RULESET ?? 'BBLV6_G-LineMY26';

const preStyle: CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  background: '#f5f5f5',
  border: '1px solid #ddd',
  borderRadius: 6,
  padding: 12,
};

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

export default function CpqSmokePage() {
  const [ruleset, setRuleset] = useState(defaultRuleset);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<NormalizedBikeBuilderState | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  const [lastConfigureRequest, setLastConfigureRequest] = useState<unknown>(null);
  const [lastConfigureResponse, setLastConfigureResponse] = useState<unknown>(null);
  const [lastInitResponse, setLastInitResponse] = useState<unknown>(null);

  const hasFeatures = useMemo(() => (state?.features.length ?? 0) > 0, [state]);

  const loadConfiguration = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/cpq/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleset }),
      });

      const payload = (await res.json()) as InitResponse;
      if (!res.ok) {
        throw new Error(payload.details ?? payload.error ?? 'Load configuration failed');
      }

      setState(payload.parsed);
      setSessionId(payload.sessionId);
      setLastInitResponse(payload.rawResponse);
      setLastConfigureRequest(null);
      setLastConfigureResponse(null);

      const nextSelected: Record<string, string> = {};
      payload.parsed.features.forEach((feature) => {
        if (feature.selectedOptionId) {
          nextSelected[feature.featureId] = feature.selectedOptionId;
        }
      });
      setSelectedOptions(nextSelected);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const configureSingleChange = async (featureId: string, optionId: string) => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);

    const requestBody = {
      sessionId,
      ruleset,
      featureId,
      optionId,
    };

    setLastConfigureRequest(requestBody);

    try {
      const res = await fetch('/api/cpq/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const payload = (await res.json()) as ConfigureResponse;
      if (!res.ok) {
        throw new Error(payload.details ?? payload.error ?? 'Configure failed');
      }

      setState(payload.parsed);
      setSessionId(payload.sessionId);
      setLastConfigureResponse(payload.rawResponse);

      const nextSelected: Record<string, string> = {};
      payload.parsed.features.forEach((feature) => {
        if (feature.selectedOptionId) {
          nextSelected[feature.featureId] = feature.selectedOptionId;
        }
      });
      setSelectedOptions(nextSelected);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif', display: 'grid', gap: 12 }}>
      <h1>CPQ Configure Playground</h1>
      <p>Minimal interactive loop: StartConfiguration → pick one option → Configure → refresh from CPQ.</p>

      <label style={{ maxWidth: 500 }}>
        Ruleset
        <input value={ruleset} onChange={(e) => setRuleset(e.target.value)} style={{ width: '100%' }} />
      </label>

      <button onClick={loadConfiguration} disabled={loading}>
        {loading ? 'Loading...' : 'Load Configuration'}
      </button>

      {error && (
        <div style={{ color: 'crimson' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div>
        <strong>SessionId:</strong> {sessionId ?? '-'}
      </div>

      {state && (
        <section style={{ display: 'grid', gap: 10 }}>
          <div>
            <strong>Description:</strong> {state.productDescription ?? '-'}
          </div>
          <div>
            <strong>IPN:</strong> {state.ipnCode ?? '-'}
          </div>
          <div>
            <strong>Price:</strong> {state.configuredPrice ?? '-'}
          </div>

          <h2>Features / options</h2>
          {!hasFeatures && <div>No features were parsed from StartConfiguration response.</div>}

          {state.features.map((feature) => (
            <div key={feature.featureId} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10 }}>
              <div>
                <strong>{feature.featureLabel}</strong> ({feature.featureId})
              </div>
              <select
                value={selectedOptions[feature.featureId] ?? feature.selectedOptionId ?? ''}
                disabled={loading || !sessionId}
                onChange={(e) => configureSingleChange(feature.featureId, e.target.value)}
              >
                {feature.availableOptions.map((option) => (
                  <option key={option.optionId} value={option.optionId} disabled={option.isSelectable === false}>
                    {option.label}
                    {option.selected ? ' (selected)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
      )}

      <details open>
        <summary>Debug: selected options</summary>
        <pre style={preStyle}>{pretty(selectedOptions)}</pre>
      </details>

      <details open>
        <summary>Debug: last Configure request body</summary>
        <pre style={preStyle}>{pretty(lastConfigureRequest)}</pre>
      </details>

      <details>
        <summary>Debug: last Configure raw response</summary>
        <pre style={preStyle}>{pretty(lastConfigureResponse)}</pre>
      </details>

      <details>
        <summary>Debug: last StartConfiguration raw response</summary>
        <pre style={preStyle}>{pretty(lastInitResponse)}</pre>
      </details>

      <details>
        <summary>Debug: parsed normalized state</summary>
        <pre style={preStyle}>{pretty(state)}</pre>
      </details>
    </main>
  );
}
