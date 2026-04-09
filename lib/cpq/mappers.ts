import { BikeBuilderFeature, BikeBuilderFeatureOption, CpqApiEnvelope, NormalizedBikeBuilderState } from './types';

const asArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
};

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
};

const pick = (obj: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (key in obj) return obj[key];
  }
  return undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const flattenRecords = (value: unknown, matches: (key: string) => boolean): Record<string, unknown>[] => {
  const results: Record<string, unknown>[] = [];
  const queue: unknown[] = [value];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const record = asRecord(current);
    if (!record) continue;

    for (const [key, child] of Object.entries(record)) {
      if (matches(key) && Array.isArray(child)) {
        results.push(...asArray(child));
      }
      queue.push(child);
    }
  }

  return results;
};

const toCustomProperties = (value: unknown): Record<string, string> => {
  const record = asRecord(value);
  if (!record) return {};

  return Object.entries(record).reduce<Record<string, string>>((acc, [key, val]) => {
    if (typeof val === 'string') acc[key] = val;
    else if (typeof val === 'number' || typeof val === 'boolean') acc[key] = String(val);
    return acc;
  }, {});
};

const findSessionId = (root: Record<string, unknown>): { value?: string; field?: string } => {
  const directCandidates: Array<[string, unknown]> = [
    ['SessionId', pick(root, 'SessionId', 'sessionId')],
    ['ConfigurationSessionId', pick(root, 'ConfigurationSessionId', 'configurationSessionId')],
    ['DetailId', pick(root, 'DetailId', 'detailId')],
    ['ConfigurationId', pick(root, 'ConfigurationId', 'configurationId')],
  ];

  for (const [field, value] of directCandidates) {
    const cast = asString(value);
    if (cast) return { value: cast, field };
  }

  const queue: Array<{ path: string; value: unknown }> = [{ path: 'root', value: root }];
  const preferredKeys = new Set(['sessionid', 'detailid', 'configurationsessionid', 'configurationid']);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current.value)) {
      current.value.forEach((child, idx) => queue.push({ path: `${current.path}[${idx}]`, value: child }));
      continue;
    }

    const record = asRecord(current.value);
    if (!record) continue;

    for (const [key, val] of Object.entries(record)) {
      const keyNormalized = key.toLowerCase();
      if (preferredKeys.has(keyNormalized)) {
        const cast = asString(val);
        if (cast) return { value: cast, field: `${current.path}.${key}` };
      }
      queue.push({ path: `${current.path}.${key}`, value: val });
    }
  }

  return {};
};

const buildFeatures = (screenOptions: Record<string, unknown>[]): BikeBuilderFeature[] => {
  return screenOptions
    .map((screenOption, index) => {
      const selectableValues = asArray(pick(screenOption, 'SelectableValues', 'selectableValues', 'Values', 'values'));
      const currentValue = asString(pick(screenOption, 'Value', 'value'));

      const options: BikeBuilderFeatureOption[] = selectableValues.map((selectable) => {
        const customProperties = toCustomProperties(pick(selectable, 'CustomProperties', 'customProperties'));

        return {
          optionId: customProperties.OptionID ?? asString(pick(selectable, 'OptionID', 'Id', 'ID', 'Value')) ?? 'unknown-option',
          label: asString(pick(selectable, 'Caption', 'caption', 'Name', 'name', 'Value', 'value')) ?? 'Unknown option',
          value: asString(pick(selectable, 'Value', 'value')),
          isSelectable: asBoolean(pick(selectable, 'IsEnabled', 'isEnabled')) ?? true,
          isVisible: asBoolean(pick(selectable, 'IsVisible', 'isVisible')) ?? true,
          isEnabled: asBoolean(pick(selectable, 'IsEnabled', 'isEnabled')) ?? true,
          metadata: {
            FeatureID: customProperties.FeatureID,
            FeatureQuestion: customProperties.FeatureQuestion,
            FeatureSequence: asNumber(customProperties.FeatureSequence),
            LongDescription: customProperties.LongDescription,
            IPNCode: customProperties.IPNCode,
            MSRP: customProperties.MSRP,
            Price: customProperties.Price,
            PriceOption: customProperties.PriceOption,
            UnitWeight: customProperties.UnitWeight,
            ForecastAs: customProperties.ForecastAs,
            ShortDescription: customProperties.ShortDescription,
          },
        };
      });

      const exactMatch = options.find((option) => option.value !== undefined && option.value === currentValue);
      const fallbackOption = options.find((option) => option.isVisible !== false && option.isEnabled !== false);
      const selected = exactMatch ?? fallbackOption;
      const selectedOptionId = selected?.optionId;

      const selectedOptions = options.map((option) => ({
        ...option,
        selected: Boolean(selectedOptionId && option.optionId === selectedOptionId),
      }));

      const firstCustomProps = selectedOptions.find((opt) => opt.metadata)?.metadata;
      const featureIdFromMeta = firstCustomProps?.FeatureID;
      const featureQuestion = firstCustomProps?.FeatureQuestion;
      const featureSequence = firstCustomProps?.FeatureSequence;

      return {
        featureId: featureIdFromMeta ?? asString(pick(screenOption, 'ID', 'Id', 'id')) ?? `unknown-feature-${index + 1}`,
        featureName: featureQuestion ?? asString(pick(screenOption, 'Name', 'name')),
        featureLabel: asString(pick(screenOption, 'Caption', 'caption')) ?? asString(pick(screenOption, 'Name', 'name')) ?? 'Unknown feature',
        featureSequence,
        selectedOptionId,
        selectedValue: selected?.value,
        currentValue,
        displayType: asString(pick(screenOption, 'DisplayType', 'displayType')),
        isVisible: asBoolean(pick(screenOption, 'IsVisible', 'isVisible')) ?? true,
        isEnabled: asBoolean(pick(screenOption, 'IsEnabled', 'isEnabled')) ?? true,
        availableOptions: selectedOptions,
        __index: index,
      } as BikeBuilderFeature & { __index: number };
    })
    .sort((a, b) => {
      const seqA = a.featureSequence;
      const seqB = b.featureSequence;

      if (seqA !== undefined && seqB !== undefined) return seqA - seqB;
      if (seqA !== undefined) return -1;
      if (seqB !== undefined) return 1;
      return a.__index - b.__index;
    })
    .map(({ __index: _, ...feature }) => feature);
};

export const mapCpqToNormalizedState = (payload: CpqApiEnvelope, ruleset: string): NormalizedBikeBuilderState => {
  const root = payload as Record<string, unknown>;
  const pages = flattenRecords(root, (key) => key.toLowerCase() === 'pages');
  const screens = flattenRecords(root, (key) => key.toLowerCase() === 'screens');

  const screenOptionsFromScreens = screens.flatMap((screen) => asArray(pick(screen, 'ScreenOptions', 'screenOptions')));
  const screenOptionsFromPages = pages.flatMap((page) =>
    asArray(pick(page, 'Screens', 'screens')).flatMap((screen) => asArray(pick(screen, 'ScreenOptions', 'screenOptions'))),
  );

  const screenOptions =
    screenOptionsFromPages.length || screenOptionsFromScreens.length
      ? [...screenOptionsFromPages, ...screenOptionsFromScreens]
      : flattenRecords(root, (key) => key.toLowerCase() === 'screenoptions');

  const features = buildFeatures(screenOptions);
  const session = findSessionId(root);

  const visibleFeatureCount = features.filter((feature) => feature.isVisible !== false).length;

  return {
    sessionId: session.value ?? 'unknown-session',
    ruleset,
    pages,
    screens,
    screenOptions,
    productDescription: asString(pick(root, 'productDescription', 'description', 'Description')),
    ipnCode: asString(pick(root, 'ipnCode', 'ipn', 'itemNumber', 'IPN')),
    configuredPrice: asNumber(pick(root, 'configuredPrice', 'price', 'netPrice', 'Price')),
    totalWeight: asNumber(pick(root, 'totalWeight', 'weight', 'Weight')),
    bikeImageUrl: asString(pick(root, 'bikeImageUrl', 'imageUrl', 'ImageUrl')),
    selectedOptionIds: features
      .map((feature) => feature.selectedOptionId)
      .filter((id): id is string => Boolean(id)),
    features,
    debug: {
      sessionIdField: session.field,
      parsedFeatureCount: features.length,
      visibleFeatureCount,
      hiddenFeatureCount: features.length - visibleFeatureCount,
    },
    raw: payload,
  };
};
