import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 60;

/** Tap-to-toggle microphone recording via MediaRecorder. */
export function useRecorder(onDone: (blob: Blob) => void, onBlocked: () => void) {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const starting = useRef(false);
  const mounted = useRef(true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    // `starting`/`recorder.current` are refs, not the stale `recording` closure value, so this
    // guard also catches a second tap that fires while the first is still awaiting permission.
    if (starting.current || recorder.current) return;
    starting.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      starting.current = false;
      onBlocked();
      return;
    }
    if (!mounted.current || recorder.current) {
      // Unmounted, or another start already won the race, while permission was pending: don't
      // leave the mic hot.
      stream.getTracks().forEach((track) => track.stop());
      starting.current = false;
      return;
    }
    try {
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
      let elapsed = 0;
      timer.current = window.setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stop();
      }, 1000);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      onBlocked();
    } finally {
      starting.current = false;
    }
  }, [onDone, onBlocked, stop]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearInterval(timer.current);
      stop();
    };
  }, [stop]);

  return { recording, seconds, start, stop, supported: typeof window !== 'undefined' && 'MediaRecorder' in window };
}
