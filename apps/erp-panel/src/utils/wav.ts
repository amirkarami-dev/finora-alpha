/**
 * Turns whatever `MediaRecorder` produced (webm/opus in Chrome, mp4 in Safari) into a 16 kHz
 * mono 16-bit PCM WAV, base64-encoded — the one audio shape the assistant endpoint accepts.
 * Decoding happens in the browser's own decoder, so no library is needed.
 */
export async function recordingToWavBase64(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const decoder = new AudioContext();
  const decoded = await decoder.decodeAudioData(bytes);
  await decoder.close();

  const targetRate = 16_000;
  const length = Math.ceil(decoded.duration * targetRate);
  const offline = new OfflineAudioContext(1, length, targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  const wav = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(wav);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true); // byte rate
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  let binary = '';
  const out = new Uint8Array(wav);
  for (let i = 0; i < out.length; i += 0x8000) {
    binary += String.fromCharCode(...out.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
