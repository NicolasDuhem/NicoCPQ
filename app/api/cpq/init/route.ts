import { NextRequest, NextResponse } from 'next/server';
import { startConfiguration } from '../../../../lib/cpq/client';
import { mapCpqToNormalizedState } from '../../../../lib/cpq/mappers';
import { mockInitState } from '../../../../lib/cpq/mock-data';
import { InitConfiguratorRequest } from '../../../../lib/cpq/types';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<InitConfiguratorRequest>;
  const ruleset = body.ruleset ?? process.env.NEXT_PUBLIC_CPQ_RULESET ?? process.env.CPQ_PART_NAME ?? 'BBLV6_G-LineMY26';

  const requestPayload: InitConfiguratorRequest = {
    ruleset,
    partName: body.partName ?? ruleset,
    namespace: body.namespace,
    headerId: body.headerId,
    detailId: body.detailId,
    profile: body.profile,
    instance: body.instance,
    context: body.context,
  };

  console.log('[cpq/init] request', requestPayload);

  if (process.env.CPQ_USE_MOCK === 'true') {
    const parsed = mockInitState(ruleset);
    return NextResponse.json({
      sessionId: parsed.sessionId,
      parsed,
      rawResponse: parsed.raw ?? parsed,
      requestBody: requestPayload,
      callType: 'StartConfiguration',
    });
  }

  try {
    const cpqResponse = await startConfiguration(requestPayload);
    const normalized = mapCpqToNormalizedState(cpqResponse, ruleset);

    return NextResponse.json({
      sessionId: normalized.sessionId,
      parsed: normalized,
      rawResponse: cpqResponse,
      requestBody: requestPayload,
      callType: 'StartConfiguration',
    });
  } catch (error) {
    console.error('[cpq/init] failed', error);
    return NextResponse.json(
      { error: 'CPQ init failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
