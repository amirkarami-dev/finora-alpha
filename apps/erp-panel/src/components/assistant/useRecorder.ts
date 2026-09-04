import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 60;

/** Tap-to-toggle microphone recording via MediaRecorder. */
export function useRecorder(onDone: (blob: Blob) => void, onBlocked: () => void) {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (recording) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onBlocked();
      return;
    }
    chunks.current = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      window.clearInterval(timer.current);
      setRecording(false);
      setSeconds(0);
      const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
      if (blob.size > 0) onDone(blob);
    };
    rec.start();
    setRecording(true);
    setSeconds(0);
    timer.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stop();
        return s + 1;
      });
    }, 1000);
  }, [recording, onDone, onBlocked, stop]);

  useEffect(() => () => { window.clearInterval(timer.current); stop(); }, [stop]);

  return { recording, seconds, start, stop, supported: typeof window !== 'undefined' && 'MediaRecorder' in window };
}
