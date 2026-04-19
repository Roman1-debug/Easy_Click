"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./SplashScreen.module.css";

export default function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackStartedRef = useRef(false);

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem("easyclick_splash_shown");
    if (alreadyShown) return;

    setVisible(true);
    sessionStorage.setItem("easyclick_splash_shown", "1");

    const audio = new Audio("/startup.mp3");
    audio.volume = 1;
    
    // Attempt automatic playback immediately
    audio.play().catch(() => {
      // Browsers block autoplay. Fallback: play on ANY interaction (even mouse move).
      console.log("Autoplay blocked. Will play on interaction.");
    });

    const playOnInteract = () => {
      audio.play().catch(() => {});
      window.removeEventListener("pointermove", playOnInteract);
      window.removeEventListener("pointerdown", playOnInteract);
      window.removeEventListener("keydown", playOnInteract);
    };

    window.addEventListener("pointermove", playOnInteract);
    window.addEventListener("pointerdown", playOnInteract);
    window.addEventListener("keydown", playOnInteract);

    const timer = setTimeout(() => {
      setVisible(false);
      audio.pause();
    }, 4000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", playOnInteract);
      window.removeEventListener("pointerdown", playOnInteract);
      window.removeEventListener("keydown", playOnInteract);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        <div className={styles.logoWrapper}>
          <div className={styles.cssLogo}>EasyClick</div>
        </div>
      </div>
      <div className={styles.footer}>
        <div className={styles.creditLine}>
          <span>Made by Roman</span>
          <div className={styles.socials}>
            <a
              className={styles.socialLink}
              href="https://www.linkedin.com/in/roman-qureshi-cyber/"
              target="_blank"
              rel="noreferrer"
              aria-label="LinkedIn"
            >
              LinkedIn
            </a>
            <a
              className={styles.socialLink}
              href="https://github.com/Roman1-debug"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
            >
              GitHub
            </a>
            <a
              className={styles.socialLink}
              href="mailto:qureshiroman.01@gmail.com"
              aria-label="Email"
            >
              Mail
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
