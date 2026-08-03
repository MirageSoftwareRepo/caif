import { useEffect, useRef, useState } from "react";

// Tipos mínimos de Web Speech API: no están en lib.dom.d.ts de TypeScript.
// Solo lo que este hook usa, no la spec completa.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

// Plan 10, §7. Dictado por voz agnóstico del proveedor: toda la integración
// con Web Speech API vive acá para que cambiar a Whisper self-hosted después
// (si la clínica necesita que el audio no salga a servidores de Google) no
// toque la UI — solo esta implementación.
export function useDictation(onFinalResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRestartRef = useRef(false);
  const onFinalResultRef = useRef(onFinalResult);
  onFinalResultRef.current = onFinalResult;

  const Ctor = getSpeechRecognitionCtor();
  const isSupported = !!Ctor;

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  const start = () => {
    if (!Ctor || recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.lang = "es-AR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          onFinalResultRef.current(result[0].transcript);
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
    };

    // El reconocimiento continuo se corta solo tras ~60s de silencio: si
    // todavía se quiere estar escuchando, se reinicia desde acá.
    recognition.onend = () => {
      if (shouldRestartRef.current) {
        recognition.start();
      } else {
        recognitionRef.current = null;
        setIsListening(false);
        setInterimText("");
      }
    };

    recognition.onerror = () => {
      shouldRestartRef.current = false;
      recognitionRef.current = null;
      setIsListening(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    shouldRestartRef.current = true;
    recognition.start();
    setIsListening(true);
  };

  const stop = () => {
    shouldRestartRef.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText("");
  };

  return { isSupported, isListening, interimText, start, stop };
}
