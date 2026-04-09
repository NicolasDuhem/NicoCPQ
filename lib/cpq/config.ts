export type CpqStartConfigurationPayload = {
  inputParameters: {
    mode: number;
    profile: string;
    variantKey: null;
    application: {
      instance: string;
      name: string;
    };
    part: {
      namespace: string;
      name: string;
    };
    headerDetail: {
      headerId: string;
      detailId: string;
    };
    sourceHeaderDetail: {
      headerId: string;
      detailId: string;
    };
    integrationParameters: Array<{
      name: string;
      simpleValue: string;
      isNull: false;
      type: 'string';
    }>;
    rapidOptions: null;
  };
};

export type StartConfigurationOverrides = {
  namespace?: string;
  partName?: string;
  headerId?: string;
  detailId?: string;
  profile?: string;
  instance?: string;
};

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const readOrDefault = (key: string, fallback: string): string => process.env[key] ?? fallback;

export const readCpqConfig = () => {
  const baseUrl = readOrDefault(
    'CPQ_BASE_URL',
    'https://configurator.eu1.inforcloudsuite.com/api/v4/ProductConfiguratorUI.svc/json',
  ).replace(/\/$/, '');

  return {
    baseUrl,
    apiKey: requireEnv('CPQ_API_KEY'),
    timeoutMs: Number(process.env.CPQ_TIMEOUT_MS ?? 25000),
    defaults: {
      instance: readOrDefault('CPQ_INSTANCE', 'BROMPTON_TRN'),
      profile: readOrDefault('CPQ_PROFILE', 'Default'),
      namespace: readOrDefault('CPQ_NAMESPACE', 'Default'),
      partName: readOrDefault('CPQ_PART_NAME', 'BBLV6_G-LineMY26'),
      accountType: readOrDefault('CPQ_ACCOUNT_TYPE', 'Dealer'),
      currency: readOrDefault('CPQ_CURRENCY', 'GBP'),
      company: readOrDefault('CPQ_COMPANY', 'A000286'),
      customerLocation: readOrDefault('CPQ_CUSTOMER_LOCATION', 'GB'),
      headerId: readOrDefault('CPQ_HEADER_ID', 'Simulator'),
      detailId: readOrDefault('CPQ_DETAIL_ID', '2e1ece70-6c76-4a21-b985-6e1bfa342a24'),
    },
  };
};

export const buildStartConfigurationPayload = (overrides?: StartConfigurationOverrides): CpqStartConfigurationPayload => {
  const { defaults } = readCpqConfig();
  const namespace = overrides?.namespace ?? defaults.namespace;
  const partName = overrides?.partName ?? defaults.partName;
  const headerId = overrides?.headerId ?? defaults.headerId;
  const detailId = overrides?.detailId ?? defaults.detailId;
  const profile = overrides?.profile ?? defaults.profile;
  const instance = overrides?.instance ?? defaults.instance;

  return {
    inputParameters: {
      mode: 0,
      profile,
      variantKey: null,
      application: {
        instance,
        name: instance,
      },
      part: {
        namespace,
        name: partName,
      },
      headerDetail: {
        headerId,
        detailId,
      },
      sourceHeaderDetail: {
        headerId: '',
        detailId: '',
      },
      integrationParameters: [
        { name: 'AccountType', simpleValue: defaults.accountType, isNull: false, type: 'string' },
        { name: 'CurrencyCode', simpleValue: defaults.currency, isNull: false, type: 'string' },
        { name: 'Company', simpleValue: defaults.company, isNull: false, type: 'string' },
        { name: 'CustomerLocation', simpleValue: defaults.customerLocation, isNull: false, type: 'string' },
      ],
      rapidOptions: null,
    },
  };
};
