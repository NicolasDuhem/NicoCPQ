import { NextRequest, NextResponse } from 'next/server';
import { startConfiguration } from '../../../../lib/cpq/client';
import { mapCpqToNormalizedState } from '../../../../lib/cpq/mappers';
import { mockInitState } from '../../../../lib/cpq/mock-data';
import { InitConfiguratorRequest } from '../../../../lib/cpq/types';

/**
 * NOTE FOR NEXT STEP (Configure flow):
 * StartConfiguration responses must expose a stable session/configuration identifier
 * (for example sessionId/SessionId/configurationId) that will be required in Configure requests.
 * We also need the returned mutable state payload (often details/screens/options) to pass back.
 */

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<InitConfiguratorRequest>;
  const ruleset = body.ruleset ?? process.env.NEXT_PUBLIC_CPQ_RULESET ?? 'BBLV6_G-LineMY26';

  console.log('[cpq/init] request', {
    ruleset,
    notes: 'Using StartConfiguration inputParameters payload based on known working Postman request.',
  });

  if (process.env.CPQ_USE_MOCK === 'true') {
    const parsed = mockInitState(ruleset);
    return NextResponse.json({
      sessionId: parsed.sessionId,
      parsed,
      rawResponse: parsed.raw ?? parsed,
    });
  }

  try {
    const cpqResponse = await startConfiguration({ ruleset });
    const normalized = mapCpqToNormalizedState(cpqResponse, ruleset);

    console.log('[cpq/init] response', {
      sessionId: normalized.sessionId,
      features: normalized.features.length,
    });

    return NextResponse.json({
      sessionId: normalized.sessionId,
      parsed: normalized,
      rawResponse: cpqResponse,
    });
  } catch (error) {
    console.error('[cpq/init] failed', error);
    return NextResponse.json(
      { error: 'CPQ init failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
