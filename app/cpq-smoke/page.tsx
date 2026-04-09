'use client';

import { CSSProperties, useMemo, useState } from 'react';
import { BikeBuilderFeatureOption, NormalizedBikeBuilderState } from '../../lib/cpq/types';

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

const responseSnippet = (value: unknown): string => {
  const text = JSON.stringify(value);
  if (!text) return '-';
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
};

const getEffectiveSelection = (option: BikeBuilderFeatureOption): string => {
  const optionId = option.optionId;
  const optionValue = option.value ?? '';
  return `${optionId}::${optionValue}`;
};

export default function CpqSmokePage() {
  const [ruleset, setRuleset] = useState(defaultRuleset);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<NormalizedBikeBuilderState | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [showHidden, setShowHidden] = useState(false);

  const [lastChangedFeatureId, setLastChangedFeatureId] = useState<string | null>(null);
  const [lastChangedOptionId, setLastChangedOptionId] = useState<string | null>(null);
  const [lastConfigureRequest, setLastConfigureRequest] = useState<unknown>(null);
  const [lastConfigureResponse, setLastConfigureResponse] = useState<unknown>(null);
  const [lastInitResponse, setLastInitResponse] = useState<unknown>(null);

  const visibleFeatures = useMemo(
    () => (state?.features ?? []).filter((feature) => feature.isVisible !== false),
    [state],
  );

  const hiddenFeatures = useMemo(
    () => (state?.features ?? []).filter((feature) => feature.isVisible === false),
    [state],
  );

  const hasFeatures = useMemo(() => (visibleFeatures.length ?? 0) > 0, [visibleFeatures]);

  const hydrateSelectionMap = (nextState: NormalizedBikeBuilderState): Record<string, string> => {
    const nextSelected: Record<string, string> = {};
    nextState.features.forEach((feature) => {
      const selectedOption = feature.availableOptions.find((option) => option.selected);
      if (selectedOption) {
        nextSelected[feature.featureId] = getEffectiveSelection(selectedOption);
      }
    });
    return nextSelected;
  };

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
      setLastChangedFeatureId(null);
      setLastChangedOptionId(null);
      setSelectedOptions(hydrateSelectionMap(payload.parsed));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const configureSingleChange = async (featureId: string, selectedKey: string) => {
    if (!sessionId || !state) return;

    const feature = state.features.find((candidate) => candidate.featureId === featureId);
    const selectedOption = feature?.availableOptions.find((option) => getEffectiveSelection(option) === selectedKey);

    if (!selectedOption) {
      setError(`Could not resolve selected option for feature ${featureId}`);
      return;
    }

    setLoading(true);
    setError(null);

    const requestBody = {
      sessionId,
      ruleset,
      featureId,
      optionId: selectedOption.optionId,
      optionValue: selectedOption.value,
    };

    setLastChangedFeatureId(featureId);
    setLastChangedOptionId(selectedOption.optionId);
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
      setSelectedOptions(hydrateSelectionMap(payload.parsed));
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

          <h2>Visible features / options</h2>
          {!hasFeatures && <div>No visible features were parsed from CPQ response.</div>}

          {visibleFeatures.map((feature) => (
            <div key={feature.featureId} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10 }}>
              <div>
                <strong>{feature.featureLabel}</strong> ({feature.featureName ?? feature.featureId})
              </div>
              <div>
                Current value: <code>{feature.currentValue ?? '-'}</code>
              </div>
              <select
                value={selectedOptions[feature.featureId] ?? ''}
                disabled={loading || !sessionId || feature.isEnabled === false}
                onChange={(e) => configureSingleChange(feature.featureId, e.target.value)}
              >
                {feature.availableOptions.map((option) => (
                  <option
                    key={getEffectiveSelection(option)}
                    value={getEffectiveSelection(option)}
                    disabled={option.isEnabled === false || option.isVisible === false}
                  >
                    {option.label}
                    {option.selected ? ' (selected)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <label>
            <input type='checkbox' checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden/system
            features in debug panel
          </label>

          {showHidden && hiddenFeatures.length > 0 && (
            <details open>
              <summary>Hidden/system features ({hiddenFeatures.length})</summary>
              <pre style={preStyle}>{pretty(hiddenFeatures)}</pre>
            </details>
          )}
        </section>
      )}

      <details open>
        <summary>Debug: parser and request summary</summary>
        <pre style={preStyle}>
          {pretty({
            extractedSessionId: state?.sessionId ?? sessionId,
            sessionIdField: state?.debug?.sessionIdField,
            parsedFeatureCount: state?.debug?.parsedFeatureCount ?? 0,
            visibleFeatureCount: state?.debug?.visibleFeatureCount ?? 0,
            hiddenFeatureCount: state?.debug?.hiddenFeatureCount ?? 0,
            lastChangedFeatureId,
            lastChangedOptionId,
            lastConfigureRequestBody: lastConfigureRequest,
            rawResponseSnippet: responseSnippet(lastConfigureResponse ?? lastInitResponse),
          })}
        </pre>
      </details>

      <details>
        <summary>Debug: feature/option identity view</summary>
        <pre style={preStyle}>
          {pretty(
            (showHidden ? state?.features : visibleFeatures)?.map((feature) => ({
              featureId: feature.featureId,
              featureName: feature.featureName,
              featureLabel: feature.featureLabel,
              featureSequence: feature.featureSequence,
              featureVisible: feature.isVisible,
              featureEnabled: feature.isEnabled,
              currentValue: feature.currentValue,
              selectedOptionId: feature.selectedOptionId,
              options: feature.availableOptions.map((option) => ({
                optionId: option.optionId,
                optionValue: option.value,
                optionLabel: option.label,
                selected: option.selected,
                isVisible: option.isVisible,
                isEnabled: option.isEnabled,
              })),
            })),
          )}
        </pre>
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
