"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Two minutes: a voice note longer than that is a podcast, and ~1 MB of webm. */
export const MAX_SECONDS = 120;

// Chrome and Firefox record webm, Safari mp4. The server tells the
// transcriber which one by the type.
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** Tap to start, tap to stop and send. Cancel throws it away. */
export function useRecorder(onDone: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const discard = useRef(false);
  const done = useRef(onDone);

  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    discard.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Este navegador no graba audio");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Sin permiso para el micrófono");
      return;
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const began = Date.now();
    const tick = window.setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) r.stop();
    }, 250);
    r.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    r.onstop = () => {
      window.clearInterval(tick);
      for (const t of stream.getTracks()) t.stop();
      setRecording(false);
      if (!discard.current && chunks.length > 0) done.current(new Blob(chunks, { type: r.mimeType || mimeType || "audio/webm" }));
    };
    discard.current = false;
    recorder.current = r;
    r.start();
    setSeconds(0);
    setRecording(true);
  }, []);

  // Leaving the page mid-recording drops it and frees the microphone.
  useEffect(() => cancel, [cancel]);

  return { recording, seconds, error, start, stop, cancel };
}

// 44 bytes of silence: played inside the tap, it lets iOS play the reply later.
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/** The spoken reply. `unlock` goes inside his tap, so iOS lets `play` run later. */
export function useReplyPlayer() {
  const player = useRef<HTMLAudioElement | null>(null);
  const play = useCallback((src: string) => {
    player.current ??= new Audio();
    player.current.src = src;
    void player.current.play().catch(() => undefined);
  }, []);
  const unlock = useCallback(() => {
    if (player.current) return;
    player.current = new Audio(SILENCE);
    void player.current.play().catch(() => undefined);
  }, []);
  return { play, unlock };
}

/** A note for `sendChat`: Safari records mp4, the rest webm. */
export function voiceForm(audio: Blob): FormData {
  const form = new FormData();
  form.append("audio", audio, audio.type.includes("mp4") ? "nota.mp4" : "nota.webm");
  return form;
}

/** A phone photo is 3 to 8 MB; 1600 px of JPEG is enough to read a plate or a scale. */
export async function resizePhoto(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo leer la foto"))), "image/jpeg", 0.85),
  );
}
