'use client';

import { useMemo, useState } from 'react';
import { NormalizedBikeBuilderState } from '../../lib/cpq/types';

const defaultRuleset = process.env.NEXT_PUBLIC_CPQ_RULESET ?? 'BROMPTON_BIKE_BUILDER';

type RequestState = {
  loading: boolean;
  error?: string;
};

type CpqRouteResponse = {
  sessionId: string;
  parsed: NormalizedBikeBuilderState;
  rawResponse: unknown;
  error?: string;
  details?: string;
};

export default function BikeBuilderPage() {
  const [ruleset, setRuleset] = useState(defaultRuleset);
  const [accountCode, setAccountCode] = useState('A000');
  const [state, setState] = useState<NormalizedBikeBuilderState | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({ loading: false });

  const hasFeatures = useMemo(() => (state?.features?.length ?? 0) > 0, [state]);

  const initConfiguration = async () => {
    setRequestState({ loading: true });

    try {
      const res = await fetch('/api/cpq/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleset, context: { accountCode } }),
      });

      const payload = (await res.json()) as CpqRouteResponse;
      if (!res.ok) {
        throw new Error(payload.details ?? payload.error ?? 'Failed to initialize configuration');
      }

      setState(payload.parsed);
      setRequestState({ loading: false });
    } catch (error) {
      setRequestState({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const changeOption = async (featureId: string, optionId: string) => {
    if (!state) return;

    setRequestState({ loading: true });

    try {
      const res = await fetch('/api/cpq/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.sessionId,
          ruleset: state.ruleset,
          featureId,
          optionId,
          context: { accountCode },
          currentState: state,
        }),
      });

      const payload = (await res.json()) as CpqRouteResponse;
      if (!res.ok) {
        throw new Error(payload.details ?? payload.error ?? 'Failed to configure selection');
      }

      setState(payload.parsed);
      setRequestState({ loading: false });
    } catch (error) {
      setRequestState({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Bike Builder POC</h1>
      <p>Simple CPQ loop: StartConfiguration → Configure → refresh normalized UI model.</p>

      <section style={{ display: 'grid', gap: 8, maxWidth: 520, marginBottom: 16 }}>
        <label>
          Ruleset
          <input value={ruleset} onChange={(e) => setRuleset(e.target.value)} style={{ width: '100%' }} />
        </label>

        <label>
          Account code
          <input value={accountCode} onChange={(e) => setAccountCode(e.target.value)} style={{ width: '100%' }} />
        </label>

        <button disabled={requestState.loading} onClick={initConfiguration}>
          {requestState.loading ? 'Loading...' : 'Initialize configuration'}
        </button>
      </section>

      {requestState.error && <p style={{ color: 'crimson' }}>Error: {requestState.error}</p>}

      {state && (
        <section style={{ display: 'grid', gap: 12 }}>
          <div>
            <strong>Session:</strong> {state.sessionId}
          </div>
          <div>
            <strong>Description:</strong> {state.productDescription ?? '-'}
          </div>
          <div>
            <strong>IPN:</strong> {state.ipnCode ?? '-'}
          </div>
          <div>
            <strong>Price:</strong> {state.configuredPrice ?? '-'}
          </div>
          <div>
            <strong>Weight:</strong> {state.totalWeight ?? '-'}
          </div>

          {state.bikeImageUrl && <img src={state.bikeImageUrl} alt='Configured bike' style={{ maxWidth: 420 }} />}

          <h2>Features</h2>
          {!hasFeatures && <p>No features returned from CPQ.</p>}
          {state.features.map((feature) => (
            <div key={feature.featureId} style={{ border: '1px solid #ddd', padding: 12 }}>
              <div>
                <strong>{feature.featureLabel}</strong> ({feature.featureId})
              </div>
              <div style={{ marginTop: 6 }}>
                <select
                  value={feature.selectedOptionId}
                  onChange={(e) => changeOption(feature.featureId, e.target.value)}
                  disabled={requestState.loading}
                >
                  {feature.availableOptions.map((option) => (
                    <option key={option.optionId} value={option.optionId} disabled={option.isSelectable === false}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          <details>
            <summary>Raw normalized response</summary>
            <pre>{JSON.stringify(state, null, 2)}</pre>
          </details>
        </section>
      )}
    </main>
  );
}
