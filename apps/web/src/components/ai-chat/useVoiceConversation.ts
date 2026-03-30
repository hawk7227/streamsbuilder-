'use client';

import { useCallback, useRef, useState } from 'react';

export function useVoiceConversation() {
  const [isRecording, setIsRecording]     = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking]       = useState(false);
  const [transcript, setTranscript]       = useState('');
  const [error, setError]                 = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const audioRef         = useRef<HTMLAudioElement | null>(null);

  // ── Record via MediaRecorder → stop returns Blob ───────────────────────────
  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Microphone access denied');
    }
  }, []);

  // ── Stop recording → send to Whisper via /api/voice/transcribe ────────────
  const stopRecording = useCallback(async (): Promise<string | null> => {
    const mr = mediaRecorderRef.current;
    if (!mr) return null;

    return new Promise((resolve) => {
      mr.onstop = async () => {
        setIsRecording(false);
        setIsTranscribing(true);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        // Stop all tracks
        mr.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        chunksRef.current = [];

        try {
          const form = new FormData();
          form.append('audio', blob, 'recording.webm');
          const res = await fetch('/api/voice/transcribe', {
            method: 'POST',
            credentials: 'include',
            body: form,
          });
          if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
          const data = await res.json() as { text?: string; error?: string };
          if (data.error) throw new Error(data.error);
          const text = data.text?.trim() ?? '';
          setTranscript(text);
          setIsTranscribing(false);
          resolve(text || null);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Transcription failed');
          setIsTranscribing(false);
          resolve(null);
        }
      };
      mr.stop();
    });
  }, []);

  // ── TTS via /api/voice/speak (ElevenLabs + OpenAI fallback) ───────────────
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(true);
    try {
      const res = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text, provider: 'auto' }),
      });
      if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
      const data = await res.json() as { audio?: string; mimeType?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (!data.audio) throw new Error('No audio returned');
      const audio = new Audio(data.audio);
      audioRef.current = audio;
      audio.onended = () => { setIsSpeaking(false); audioRef.current = null; };
      audio.onerror = () => { setIsSpeaking(false); audioRef.current = null; };
      await audio.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TTS failed');
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  return {
    isRecording,
    isTranscribing,
    isSpeaking,
    transcript,
    error,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
  };
}
