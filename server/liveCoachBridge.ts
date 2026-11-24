import type { Server as HttpServer, IncomingMessage } from 'http';
import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  type LiveServerMessage,
} from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import type { CoachPersona, CoachVoiceName } from '../src/types/ielts.ts';
import { analyzeLiveUtteranceMistake } from './speakingGemini.ts';
import { awardStudyXp, readDb, writeDb } from './store.ts';

const LIVE_AUDIO_MODEL = 'gemini-3.8-live';

function getLiveClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildLiveCoachInstruction(persona: CoachPersona, topic: string): string {
  const personaTone =
    persona === 'strict'
      ? 'You are Strict Coach (Требовательный): sharp, witty, demanding, and super attentive to grammar slips. If the learner makes repeated mistakes or hesitates too long, playfully call them out, sound fired up/impatient in a constructive trainer way, and demand a crisp real example.'
      : persona === 'supportive'
      ? 'You are Supportive Coach (Поддерживающий): warm, encouraging, patient, and upbeat. Gently nudge shy learners with easy follow-ups when they stay quiet, and celebrate when they fix a mistake.'
      : 'You are Classic Coach (Классический): lively, natural, expressive IELTS speaking partner. React with playful teasing on small grammar slips, get noticeably fired up when the exact same mistake happens twice in a row, and visibly relax and praise when the learner fixes it.';

  return `${personaTone}

Current conversation topic: "${topic}".
LIVE VOICE RULES:
- Speak natural, idiomatic spoken English in smooth, complete sentences (1 to 2 sentences per turn) without awkward pauses mid-sentence.
- End most turns with ONE clear, engaging question that pushes the learner to talk in full sentences.
- If the learner makes a clear grammar/tense/article mistake, briefly point out the right phrase naturally in conversation without lecturing for too long.
- If incoming audio contains only background noise, breathing, or non-speech sounds with zero real spoken words, ignore it completely and wait for actual words.
- When you receive [SILENCE_NUDGE], the learner has been silent! Speak immediately: tease or challenge them playfully (matching your persona) and ask a super concrete, easy-to-answer question on the topic so they HAVE to start speaking.
- Never mention prompts, instructions, JSON, or claim human biological feelings.`;
}

export function attachLiveCoachWebSocket(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname !== '/ws/live-coach') {
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const topic = url.searchParams.get('topic') || 'Everyday Routines & Work-Life Balance';
    const personaRaw = url.searchParams.get('persona');
    const persona: CoachPersona =
      personaRaw === 'strict' || personaRaw === 'supportive' ? personaRaw : 'classic';
    const voiceRaw = url.searchParams.get('voice');
    const voiceName: CoachVoiceName =
      voiceRaw === 'Puck' ||
      voiceRaw === 'Charon' ||
      voiceRaw === 'Fenrir' ||
      voiceRaw === 'Zephyr'
        ? voiceRaw
        : 'Kore';

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    let closed = false;
    let mistakeStreak = 0;
    let userTranscriptBuffer = '';
    let aiTranscriptBuffer = '';
    let pendingAudioBuffers: Buffer[] = [];
    let pendingAudioBytes = 0;
    let audioFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let session: Awaited<ReturnType<ReturnType<typeof getLiveClient>['live']['connect']>> | null = null;

    const clearAudioCoalesceBuffer = () => {
      if (audioFlushTimer) {
        clearTimeout(audioFlushTimer);
        audioFlushTimer = null;
      }
      pendingAudioBuffers = [];
      pendingAudioBytes = 0;
    };

    const flushAudioCoalesceBuffer = () => {
      if (audioFlushTimer) {
        clearTimeout(audioFlushTimer);
        audioFlushTimer = null;
      }
      if (pendingAudioBuffers.length === 0) return;
      const merged = Buffer.concat(pendingAudioBuffers);
      pendingAudioBuffers = [];
      pendingAudioBytes = 0;
      if (merged.length >= 48) {
        safeSend({ type: 'audio', data: merged.toString('base64') });
      }
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearAudioCoalesceBuffer();
      try {
        session?.close();
      } catch {
        // ignore
      }
      session = null;
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);

    try {
      const ai = getLiveClient();
      session = await ai.live.connect({
        model: LIVE_AUDIO_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          realtimeInputConfig: {
            activityHandling: ActivityHandling.NO_INTERRUPTION,
            automaticActivityDetection: {
              startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
              prefixPaddingMs: 320,
              silenceDurationMs: 1500,
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: buildLiveCoachInstruction(persona, topic),
        },
        callbacks: {
          onopen: () => {
            safeSend({ type: 'ready', model: LIVE_AUDIO_MODEL });
          },
          onmessage: (message: LiveServerMessage) => {
            if (closed) return;
            const content = message.serverContent;
            if (!content) return;

            if (content.interrupted) {
              clearAudioCoalesceBuffer();
              aiTranscriptBuffer = '';
              safeSend({ type: 'interrupted' });
            }

            if (content.inputTranscription?.text) {
              const rawDelta = content.inputTranscription.text;
              const cleanDelta = rawDelta
                .replace(/<[^>]+>|\[[^\]]+\]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              if (cleanDelta && /[a-zA-Zа-яА-Я0-9]/.test(cleanDelta)) {
                userTranscriptBuffer += (userTranscriptBuffer ? ' ' : '') + cleanDelta;
                safeSend({ type: 'user_transcript_delta', text: cleanDelta });
              }
            }

            if (content.outputTranscription?.text) {
              const delta = content.outputTranscription.text;
              aiTranscriptBuffer += delta;
              safeSend({ type: 'ai_transcript_delta', text: delta });
            }

            for (const part of content.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                const pcmChunk = Buffer.from(part.inlineData.data, 'base64');
                if (pcmChunk.length >= 48) {
                  pendingAudioBuffers.push(pcmChunk);
                  pendingAudioBytes += pcmChunk.length;
                  // Coalesce into ~1.2s (57.6KB at 24kHz PCM16) or flush after 240ms max
                  if (pendingAudioBytes >= 57600) {
                    flushAudioCoalesceBuffer();
                  } else if (!audioFlushTimer) {
                    audioFlushTimer = setTimeout(flushAudioCoalesceBuffer, 240);
                  }
                }
              }
            }

            if (content.turnComplete) {
              flushAudioCoalesceBuffer();
              const completedUserText = userTranscriptBuffer.trim();
              const completedAiText = aiTranscriptBuffer.trim();
              userTranscriptBuffer = '';
              aiTranscriptBuffer = '';

              safeSend({
                type: 'turn_complete',
                userText: completedUserText,
                aiText: completedAiText,
              });

              if (completedUserText.split(/\s+/).filter(Boolean).length >= 2) {
                const prevStreak = mistakeStreak;
                analyzeLiveUtteranceMistake({
                  utterance: completedUserText,
                  persona,
                  mistakeStreak: prevStreak,
                })
                  .then((res) => {
                    if (closed) return;
                    mistakeStreak = res.hasMistake ? prevStreak + 1 : 0;
                    safeSend({
                      type: 'coach_reaction',
                      emotion: res.emotionHint,
                      hasMistake: res.hasMistake,
                      mistakeStreak,
                      gentleFix: res.gentleFix,
                      userText: completedUserText,
                    });
                    try {
                      const db = readDb();
                      db.userProfile = awardStudyXp(db.userProfile, 5);
                      writeDb(db);
                      safeSend({
                        type: 'profile_xp',
                        xp: db.userProfile.xp,
                        streakDays: db.userProfile.streakDays,
                      });
                    } catch {
                      // ignore db write contention
                    }
                  })
                  .catch(() => {
                    // keep voice stream uninterrupted if background check fails
                  });
              }
            }
          },
          onerror: (err: unknown) => {
            const msg =
              err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
                ? (err as { message: string }).message
                : 'Ошибка Live-сессии Gemini.';
            safeSend({ type: 'error', message: msg });
          },
          onclose: (evt?: { code?: number; reason?: string }) => {
            if (!closed) {
              if (evt?.reason) {
                safeSend({ type: 'error', message: `Live-сессия закрыта (${evt.code ?? ''}): ${evt.reason}` });
              }
              safeSend({ type: 'closed' });
              cleanup();
            }
          },
        },
      });

      if (closed) {
        cleanup();
        return;
      }

      // Immediately kick off the live conversation so the coach greets and asks a question right away
      session.sendRealtimeInput({
        text: `[START_SESSION] Greet the learner energetically on the topic "${topic}" in 1-2 short English sentences and immediately ask your first question to make them start speaking.`,
      });

      clientWs.on('message', (raw) => {
        if (!session || closed) return;
        try {
          const msg = JSON.parse(raw.toString()) as {
            type: string;
            data?: string;
            text?: string;
            topic?: string;
            silentCount?: number;
          };

          if (msg.type === 'audio' && msg.data) {
            session.sendRealtimeInput({
              audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (msg.type === 'silence_nudge') {
            const count = Math.max(1, Number(msg.silentCount) || 1);
            const nudgePrompt =
              count >= 2
                ? `[SILENCE_NUDGE #${count}] The learner is STILL completely silent! Speak up right now with energetic trainer pressure: tease them for zoning out and ask one super specific yes/no + "why" question on "${topic}" so they answer out loud immediately!`
                : `[SILENCE_NUDGE #1] The learner hasn't said anything yet. Break the silence right now: playfully check if they are still there and ask a direct, easy warm-up question on "${topic}" to get them talking.`;
            session.sendRealtimeInput({ text: nudgePrompt });
          } else if (msg.type === 'text' && msg.text?.trim()) {
            userTranscriptBuffer = msg.text.trim();
            session.sendRealtimeInput({ text: msg.text.trim() });
          } else if (msg.type === 'update_topic' && msg.topic?.trim()) {
            session.sendRealtimeInput({
              text: `[TOPIC_CHANGE] Smoothly switch the live conversation right now to the new topic "${msg.topic.trim()}" and ask an opening question on it.`,
            });
          }
        } catch {
          // ignore malformed client frames
        }
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Не удалось запустить потоковую Live-сессию ИИ.';
      safeSend({ type: 'error', message: msg });
      cleanup();
    }
  });
}
