'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

export function useVoiceConversation() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const startRecording = useCallback(async () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Speech recognition is not supported in this browser');
      return;
    }
    setError(null);
    setTranscript('');
    setIsTranscribing(true);
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event: any) => {
      let next = '';
      for (let i = 0; i < event.results.length; i += 1) next += event.results[i][0].transcript;
      setTranscript(next.trim());
    };
    recognition.onerror = (event: any) => setError(event.error || 'Voice recognition failed');
    recognition.onstart = () => { setIsRecording(true); setIsTranscribing(false); };
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopRecording = useCallback(async () => {
    recognitionRef.current?.stop();
    return transcript.trim() || null;
  }, [transcript]);

  const speak = useCallback(async (text: string) => {
    if (!text.trim() || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  useEffect(() => () => { recognitionRef.current?.stop(); if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel(); }, []);

  return { isRecording, isTranscribing, isSpeaking, transcript, error, startRecording, stopRecording, speak, stopSpeaking };
}
