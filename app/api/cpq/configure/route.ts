import { NextRequest, NextResponse } from 'next/server';
import { configureSelection } from '../../../../lib/cpq/client';
import { mapCpqToNormalizedState } from '../../../../lib/cpq/mappers';
import { mockConfigureState, mockInitState } from '../../../../lib/cpq/mock-data';
import { BikeBuilderContext, ConfigureConfiguratorRequest, NormalizedBikeBuilderState } from '../../../../lib/cpq/types';

const defaultContext: BikeBuilderContext = {
  accountCode: process.env.CPQ_DEFAULT_ACCOUNT_CODE ?? 'A000',
  currency: process.env.CPQ_DEFAULT_CURRENCY ?? 'GBP',
  language: process.env.CPQ_DEFAULT_LANGUAGE ?? 'en-GB',
};

const buildContext = (input?: Partial<BikeBuilderContext>) => ({
  accountCode: input?.accountCode ?? defaultContext.accountCode,
  customerId: input?.customerId ?? process.env.CPQ_DEFAULT_CUSTOMER_ID,
  currency: input?.currency ?? defaultContext.currency,
  language: input?.language ?? defaultContext.language,
});

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ConfigureConfiguratorRequest & { currentState?: NormalizedBikeBuilderState };

  if (!body?.sessionId || !body.featureId || !body.optionId || !body.ruleset) {
    return NextResponse.json(
      { error: 'sessionId, ruleset, featureId and optionId are required' },
      { status: 400 },
    );
  }

  const context = buildContext(body.context);
  console.log('[cpq/configure] request', {
    sessionId: body.sessionId,
    featureId: body.featureId,
    optionId: body.optionId,
    context,
  });

  if (process.env.CPQ_USE_MOCK === 'true') {
    const current = body.currentState ?? mockInitState(body.ruleset);
    return NextResponse.json(mockConfigureState(current, body.featureId, body.optionId));
  }

  try {
    const cpqResponse = await configureSelection(body, { context });
    const normalized = mapCpqToNormalizedState(cpqResponse, body.ruleset);
    console.log('[cpq/configure] response', {
      sessionId: normalized.sessionId,
      features: normalized.features.length,
    });

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('[cpq/configure] failed', error);
    return NextResponse.json(
      { error: 'CPQ configure failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
