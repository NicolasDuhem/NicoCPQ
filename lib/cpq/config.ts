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

export const buildStartConfigurationPayload = (detailIdOverride?: string): CpqStartConfigurationPayload => {
  const { defaults } = readCpqConfig();

  return {
    inputParameters: {
      mode: 0,
      profile: defaults.profile,
      variantKey: null,
      application: {
        instance: defaults.instance,
        name: defaults.instance,
      },
      part: {
        namespace: defaults.namespace,
        name: defaults.partName,
      },
      headerDetail: {
        headerId: defaults.headerId,
        detailId: detailIdOverride ?? defaults.detailId,
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
