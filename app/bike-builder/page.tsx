'use client';

import { CSSProperties, useMemo, useRef, useState } from 'react';
import { BikeBuilderFeatureOption, NormalizedBikeBuilderState } from '../../lib/cpq/types';

type RequestState = {
  loading: boolean;
  error?: string;
};

type CallType = 'StartConfiguration' | 'Configure';
type TraversalMode = 'sampler' | 'ui-hierarchical';
type TraversalStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed';

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

type CapturedOption = {
  featureLabel: string;
  featureId: string;
  optionLabel: string;
  optionId: string;
  optionValue?: string;
};

type CapturedConfiguration = {
  sequence: number;
  timestamp: string;
  traversalLevel: number;
  traversalPath: TraversalStep[];
  traversalPathKey: string;
  parentPathKey: string;
  changedFeatureId: string;
  changedOptionId: string;
  changedOptionValue?: string;
  ruleset: string;
  namespace: string;
  headerId: string;
  detailId: string;
  sessionId: string;
  description?: string;
  ipn?: string;
  price?: number;
  selectedOptions: CapturedOption[];
  dropdownOrderSnapshot: {
    level: number;
    featureId: string;
    featureLabel: string;
    selectedOptionId?: string;
    selectedOptionLabel?: string;
    selectedOptionValue?: string;
  }[];
  signature: string;
  rawSnippet?: unknown;
};

type TraversalStep = {
  featureLabel: string;
  featureId: string;
  optionLabel: string;
  optionId: string;
  optionValue?: string;
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
  const [lastChangedOptionValue, setLastChangedOptionValue] = useState<string>('');
  const [lastSelectedBefore, setLastSelectedBefore] = useState<string>('');
  const [lastSelectedAfter, setLastSelectedAfter] = useState<string>('');
  const [lastSelectedMatchSource, setLastSelectedMatchSource] = useState<string>('');
  const [lastRawRequest, setLastRawRequest] = useState<unknown>(null);
  const [lastRawResponse, setLastRawResponse] = useState<unknown>(null);
  const [lastConfigureUrl, setLastConfigureUrl] = useState<string>('');
  const [lastConfigureSelectionCount, setLastConfigureSelectionCount] = useState<number>(0);
  const [lastSessionIdSent, setLastSessionIdSent] = useState<string>('');
  const [lastPreviousFeatureCurrentValue, setLastPreviousFeatureCurrentValue] = useState<string>('');
  const [lastRequestedOptionValue, setLastRequestedOptionValue] = useState<string>('');
  const [lastReturnedFeatureCurrentValue, setLastReturnedFeatureCurrentValue] = useState<string>('');

  const [traversalStatus, setTraversalStatus] = useState<TraversalStatus>('idle');
  const [activeMode, setActiveMode] = useState<TraversalMode | null>(null);
  const [currentFeatureLabel, setCurrentFeatureLabel] = useState('-');
  const [currentOptionLabel, setCurrentOptionLabel] = useState('-');
  const [currentTraversalLevel, setCurrentTraversalLevel] = useState(0);
  const [currentTraversalPathLabel, setCurrentTraversalPathLabel] = useState('-');
  const [currentTraversalDetailId, setCurrentTraversalDetailId] = useState('-');
  const [currentTraversalSessionId, setCurrentTraversalSessionId] = useState('-');
  const [results, setResults] = useState<CapturedConfiguration[]>([]);
  const [delayMs, setDelayMs] = useState(5000);
  const [maxDepth, setMaxDepth] = useState(3);
  const [maxResults, setMaxResults] = useState(150);
  const [maxConfigureCalls, setMaxConfigureCalls] = useState(1000);
  const [maxRuntimeMinutes, setMaxRuntimeMinutes] = useState(15);
  const [configureCallCount, setConfigureCallCount] = useState(0);
  const [debugIncludeHidden, setDebugIncludeHidden] = useState(false);
  const [includeSelectedOption, setIncludeSelectedOption] = useState(false);
  const [trimSessionIdBeforeConfigure, setTrimSessionIdBeforeConfigure] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [expandedResultKeys, setExpandedResultKeys] = useState<Record<string, boolean>>({});

  const traversalControlRef = useRef({ stop: false, pause: false });
  const runStartRef = useRef<number | null>(null);
  const configureCountRef = useRef(0);

  const visibleFeatures = state?.features ?? [];
  const hasFeatures = visibleFeatures.length > 0;

  const summaryPrice = useMemo(() => {
    if (state?.configuredPrice === undefined) return '-';
    return state.configuredPrice.toLocaleString(undefined, { style: 'currency', currency: 'GBP' });
  }, [state?.configuredPrice]);

  const updateElapsed = () => {
    if (!runStartRef.current) return;
    setElapsedMs(Date.now() - runStartRef.current);
  };

  const hasExceededRunLimits = () => {
    updateElapsed();
    if (results.length >= maxResults) return true;
    if (configureCountRef.current >= maxConfigureCalls) return true;
    if (runStartRef.current && Date.now() - runStartRef.current >= maxRuntimeMinutes * 60 * 1000) return true;
    return false;
  };

  const getTraversableFeatures = (nextState: NormalizedBikeBuilderState, includeHidden: boolean) => {
    const base = includeHidden ? [...(nextState.features ?? []), ...(nextState.hiddenOrSystemFeatures ?? [])] : [...(nextState.features ?? [])];
    return base
      .filter((feature) => includeHidden || (feature.isVisible !== false && feature.isEnabled !== false))
      .map((feature) => ({
        ...feature,
        availableOptions: feature.availableOptions.filter((option) => includeHidden || isOptionTraversable(option)),
      }));
  };

  const getSelectedOptions = (nextState: NormalizedBikeBuilderState) => {
    const source = getTraversableFeatures(nextState, debugIncludeHidden);
    return source
      .filter((feature) => feature.selectedOptionId)
      .map((feature) => {
        const selected = feature.availableOptions.find((opt) => opt.optionId === feature.selectedOptionId);
        return {
          featureLabel: feature.featureLabel,
          featureId: feature.featureId,
          optionLabel: selected?.label ?? feature.selectedOptionId ?? '(none)',
          optionId: feature.selectedOptionId ?? '(none)',
          optionValue: selected?.value ?? feature.selectedValue,
        } satisfies CapturedOption;
      })
      .sort((a, b) => a.featureId.localeCompare(b.featureId));
  };

  const signatureForState = (nextState: NormalizedBikeBuilderState) => {
    const selected = getSelectedOptions(nextState)
      .map((item) => `${item.featureId}:${item.optionId}:${item.optionValue ?? ''}`)
      .sort();
    return `${target.ruleset}::${selected.join('|')}`;
  };

  const pathToKey = (path: TraversalStep[]) => path.map((step) => `${step.featureId}:${step.optionId}:${step.optionValue ?? ''}`).join(' > ');

  const snapshotDropdownOrder = (nextState: NormalizedBikeBuilderState) =>
    getTraversableFeatures(nextState, debugIncludeHidden).map((feature, index) => {
      const selected = feature.availableOptions.find((option) => option.optionId === feature.selectedOptionId);
      return {
        level: index + 1,
        featureId: feature.featureId,
        featureLabel: feature.featureLabel,
        selectedOptionId: feature.selectedOptionId,
        selectedOptionLabel: selected?.label,
        selectedOptionValue: selected?.value ?? feature.selectedValue,
      };
    });

  const saveSnapshot = ({
    nextState,
    activeDetailId,
    rawSnippet,
    traversalLevel,
    traversalPath,
    parentPathKey,
    changedFeatureId,
    changedOptionId,
    changedOptionValue,
  }: {
    nextState: NormalizedBikeBuilderState;
    activeDetailId: string;
    rawSnippet?: unknown;
    traversalLevel: number;
    traversalPath: TraversalStep[];
    parentPathKey: string;
    changedFeatureId: string;
    changedOptionId: string;
    changedOptionValue?: string;
  }) => {
    const signature = signatureForState(nextState);

    const captured: CapturedConfiguration = {
      sequence: results.length + 1,
      timestamp: new Date().toISOString(),
      traversalLevel,
      traversalPath,
      traversalPathKey: pathToKey(traversalPath),
      parentPathKey,
      changedFeatureId,
      changedOptionId,
      changedOptionValue,
      ruleset: target.ruleset,
      namespace: target.namespace,
      headerId: target.headerId,
      detailId: activeDetailId,
      sessionId: nextState.sessionId,
      description: nextState.productDescription,
      ipn: nextState.ipnCode,
      price: nextState.configuredPrice,
      selectedOptions: getSelectedOptions(nextState),
      dropdownOrderSnapshot: snapshotDropdownOrder(nextState),
      signature,
      rawSnippet,
    };

    setResults((prev) => [...prev, { ...captured, sequence: prev.length + 1 }]);
  };

  const sleepWithControl = async (ms: number) => {
    const chunk = 250;
    let remaining = ms;

    while (remaining > 0) {
      if (traversalControlRef.current.stop) return false;
      if (traversalControlRef.current.pause) {
        setTraversalStatus('paused');
        while (traversalControlRef.current.pause && !traversalControlRef.current.stop) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          updateElapsed();
        }
        if (traversalControlRef.current.stop) return false;
        setTraversalStatus('running');
      }

      const waitFor = Math.min(chunk, remaining);
      await new Promise((resolve) => setTimeout(resolve, waitFor));
      remaining -= waitFor;
      updateElapsed();
    }

    return !traversalControlRef.current.stop;
  };

  const startFreshConfiguration = async (
    nextTarget = target,
    freshDetailId = crypto.randomUUID(),
    options?: { clearState?: boolean },
  ): Promise<CpqRouteResponse> => {
    setRequestState({ loading: true });
    setActiveFeatureId(null);
    if (options?.clearState !== false) {
      setState(null);
    }
    setDetailId(freshDetailId);

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
      const message = payload.details ?? payload.error ?? 'Failed to initialize configuration';
      setRequestState({ loading: false, error: message });
      throw new Error(message);
    }

    setState(payload.parsed);
    setLastCallType('StartConfiguration');
    setLastChangedFeatureId('');
    setLastChangedOptionId('');
    setLastChangedOptionValue('');
    setLastSelectedBefore('');
    setLastSelectedAfter('');
    setLastSelectedMatchSource('');
    setLastRawRequest(payload.requestBody ?? requestBody);
    setLastRawResponse(payload.rawResponse);
    setLastConfigureUrl('');
    setLastConfigureSelectionCount(0);
    setLastSessionIdSent('');
    setLastPreviousFeatureCurrentValue('');
    setLastRequestedOptionValue('');
    setLastReturnedFeatureCurrentValue('');
    setRequestState({ loading: false });
    return payload;
  };

  const onRulesetChange = async (nextRuleset: string) => {
    const nextTarget = { ...target, ruleset: nextRuleset, partName: nextRuleset };
    setTarget(nextTarget);
    try {
      await startFreshConfiguration(nextTarget, crypto.randomUUID());
    } catch {
      // handled above
    }
  };

  const configureSelection = async ({
    sourceState,
    featureId,
    optionId,
    optionValue,
  }: {
    sourceState: NormalizedBikeBuilderState;
    featureId: string;
    optionId: string;
    optionValue?: string;
  }): Promise<CpqRouteResponse> => {
    setRequestState({ loading: true });
    setActiveFeatureId(featureId);
    const sourceFeature = sourceState.features.find((feature) => feature.featureId === featureId);
    const selectedBefore = sourceFeature?.availableOptions.find((option) => option.optionId === sourceFeature.selectedOptionId);

    const requestBody = {
      sessionId: sourceState.sessionId,
      ruleset: target.ruleset,
      featureId,
      optionId,
      optionValue,
      trimSessionIdBeforeConfigure,
      context: { accountCode },
    };

    const res = await fetch('/api/cpq/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const payload = (await res.json()) as CpqRouteResponse;
    if (!res.ok) {
      const message = payload.details ?? payload.error ?? 'Failed to configure selection';
      setRequestState({ loading: false, error: message });
      setActiveFeatureId(null);
      throw new Error(message);
    }

    configureCountRef.current += 1;
    setConfigureCallCount(configureCountRef.current);
    setState(payload.parsed);
    setLastCallType('Configure');
    setLastChangedFeatureId(featureId);
    setLastChangedOptionId(optionId);
    setLastChangedOptionValue(optionValue ?? '');
    setLastSelectedBefore(selectedBefore?.label ?? sourceFeature?.selectedOptionId ?? '');
    const updatedFeature = payload.parsed.features.find((feature) => feature.featureId === featureId);
    const selectedAfter = updatedFeature?.availableOptions.find((option) => option.optionId === updatedFeature.selectedOptionId);
    setLastSelectedAfter(selectedAfter?.label ?? updatedFeature?.selectedOptionId ?? '');
    setLastSelectedMatchSource(updatedFeature?.selectedMatchSource ?? '');
    setLastRawRequest(payload.requestBody ?? requestBody);
    setLastRawResponse(payload.rawResponse);
    const debugRequest = payload.requestBody as { finalConfigureUrl?: string; sessionID?: string; selections?: unknown[] } | undefined;
    setLastConfigureUrl(debugRequest?.finalConfigureUrl ?? '');
    setLastSessionIdSent(debugRequest?.sessionID ?? '');
    setLastConfigureSelectionCount(Array.isArray(debugRequest?.selections) ? debugRequest.selections.length : 0);
    setLastPreviousFeatureCurrentValue(sourceFeature?.currentValue ?? '');
    setLastRequestedOptionValue(optionValue ?? '');
    setLastReturnedFeatureCurrentValue(updatedFeature?.currentValue ?? '');
    setRequestState({ loading: false });
    setActiveFeatureId(null);

    return payload;
  };

  const applyUiOptionChange = async ({
    featureId,
    optionId,
    optionValue,
    sourceStateOverride,
  }: {
    featureId: string;
    optionId: string;
    optionValue?: string;
    sourceStateOverride?: NormalizedBikeBuilderState;
  }) => {
    const sourceState = sourceStateOverride ?? state;
    if (!sourceState?.sessionId) {
      throw new Error('No active session to configure.');
    }
    return configureSelection({ sourceState, featureId, optionId, optionValue });
  };

  const changeOption = async (featureId: string, optionId: string, optionValue?: string) => {
    try {
      await applyUiOptionChange({ featureId, optionId, optionValue });
    } catch {
      // UI error state already set.
    }
  };

  const runSampler = async (seedState: NormalizedBikeBuilderState) => {
    let currentState = seedState;
    const currentDetailId = detailId;

    const features = getTraversableFeatures(currentState, debugIncludeHidden);
    for (const feature of features) {
      if (traversalControlRef.current.stop || hasExceededRunLimits()) return;
      setCurrentFeatureLabel(feature.featureLabel);

      const options = feature.availableOptions.filter(isOptionTraversable);
      for (const option of options) {
        if (traversalControlRef.current.stop || hasExceededRunLimits()) return;
        setCurrentOptionLabel(option.label);

        if (configureCountRef.current > 0) {
          const keepGoing = await sleepWithControl(delayMs);
          if (!keepGoing) return;
        }

        const payload = await configureSelection({
          sourceState: currentState,
          featureId: feature.featureId,
          optionId: option.optionId,
          optionValue: option.value,
        });

        currentState = payload.parsed;
        saveSnapshot({
          nextState: payload.parsed,
          activeDetailId: currentDetailId,
          rawSnippet: extractRawSnippet(payload.rawResponse),
          traversalLevel: 1,
          traversalPath: [{ featureId: feature.featureId, featureLabel: feature.featureLabel, optionId: option.optionId, optionLabel: option.label, optionValue: option.value }],
          parentPathKey: '',
          changedFeatureId: feature.featureId,
          changedOptionId: option.optionId,
          changedOptionValue: option.value,
        });
      }
    }
  };

  const replayPathFromFreshStart = async (path: TraversalStep[]) => {
    const freshDetailId = crypto.randomUUID();
    const initPayload = await startFreshConfiguration(target, freshDetailId, { clearState: false });
    let currentState = initPayload.parsed;

    for (const step of path) {
      if (traversalControlRef.current.stop || hasExceededRunLimits()) {
        return { state: currentState, detail: freshDetailId };
      }

      if (configureCountRef.current > 0) {
        const keepGoing = await sleepWithControl(delayMs);
        if (!keepGoing) return { state: currentState, detail: freshDetailId };
      }

      const payload = await configureSelection({
        sourceState: currentState,
        featureId: step.featureId,
        optionId: step.optionId,
        optionValue: step.optionValue,
      });

      currentState = payload.parsed;
    }

    return { state: currentState, detail: freshDetailId };
  };

  const getTraversalOptionsForFeature = (feature: NormalizedBikeBuilderState['features'][number]) =>
    feature.availableOptions.filter((option) => {
      if (!debugIncludeHidden && !isOptionTraversable(option)) return false;
      if (!includeSelectedOption && feature.selectedOptionId === option.optionId) return false;
      return true;
    });

  const runUiHierarchicalTraversal = async () => {
    const enumerate = async (pathPrefix: TraversalStep[], levelIndex: number): Promise<void> => {
      if (traversalControlRef.current.stop || hasExceededRunLimits()) return;
      if (levelIndex >= maxDepth) return;

      const restoredBranch = await replayPathFromFreshStart(pathPrefix);
      if (traversalControlRef.current.stop || hasExceededRunLimits()) return;

      const features = getTraversableFeatures(restoredBranch.state, debugIncludeHidden);
      const feature = features[levelIndex];
      if (!feature) return;

      setCurrentTraversalLevel(levelIndex + 1);
      setCurrentFeatureLabel(feature.featureLabel);
      setCurrentTraversalDetailId(restoredBranch.detail);
      setCurrentTraversalSessionId(restoredBranch.state.sessionId ?? '-');

      const options = getTraversalOptionsForFeature(feature);
      for (const option of options) {
        if (traversalControlRef.current.stop || hasExceededRunLimits()) return;

        const branch = await replayPathFromFreshStart(pathPrefix);
        if (traversalControlRef.current.stop || hasExceededRunLimits()) return;

        const branchFeatures = getTraversableFeatures(branch.state, debugIncludeHidden);
        const branchFeature = branchFeatures[levelIndex];
        if (!branchFeature) continue;

        const branchOption = branchFeature.availableOptions.find((candidate) => candidate.optionId === option.optionId);
        if (!branchOption) continue;
        if (!includeSelectedOption && branchFeature.selectedOptionId === branchOption.optionId) continue;

        setCurrentTraversalDetailId(branch.detail);
        setCurrentTraversalSessionId(branch.state.sessionId ?? '-');
        setCurrentOptionLabel(branchOption.label);
        const nextPath = [
          ...pathPrefix,
          {
            featureId: branchFeature.featureId,
            featureLabel: branchFeature.featureLabel,
            optionId: branchOption.optionId,
            optionLabel: branchOption.label,
            optionValue: branchOption.value,
          },
        ];
        setCurrentTraversalPathLabel(pathToKey(nextPath) || '-');

        if (configureCountRef.current > 0 || pathPrefix.length > 0) {
          const keepGoing = await sleepWithControl(delayMs);
          if (!keepGoing) return;
        }

        const payload = await applyUiOptionChange({
          sourceStateOverride: branch.state,
          featureId: branchFeature.featureId,
          optionId: branchOption.optionId,
          optionValue: branchOption.value,
        });

        saveSnapshot({
          nextState: payload.parsed,
          activeDetailId: branch.detail,
          rawSnippet: extractRawSnippet(payload.rawResponse),
          traversalLevel: levelIndex + 1,
          traversalPath: nextPath,
          parentPathKey: pathToKey(pathPrefix),
          changedFeatureId: branchFeature.featureId,
          changedOptionId: branchOption.optionId,
          changedOptionValue: branchOption.value,
        });

        await enumerate(nextPath, levelIndex + 1);
      }
    };

    await enumerate([], 0);
  };

  const startTraversal = async (mode: TraversalMode) => {
    if (!state) {
      setRequestState({ loading: false, error: 'Load a configuration before traversal.' });
      return;
    }

    traversalControlRef.current.stop = false;
    traversalControlRef.current.pause = false;
    runStartRef.current = Date.now();
    configureCountRef.current = 0;
    setConfigureCallCount(0);
    setElapsedMs(0);
    setCurrentFeatureLabel('-');
    setCurrentOptionLabel('-');
    setTraversalStatus('running');
    setActiveMode(mode);
    setRequestState({ loading: false });

    try {
      if (mode === 'sampler') await runSampler(state);
      if (mode === 'ui-hierarchical') await runUiHierarchicalTraversal();

      if (traversalControlRef.current.stop) {
        setTraversalStatus('stopped');
      } else if (hasExceededRunLimits()) {
        setTraversalStatus('completed');
      } else {
        setTraversalStatus('completed');
      }
    } catch (error) {
      setTraversalStatus('stopped');
      setRequestState({ loading: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      updateElapsed();
      setActiveMode(null);
      setCurrentFeatureLabel('-');
      setCurrentOptionLabel('-');
      setCurrentTraversalLevel(0);
      setCurrentTraversalPathLabel('-');
      setCurrentTraversalDetailId('-');
      setCurrentTraversalSessionId('-');
    }
  };

  const pauseTraversal = () => {
    traversalControlRef.current.pause = true;
    setTraversalStatus('paused');
  };

  const resumeTraversal = () => {
    traversalControlRef.current.pause = false;
    setTraversalStatus('running');
  };

  const stopTraversal = () => {
    traversalControlRef.current.stop = true;
    traversalControlRef.current.pause = false;
    setTraversalStatus('stopped');
  };

  const clearResults = () => {
    setResults([]);
    setExpandedResultKeys({});
  };

  const exportResults = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cpq-traversal-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
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
            <button style={styles.button} onClick={() => void startFreshConfiguration()} disabled={requestState.loading}>
              {requestState.loading ? 'Loading…' : 'Load / Restart'}
            </button>
            <button style={styles.secondaryButton} onClick={() => void startFreshConfiguration(target, crypto.randomUUID())} disabled={requestState.loading}>
              Restart with fresh detailId
            </button>
            <button style={styles.secondaryButton} onClick={() => setDebugOpen((v) => !v)}>
              {debugOpen ? 'Hide debug' : 'Show debug'}
            </button>
            <span style={styles.badge}>{state?.sessionId ? `session ${state.sessionId}` : 'no session'}</span>
          </div>
        </section>

        <section style={styles.controlPanel}>
          <div style={styles.controlActions}>
            <button style={styles.button} onClick={() => void startTraversal('sampler')} disabled={!state || traversalStatus === 'running'}>
              Start sampler
            </button>
            <button style={styles.button} onClick={() => void startTraversal('ui-hierarchical')} disabled={!state || traversalStatus === 'running'}>
              Start UI hierarchical traversal
            </button>
            <button style={styles.secondaryButton} onClick={pauseTraversal} disabled={traversalStatus !== 'running'}>
              Pause
            </button>
            <button style={styles.secondaryButton} onClick={resumeTraversal} disabled={traversalStatus !== 'paused'}>
              Resume
            </button>
            <button style={styles.secondaryButton} onClick={stopTraversal} disabled={traversalStatus !== 'running' && traversalStatus !== 'paused'}>
              Stop
            </button>
            <button style={styles.secondaryButton} onClick={exportResults} disabled={!results.length}>
              Export results JSON
            </button>
            <button style={styles.secondaryButton} onClick={clearResults}>
              Clear results
            </button>
          </div>
          <div style={styles.controlGrid}>
            <label style={styles.label}>
              Delay (ms)
              <input type="number" min={0} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value) || 0)} style={styles.input} />
            </label>
            <label style={styles.label}>
              Max depth
              <input type="number" min={1} value={maxDepth} onChange={(e) => setMaxDepth(Math.max(1, Number(e.target.value) || 1))} style={styles.input} />
            </label>
            <label style={styles.label}>
              Max results
              <input type="number" min={1} value={maxResults} onChange={(e) => setMaxResults(Math.max(1, Number(e.target.value) || 1))} style={styles.input} />
            </label>
            <label style={styles.label}>
              Max Configure calls
              <input
                type="number"
                min={1}
                value={maxConfigureCalls}
                onChange={(e) => setMaxConfigureCalls(Math.max(1, Number(e.target.value) || 1))}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Max runtime (minutes)
              <input
                type="number"
                min={1}
                value={maxRuntimeMinutes}
                onChange={(e) => setMaxRuntimeMinutes(Math.max(1, Number(e.target.value) || 1))}
                style={styles.input}
              />
            </label>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={debugIncludeHidden} onChange={(e) => setDebugIncludeHidden(e.target.checked)} />
              Include hidden/system features (debug)
            </label>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={includeSelectedOption} onChange={(e) => setIncludeSelectedOption(e.target.checked)} />
              Include currently selected option
            </label>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={trimSessionIdBeforeConfigure}
                onChange={(e) => setTrimSessionIdBeforeConfigure(e.target.checked)}
              />
              Trim session ID before Configure
            </label>
          </div>
          <div style={styles.statusRow}>
            <span style={styles.badge}>status: {traversalStatus}</span>
            <span style={styles.badge}>mode: {activeMode ?? '-'}</span>
            <span style={styles.badge}>level: {currentTraversalLevel || '-'}</span>
            <span style={styles.badge}>feature: {currentFeatureLabel}</span>
            <span style={styles.badge}>option: {currentOptionLabel}</span>
            <span style={styles.badge}>path: {currentTraversalPathLabel}</span>
            <span style={styles.badge}>results: {results.length}</span>
            <span style={styles.badge}>configure calls: {configureCallCount}</span>
            <span style={styles.badge}>elapsed: {(elapsedMs / 1000).toFixed(1)}s</span>
            <span style={styles.badge}>detailId: {currentTraversalDetailId}</span>
            <span style={styles.badge}>sessionId: {currentTraversalSessionId}</span>
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
              <div>
                <strong>Description:</strong> {state?.productDescription ?? '-'}
              </div>
              <div>
                <strong>IPN Code:</strong> {state?.ipnCode ?? '-'}
              </div>
              <div>
                <strong>Price:</strong> {summaryPrice}
              </div>
              <div>
                <strong>Ruleset:</strong> {target.ruleset}
              </div>
              <div>
                <strong>Namespace:</strong> {target.namespace}
              </div>
              <div>
                <strong>Header ID:</strong> {target.headerId}
              </div>
              <div>
                <strong>Detail ID:</strong> {detailId}
              </div>
              <div>
                <strong>Session ID:</strong> {state?.sessionId ?? '-'}
              </div>
            </div>

            <h2 style={styles.sectionTitle}>Captured results</h2>
            <div style={styles.resultsList}>
              {!results.length && <p style={styles.muted}>No captured configurations yet.</p>}
              {results.map((result) => {
                const key = result.signature + result.sequence;
                const isExpanded = Boolean(expandedResultKeys[key]);

                return (
                  <div key={key} style={styles.resultCard}>
                    <div style={styles.resultHeader}>
                      <strong>#{result.sequence}</strong>
                      <span style={styles.tinyMuted}>{new Date(result.timestamp).toLocaleString()}</span>
                    </div>
                    <div style={styles.resultMeta}>Detail: {result.detailId}</div>
                    <div style={styles.resultMeta}>Session: {result.sessionId}</div>
                    <div style={styles.resultMeta}>IPN Code: {result.ipn ?? '-'}</div>
                    <div style={styles.resultMeta}>Price: {typeof result.price === 'number' ? result.price : '-'}</div>
                    <button
                      style={styles.inlineButton}
                      onClick={() => setExpandedResultKeys((prev) => ({ ...prev, [key]: !isExpanded }))}
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                    {isExpanded && (
                      <pre style={styles.pre}>{JSON.stringify(result, null, 2)}</pre>
                    )}
                  </div>
                );
              })}
            </div>

            {debugOpen && (
              <div style={styles.debugCard}>
                <h3 style={styles.debugTitle}>Ruleset debug</h3>
                <ul style={styles.debugList}>
                  <li>lastCallType: {lastCallType}</li>
                  <li>lastChangedFeatureId: {lastChangedFeatureId || '-'}</li>
                  <li>lastChangedOptionId: {lastChangedOptionId || '-'}</li>
                  <li>lastChangedOptionValue: {lastChangedOptionValue || '-'}</li>
                  <li>final Configure URL: {lastConfigureUrl || '-'}</li>
                  <li>sessionID sent: {lastSessionIdSent || '-'}</li>
                  <li>changed feature id: {lastChangedFeatureId || '-'}</li>
                  <li>changed option id (local UI stable id): {lastChangedOptionId || '-'}</li>
                  <li>changed option value sent to CPQ: {lastChangedOptionValue || '-'}</li>
                  <li>number of selections sent: {lastConfigureSelectionCount}</li>
                  <li>selected option before change: {lastSelectedBefore || '-'}</li>
                  <li>selected option after Configure: {lastSelectedAfter || '-'}</li>
                  <li>matched selected option source: {lastSelectedMatchSource || '-'}</li>
                  <li>previous feature current value: {lastPreviousFeatureCurrentValue || '-'}</li>
                  <li>requested new option value: {lastRequestedOptionValue || '-'}</li>
                  <li>returned feature current value after Configure: {lastReturnedFeatureCurrentValue || '-'}</li>
                  <li>
                    requested/returned mismatch:{' '}
                    {lastRequestedOptionValue && lastReturnedFeatureCurrentValue && lastRequestedOptionValue !== lastReturnedFeatureCurrentValue
                      ? '⚠️ yes'
                      : 'no'}
                  </li>
                  <li>extracted IPN Code: {state?.ipnCode ?? '-'}</li>
                  <li>IPN source: {state?.debug?.ipnCodeSource ?? '-'}</li>
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
                  <summary>Configure IPN snippet</summary>
                  <pre style={styles.pre}>{JSON.stringify(state?.debug?.ipnCodeSnippet ?? null, null, 2)}</pre>
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

function isOptionTraversable(option: BikeBuilderFeatureOption) {
  return option.isSelectable !== false && option.isVisible !== false && option.isEnabled !== false;
}

function extractRawSnippet(rawResponse: unknown) {
  if (!rawResponse || typeof rawResponse !== 'object') return rawResponse;
  const input = rawResponse as Record<string, unknown>;
  return {
    Description: input.Description,
    IPNCode: input.IPNCode,
    Price: input.Price,
    SessionID: input.SessionID,
  };
}

const styles: Record<string, CSSProperties> = {
  page: { fontFamily: 'Inter, Arial, sans-serif', background: '#f6f7fb', minHeight: '100vh', padding: 16 },
  container: { maxWidth: 1360, margin: '0 auto', display: 'grid', gap: 12 },
  heading: { margin: '6px 0 8px', fontSize: 24 },
  topBar: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' },
  topGrid: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' },
  label: { display: 'grid', gap: 4, fontSize: 12, color: '#374151', fontWeight: 600 },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 },
  topActions: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' },
  button: { padding: '8px 12px', borderRadius: 8, border: '1px solid #1f2937', background: '#111827', color: '#fff', cursor: 'pointer' },
  secondaryButton: { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' },
  inlineButton: { padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 12 },
  badge: { fontSize: 12, padding: '5px 8px', borderRadius: 999, background: '#eef2ff', color: '#3730a3' },
  controlPanel: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 10 },
  controlActions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  controlGrid: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' },
  checkboxLabel: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    fontSize: 12,
    color: '#374151',
    fontWeight: 600,
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '8px 10px',
  },
  statusRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  layout: { display: 'grid', gap: 12, gridTemplateColumns: 'minmax(360px, 1fr) minmax(360px, 480px)' },
  leftColumn: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 8 },
  rightColumn: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 8, alignContent: 'start' },
  sectionTitle: { margin: '0 0 4px', fontSize: 16 },
  featureCard: { border: '1px solid #ebedf0', borderRadius: 10, padding: 8, display: 'grid', gap: 6, background: '#fcfcfd' },
  featureHeader: { fontSize: 13, fontWeight: 600, color: '#111827' },
  select: { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' },
  summaryCard: { border: '1px solid #ebedf0', borderRadius: 10, padding: 10, display: 'grid', gap: 6, fontSize: 13 },
  resultsList: { border: '1px solid #ebedf0', borderRadius: 10, padding: 8, display: 'grid', gap: 8, maxHeight: 520, overflow: 'auto' },
  resultCard: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, display: 'grid', gap: 4, background: '#fff' },
  resultHeader: { display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12 },
  resultMeta: { fontSize: 12, color: '#374151' },
  debugCard: { border: '1px solid #ebedf0', borderRadius: 10, padding: 10, display: 'grid', gap: 8, fontSize: 12 },
  debugTitle: { margin: 0, fontSize: 14 },
  debugList: { margin: 0, paddingLeft: 18, display: 'grid', gap: 4 },
  pre: { maxHeight: 220, overflow: 'auto', background: '#f8fafc', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' },
  tinyMuted: { fontSize: 11, color: '#6b7280' },
  muted: { color: '#6b7280', fontSize: 13 },
  error: { color: '#b91c1c', fontSize: 13, margin: 0 },
};
