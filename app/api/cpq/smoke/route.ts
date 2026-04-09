import { NextRequest, NextResponse } from 'next/server';
import { startConfigurationSmokeDebug } from '../../../../lib/cpq/client';

const createDetailId = (): string => crypto.randomUUID();

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { generateNewDetailId?: boolean; detailId?: string };
    const requestedDetailId =
      typeof body.detailId === 'string' && body.detailId.trim().length > 0
        ? body.detailId.trim()
        : body.generateNewDetailId
          ? createDetailId()
          : undefined;

    const debug = await startConfigurationSmokeDebug(requestedDetailId);

    return NextResponse.json({
      ok: debug.responseDebug.ok,
      requestDebug: debug.requestDebug,
      responseDebug: debug.responseDebug,
      configDebug: debug.configDebug,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'CPQ smoke test failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
