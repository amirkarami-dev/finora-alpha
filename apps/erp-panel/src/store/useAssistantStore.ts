import { create } from 'zustand';
import i18n from '@/i18n';
import { chat, runTool, transcribe, type ChatMessage } from '@/services/assistant';
import { recordingToWavBase64 } from '@/utils/wav';
import type { Locale } from '@/types';

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Marks a user message that came from the microphone. */
  kind?: 'voice';
}

interface AssistantState {
  open: boolean;
  /** What the panel shows. */
  messages: UiMessage[];
  /** What the model sees (tool rounds included). Never persisted. */
  wire: ChatMessage[];
  pending: boolean;
  error?: string;
  setOpen: (open: boolean) => void;
  ask: (text: string) => Promise<void>;
  askVoice: (recording: Blob) => Promise<void>;
  newChat: () => void;
  clearError: () => void;
}

const MAX_TOOL_ROUNDS = 6;
const SUPPORTED_LOCALES: Locale[] = ['en', 'ar', 'fa', 'ku'];
const nextId = () => `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const locale = (): Locale => {
  const lang = i18n.language.slice(0, 2) as Locale;
  return SUPPORTED_LOCALES.includes(lang) ? lang : 'en';
};

/** Maps a server code to the message key the panel shows. */
function errorKey(err: unknown): string {
  const code = err instanceof Error ? err.message : '';
  if (code === 'assistant-unavailable') return 'assistant.unavailable';
  if (code === 'assistant-rate-limited') return 'assistant.rateLimited';
  if (code === 'assistant-bad-request') return 'assistant.badRequest';
  return 'assistant.failed';
}

/** Runs one question through the chat/tool loop. `kind` only marks how the user bubble is
 *  shown — voice questions ask exactly like typed ones once transcribed. */
async function ask(get: () => AssistantState, set: (partial: Partial<AssistantState>) => void, text: string, kind?: 'voice') {
  const question = text.trim();
  if (!question || get().pending) return;
  set({
    pending: true,
    error: undefined,
    messages: [...get().messages, { id: nextId(), role: 'user', text: question, kind }],
    wire: [...get().wire, { role: 'user', content: question }],
  });
  try {
    let wire = get().wire;
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const { message } = await chat(wire, locale());
      const calls = message.tool_calls ?? [];
      if (calls.length === 0 || round === MAX_TOOL_ROUNDS) {
        const answer = typeof message.content === 'string' ? message.content : '';
        wire = [...wire, { role: 'assistant', content: answer }];
        if (!answer) {
          set({ wire, error: 'assistant.failed' });
          return;
        }
        set({ wire, messages: [...get().messages, { id: nextId(), role: 'assistant', text: answer }] });
        return;
      }
      // The model wants data: run every call here, in the browser, and hand the results back.
      wire = [...wire, { role: 'assistant', content: message.content ?? null, tool_calls: calls }];
      for (const call of calls) {
        const result = await runTool(call.function.name, call.function.arguments);
        wire = [...wire, { role: 'tool', tool_call_id: call.id, name: call.function.name, content: JSON.stringify(result) }];
      }
      set({ wire });
    }
  } catch (err) {
    set({ error: errorKey(err) });
  } finally {
    set({ pending: false });
  }
}

export const useAssistantStore = create<AssistantState>()((set, get) => ({
  open: false,
  messages: [],
  wire: [],
  pending: false,
  setOpen: (open) => set({ open }),
  newChat: () => set({ messages: [], wire: [], error: undefined }),
  clearError: () => set({ error: undefined }),

  ask: (text) => ask(get, set, text),

  askVoice: async (recording) => {
    if (get().pending) return;
    set({ pending: true, error: undefined });
    try {
      const wav = await recordingToWavBase64(recording);
      const text = await transcribe(wav, locale());
      set({ pending: false });
      if (!text) {
        set({ error: 'assistant.nothingHeard' });
        return;
      }
      // Shown as the user's own words, then asked exactly like a typed question.
      await ask(get, set, text, 'voice');
    } catch (err) {
      set({ error: errorKey(err), pending: false });
    }
  },
}));
