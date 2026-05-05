import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return NextResponse.json(
    {
      error: {
        code: 'run_store_not_implemented',
        message: `Run result lookup for ${id} is planned for the long-running task phase. Current MVP returns results directly for synchronous capabilities.`,
      },
    },
    { status: 501 },
  );
}
