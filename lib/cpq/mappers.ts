import { CpqApiEnvelope, NormalizedBikeBuilderState } from './types';

const asArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
};

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

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

export const mapCpqToNormalizedState = (
  payload: CpqApiEnvelope,
  ruleset: string,
): NormalizedBikeBuilderState => {
  const root = payload as Record<string, unknown>;
  const featureRows = asArray(pick(root, 'features', 'FeatureList', 'optionFeatures'));

  const features = featureRows.map((feature) => {
    const optionRows = asArray(pick(feature, 'availableOptions', 'options', 'Values'));
    const selectedOptionId = asString(pick(feature, 'selectedOptionId', 'selected', 'SelectedValueId'));

    return {
      featureId: asString(pick(feature, 'featureId', 'id', 'name', 'FeatureId')) ?? 'unknown-feature',
      featureLabel: asString(pick(feature, 'featureLabel', 'label', 'displayName', 'Description')) ?? 'Unknown feature',
      selectedOptionId,
      selectedValue: asString(pick(feature, 'selectedValue', 'SelectedValue', 'selectedLabel')),
      availableOptions: optionRows.map((option) => ({
        optionId: asString(pick(option, 'optionId', 'id', 'value', 'ValueId')) ?? 'unknown-option',
        label: asString(pick(option, 'label', 'description', 'DisplayName', 'value')) ?? 'Unknown option',
        value: asString(pick(option, 'value', 'code')),
        isSelectable: (pick(option, 'isSelectable', 'enabled') as boolean | undefined) ?? true,
      })),
    };
  });

  return {
    sessionId:
      asString(pick(root, 'sessionId', 'configurationId', 'SessionId')) ??
      asString(pick(root, 'id')) ??
      'unknown-session',
    ruleset,
    productDescription: asString(pick(root, 'productDescription', 'description', 'Description')),
    ipnCode: asString(pick(root, 'ipnCode', 'ipn', 'itemNumber', 'IPN')),
    configuredPrice: asNumber(pick(root, 'configuredPrice', 'price', 'netPrice', 'Price')),
    totalWeight: asNumber(pick(root, 'totalWeight', 'weight', 'Weight')),
    bikeImageUrl: asString(pick(root, 'bikeImageUrl', 'imageUrl', 'ImageUrl')),
    selectedOptionIds: features
      .map((feature) => feature.selectedOptionId)
      .filter((id): id is string => Boolean(id)),
    features,
    raw: payload,
  };
};
