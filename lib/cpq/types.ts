export type BikeBuilderContext = {
  accountCode: string;
  customerId?: string;
  currency?: string;
  language?: string;
};

export type BikeBuilderFeatureOption = {
  optionId: string;
  label: string;
  value?: string;
  isSelectable?: boolean;
};

export type BikeBuilderFeature = {
  featureId: string;
  featureLabel: string;
  selectedOptionId?: string;
  selectedValue?: string;
  availableOptions: BikeBuilderFeatureOption[];
};

export type NormalizedBikeBuilderState = {
  sessionId: string;
  ruleset: string;
  productDescription?: string;
  ipnCode?: string;
  configuredPrice?: number;
  totalWeight?: number;
  bikeImageUrl?: string;
  selectedOptionIds?: string[];
  features: BikeBuilderFeature[];
  raw?: unknown;
};

export type InitConfiguratorRequest = {
  ruleset: string;
  context?: Partial<BikeBuilderContext>;
};

export type ConfigureConfiguratorRequest = {
  sessionId: string;
  ruleset: string;
  featureId: string;
  optionId: string;
  context?: Partial<BikeBuilderContext>;
};

export type CpqApiEnvelope = {
  [key: string]: unknown;
};

export type CpqClientConfig = {
  baseUrl: string;
  ionApiToken?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
};
