// GET /api/download-zip
// Serves the last-minute-pilot.zip file for download.
// This bypasses the platform's "Download workspace" button which may timeout
// on large workspaces. The zip contains only the source code (no node_modules).

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function GET() {
  const zipPath = path.join(process.cwd(), 'last-minute-pilot.zip');

  if (!existsSync(zipPath)) {
    return NextResponse.json(
      { error: 'Zip file not found. Run the build first.' },
      { status: 404 }
    );
  }

  const fileBuffer = await readFile(zipPath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="last-minute-pilot.zip"',
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'no-cache',
    },
  });
}
