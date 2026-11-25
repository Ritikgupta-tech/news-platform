"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  summary: string;
  readingMinutes: number;
}

export function AudioArticlePlayer({ title, summary, readingMinutes }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState<1 | 1.25 | 1.5>(1);
  const [progress, setProgress] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const togglePlay = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Audio narration is not supported in this browser environment.");
      return;
    }

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setProgress(0);
      return;
    }

    window.speechSynthesis.cancel();
    const narrationText = `${title}. ... Summary: ${summary}. Full editorial dispatches and reporting follow below.`;
    const utterance = new SpeechSynthesisUtterance(narrationText);
    utterance.rate = rate;
    utteranceRef.current = utterance;

    // Pick an English voice if available
    const voices = window.speechSynthesis.getVoices();
    const englishVoice =
      voices.find((v) => v.lang.startsWith("en") && !v.name.includes("Google")) ||
      voices.find((v) => v.lang.startsWith("en"));
    if (englishVoice) utterance.voice = englishVoice;

    utterance.onboundary = (e) => {
      if (narrationText.length > 0) {
        setProgress(Math.min(100, Math.round((e.charIndex / narrationText.length) * 100)));
      }
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setProgress(100);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  };

  const cycleSpeed = () => {
    const nextRate: 1 | 1.25 | 1.5 = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : 1;
    setRate(nextRate);
    if (isPlaying && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setTimeout(togglePlay, 100);
    }
  };

  return (
    <div className="audio-article-player" role="region" aria-label="Executive Audio Dispatch">
      <div className="audio-player__inner">
        <div className="audio-player__crest">
          <span className="live-dot live-dot--amber" aria-hidden="true" />
          <span className="audio-player__badge">EXECUTIVE AUDIO EDITION</span>
        </div>

        <div className="audio-player__controls">
          <button
            type="button"
            className={`audio-player__play-btn ${isPlaying ? "is-playing" : ""}`}
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause audio dispatch" : "Listen to this audio dispatch"}
            title={isPlaying ? "Pause dispatch narration" : "Listen to article"}
          >
            {isPlaying ? (
              <span className="pause-icon" aria-hidden="true">❚❚</span>
            ) : (
              <span className="play-icon" aria-hidden="true">▶</span>
            )}
            <span className="play-btn__text">
              {isPlaying ? "Pause Narration" : "Listen to Dispatch"}
            </span>
          </button>

          <div className="audio-player__info">
            <span className="audio-player__title">
              Spoken Editorial Brief · {readingMinutes} min narrated edition
            </span>
            <div className="audio-player__progress-track" aria-hidden="true">
              <div
                className="audio-player__progress-fill"
                style={{ width: `${isPlaying ? Math.max(progress, 8) : 0}%` }}
              />
            </div>
          </div>

          <div className="audio-player__actions">
            {isPlaying ? (
              <div className="audio-bars" aria-hidden="true">
                <span className="bar" />
                <span className="bar" />
                <span className="bar" />
                <span className="bar" />
              </div>
            ) : null}

            <button
              type="button"
              className="audio-player__speed-btn"
              onClick={cycleSpeed}
              aria-label={`Playback speed: ${rate}x. Click to change.`}
              title="Change playback speed"
            >
              {rate}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
