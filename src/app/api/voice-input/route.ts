import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';

// POST /api/voice-input
// Voice transcription proxy. In the browser we use the native Web Speech API
// when available. This route exists as a fallback for browsers without it
// (Safari STT is inconsistent per the spec §9). It accepts a base64 audio
// blob and returns text — wired through the ASR skill (z-ai-web-dev-sdk).
//
// For now this is a thin stub that acknowledges the request; the frontend
// primarily relies on the browser-native SpeechRecognition. When ASR is
// available in the SDK, swap in the real call.

const BodySchema = z.object({
  // base64-encoded audio (webm/wav). Optional — client may send a silent
  // placeholder when only echoing the browser-transcribed text back.
  audio: z.string().optional(),
  // If the client already transcribed locally (Web Speech API), just echo.
  transcript: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Browser-native path is the happy path; this endpoint exists for parity
  // and future server-side ASR. Echo back whatever the browser sent.
  if (parsed.data.transcript) {
    return NextResponse.json({ transcript: parsed.data.transcript });
  }

  return NextResponse.json(
    {
      transcript: '',
      note: 'No server-side ASR configured. Use the browser Web Speech API (already wired in the client).',
    },
    { status: 200 }
  );
}
