'use client';

import { CSSProperties, useMemo, useState } from 'react';
import { NormalizedBikeBuilderState } from '../../lib/cpq/types';

type RequestState = {
  loading: boolean;
  error?: string;
};

type CallType = 'StartConfiguration' | 'Configure';

type CpqRouteResponse = {
  sessionId: string;
  parsed: NormalizedBikeBuilderState;
  rawResponse: unknown;
  requestBody?: unknown;
  callType?: CallType;
  error?: string;
  details?: string;
};

type RulesetTarget = {
  label: string;
  ruleset: string;
  namespace: string;
  partName: string;
  headerId: string;
};

const fallbackPart = process.env.NEXT_PUBLIC_CPQ_PART_NAME ?? process.env.NEXT_PUBLIC_CPQ_RULESET ?? 'BROMPTON_BIKE_BUILDER';
const fallbackNamespace = process.env.NEXT_PUBLIC_CPQ_NAMESPACE ?? 'Default';
const fallbackHeaderId = process.env.NEXT_PUBLIC_CPQ_HEADER_ID ?? 'Simulator';

const presets: RulesetTarget[] = [
  {
    label: 'Default preset',
    ruleset: fallbackPart,
    namespace: fallbackNamespace,
    partName: fallbackPart,
    headerId: fallbackHeaderId,
  },
];

export default function BikeBuilderPage() {
  const [target, setTarget] = useState<RulesetTarget>(presets[0]);
  const [accountCode, setAccountCode] = useState('A000');
  const [detailId, setDetailId] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<NormalizedBikeBuilderState | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({ loading: false });
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [lastCallType, setLastCallType] = useState<CallType>('StartConfiguration');
  const [lastChangedFeatureId, setLastChangedFeatureId] = useState<string>('');
  const [lastChangedOptionId, setLastChangedOptionId] = useState<string>('');
  const [lastRawRequest, setLastRawRequest] = useState<unknown>(null);
  const [lastRawResponse, setLastRawResponse] = useState<unknown>(null);

  const visibleFeatures = state?.features ?? [];
  const hasFeatures = visibleFeatures.length > 0;

  const summaryPrice = useMemo(() => {
    if (state?.configuredPrice === undefined) return '-';
    return state.configuredPrice.toLocaleString(undefined, { style: 'currency', currency: 'GBP' });
  }, [state?.configuredPrice]);

  const startFreshConfiguration = async (nextTarget = target, freshDetailId = crypto.randomUUID()) => {
    setRequestState({ loading: true });
    setActiveFeatureId(null);
    setState(null);
    setDetailId(freshDetailId);

    try {
      const requestBody = {
        ruleset: nextTarget.ruleset,
        namespace: nextTarget.namespace,
        partName: nextTarget.partName,
        headerId: nextTarget.headerId,
        detailId: freshDetailId,
        context: { accountCode },
      };

      const res = await fetch('/api/cpq/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const payload = (await res.json()) as CpqRouteResponse;
      if (!res.ok) {
        throw new Error(payload.details ?? payload.error ?? 'Failed to initialize configuration');
      }

      setState(payload.parsed);
      setLastCallType('StartConfiguration');
      setLastChangedFeatureId('');
      setLastChangedOptionId('');
      setLastRawRequest(payload.requestBody ?? requestBody);
      setLastRawResponse(payload.rawResponse);
      setRequestState({ loading: false });
    } catch (error) {
      setRequestState({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  const onRulesetChange = async (nextRuleset: string) => {
    const nextTarget = { ...target, ruleset: nextRuleset, partName: nextRuleset };
    setTarget(nextTarget);
    await startFreshConfiguration(nextTarget, crypto.randomUUID());
  };

  const changeOption = async (featureId: string, optionId: string, optionValue?: string) => {
    if (!state?.sessionId) return;

    setRequestState({ loading: true });
    setActiveFeatureId(featureId);

    try {
      const requestBody = {
        sessionId: state.sessionId,
        ruleset: target.ruleset,
        featureId,
        optionId,
        optionValue,
        context: { accountCode },
      };

      const res = await fetch('/api/cpq/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const payload = (await res.json()) as CpqRouteResponse;
      if (!res.ok) {
        throw new Error(payload.details ?? payload.error ?? 'Failed to configure selection');
      }

      setState(payload.parsed);
      setLastCallType('Configure');
      setLastChangedFeatureId(featureId);
      setLastChangedOptionId(optionId);
      setLastRawRequest(payload.requestBody ?? requestBody);
      setLastRawResponse(payload.rawResponse);
      setRequestState({ loading: false });
    } catch (error) {
      setRequestState({ loading: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setActiveFeatureId(null);
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.heading}>Bike Builder CPQ Playground</h1>

        <section style={styles.topBar}>
          <div style={styles.topGrid}>
            <label style={styles.label}>
              Ruleset
              <input value={target.ruleset} onChange={(e) => onRulesetChange(e.target.value)} style={styles.input} />
            </label>
            <label style={styles.label}>
              Namespace
              <input value={target.namespace} onChange={(e) => setTarget({ ...target, namespace: e.target.value })} style={styles.input} />
            </label>
            <label style={styles.label}>
              Header ID
              <input value={target.headerId} onChange={(e) => setTarget({ ...target, headerId: e.target.value })} style={styles.input} />
            </label>
            <label style={styles.label}>
              Account
              <input value={accountCode} onChange={(e) => setAccountCode(e.target.value)} style={styles.input} />
            </label>
          </div>
          <div style={styles.topActions}>
            <button style={styles.button} onClick={() => startFreshConfiguration()} disabled={requestState.loading}>
              {requestState.loading ? 'Loading…' : 'Load / Restart'}
            </button>
            <button style={styles.secondaryButton} onClick={() => startFreshConfiguration(target, crypto.randomUUID())} disabled={requestState.loading}>
              Restart with fresh detailId
            </button>
            <button style={styles.secondaryButton} onClick={() => setDebugOpen((v) => !v)}>
              {debugOpen ? 'Hide debug' : 'Show debug'}
            </button>
            <span style={styles.badge}>{state?.sessionId ? `session ${state.sessionId}` : 'no session'}</span>
          </div>
        </section>

        {requestState.error && <p style={styles.error}>Error: {requestState.error}</p>}

        <section style={styles.layout}>
          <div style={styles.leftColumn}>
            <h2 style={styles.sectionTitle}>Configurator</h2>
            {!hasFeatures && <p style={styles.muted}>Load a ruleset to begin.</p>}
            {visibleFeatures.map((feature) => (
              <div key={feature.featureId} style={styles.featureCard}>
                <div style={styles.featureHeader}>{feature.featureLabel}</div>
                <select
                  value={feature.selectedOptionId}
                  style={styles.select}
                  onChange={(e) => {
                    const selected = feature.availableOptions.find((option) => option.optionId === e.target.value);
                    void changeOption(feature.featureId, e.target.value, selected?.value);
                  }}
                  disabled={requestState.loading && activeFeatureId === feature.featureId}
                >
                  {feature.availableOptions.map((option) => (
                    <option key={option.optionId} value={option.optionId} disabled={option.isSelectable === false}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {activeFeatureId === feature.featureId && requestState.loading && <span style={styles.tinyMuted}>Updating…</span>}
              </div>
            ))}
          </div>

          <aside style={styles.rightColumn}>
            <h2 style={styles.sectionTitle}>Summary</h2>
            <div style={styles.summaryCard}>
              <div><strong>Description:</strong> {state?.productDescription ?? '-'}</div>
              <div><strong>IPN:</strong> {state?.ipnCode ?? '-'}</div>
              <div><strong>Price:</strong> {summaryPrice}</div>
              <div><strong>Ruleset:</strong> {target.ruleset}</div>
              <div><strong>Namespace:</strong> {target.namespace}</div>
              <div><strong>Header ID:</strong> {target.headerId}</div>
              <div><strong>Detail ID:</strong> {detailId}</div>
              <div><strong>Session ID:</strong> {state?.sessionId ?? '-'}</div>
            </div>

            {debugOpen && (
              <div style={styles.debugCard}>
                <h3 style={styles.debugTitle}>Ruleset debug</h3>
                <ul style={styles.debugList}>
                  <li>lastCallType: {lastCallType}</li>
                  <li>lastChangedFeatureId: {lastChangedFeatureId || '-'}</li>
                  <li>lastChangedOptionId: {lastChangedOptionId || '-'}</li>
                  <li>sessionId source: {state?.debug?.sessionIdField ?? '-'}</li>
                  <li>raw feature count: {state?.debug?.rawFeatureCount ?? 0}</li>
                  <li>deduped feature count: {state?.debug?.dedupedFeatureCount ?? 0}</li>
                  <li>visible feature count: {state?.debug?.visibleFeatureCount ?? 0}</li>
                  <li>hidden/system feature count: {state?.debug?.hiddenFeatureCount ?? 0}</li>
                </ul>
                <details>
                  <summary>StartConfiguration / Configure request debug</summary>
                  <pre style={styles.pre}>{JSON.stringify(lastRawRequest, null, 2)}</pre>
                </details>
                <details>
                  <summary>StartConfiguration / Configure response debug</summary>
                  <pre style={styles.pre}>{JSON.stringify(lastRawResponse, null, 2)}</pre>
                </details>
                <details>
                  <summary>Parsed feature diagnostics</summary>
                  <pre style={styles.pre}>{JSON.stringify(state?.features ?? [], null, 2)}</pre>
                </details>
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { fontFamily: 'Inter, Arial, sans-serif', background: '#f6f7fb', minHeight: '100vh', padding: 16 },
  container: { maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 12 },
  heading: { margin: '6px 0 8px', fontSize: 24 },
  topBar: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' },
  topGrid: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' },
  label: { display: 'grid', gap: 4, fontSize: 12, color: '#374151', fontWeight: 600 },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 },
  topActions: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' },
  button: { padding: '8px 12px', borderRadius: 8, border: '1px solid #1f2937', background: '#111827', color: '#fff', cursor: 'pointer' },
  secondaryButton: { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' },
  badge: { fontSize: 12, padding: '5px 8px', borderRadius: 999, background: '#eef2ff', color: '#3730a3' },
  layout: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' },
  leftColumn: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 8 },
  rightColumn: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 8, alignContent: 'start' },
  sectionTitle: { margin: '0 0 4px', fontSize: 16 },
  featureCard: { border: '1px solid #ebedf0', borderRadius: 10, padding: 8, display: 'grid', gap: 6, background: '#fcfcfd' },
  featureHeader: { fontSize: 13, fontWeight: 600, color: '#111827' },
  select: { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' },
  summaryCard: { border: '1px solid #ebedf0', borderRadius: 10, padding: 10, display: 'grid', gap: 6, fontSize: 13 },
  debugCard: { border: '1px solid #ebedf0', borderRadius: 10, padding: 10, display: 'grid', gap: 8, fontSize: 12 },
  debugTitle: { margin: 0, fontSize: 14 },
  debugList: { margin: 0, paddingLeft: 18, display: 'grid', gap: 4 },
  pre: { maxHeight: 220, overflow: 'auto', background: '#f8fafc', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' },
  tinyMuted: { fontSize: 11, color: '#6b7280' },
  muted: { color: '#6b7280', fontSize: 13 },
  error: { color: '#b91c1c', fontSize: 13, margin: 0 },
};
