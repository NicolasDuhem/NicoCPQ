import { NextRequest, NextResponse } from 'next/server';
import { startConfiguration } from '../../../../lib/cpq/client';
import { mapCpqToNormalizedState } from '../../../../lib/cpq/mappers';
import { mockInitState } from '../../../../lib/cpq/mock-data';
import { BikeBuilderContext, InitConfiguratorRequest } from '../../../../lib/cpq/types';

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
  const body = (await req.json()) as InitConfiguratorRequest;

  if (!body?.ruleset) {
    return NextResponse.json({ error: 'ruleset is required' }, { status: 400 });
  }

  const context = buildContext(body.context);
  console.log('[cpq/init] request', { ruleset: body.ruleset, context });

  if (process.env.CPQ_USE_MOCK === 'true') {
    return NextResponse.json(mockInitState(body.ruleset));
  }

  try {
    const cpqResponse = await startConfiguration(body, { context });
    const normalized = mapCpqToNormalizedState(cpqResponse, body.ruleset);
    console.log('[cpq/init] response', {
      sessionId: normalized.sessionId,
      features: normalized.features.length,
    });

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('[cpq/init] failed', error);
    return NextResponse.json(
      { error: 'CPQ init failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
