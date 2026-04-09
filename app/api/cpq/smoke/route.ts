import { NextResponse } from 'next/server';
import { startConfigurationRaw } from '../../../../lib/cpq/client';

export async function POST() {
  try {
    const result = await startConfigurationRaw();

    return NextResponse.json({
      ok: result.ok,
      upstreamStatus: result.status,
      json: result.data,
      text: result.data ? undefined : result.text,
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
