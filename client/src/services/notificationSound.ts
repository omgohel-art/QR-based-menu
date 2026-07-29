const SOUND_PATH = "/sounds/new-order.wav";

class NotificationSoundService {
  private audio: HTMLAudioElement | null = null;
  private ready = false;
  private unlocked = false;
  private pendingPlay: { volume: number } | null = null;
  private boundUnlock: (() => void) | null = null;

  private ensureAudio() {
    if (this.audio) return;
    if (typeof Audio === "undefined") return;
    this.audio = new Audio(SOUND_PATH);
    this.audio.preload = "auto";
    this.audio.volume = 1;
    this.audio.addEventListener("canplaythrough", () => {
      this.ready = true;
    });
    this.audio.addEventListener("error", () => {
      this.ready = false;
    });
  }

  private unlock = () => {
    if (this.unlocked) return;
    this.ensureAudio();
    if (!this.audio) return;
    this.audio.currentTime = 0;
    this.audio.play().then(() => {
      this.audio!.pause();
      this.audio!.currentTime = 0;
      this.unlocked = true;
      document.removeEventListener("click", this.unlock);
      document.removeEventListener("keydown", this.unlock);
      document.removeEventListener("touchstart", this.unlock);
      if (this.pendingPlay) {
        this.play(this.pendingPlay.volume);
        this.pendingPlay = null;
      }
    }).catch(() => {});
  };

  play(volume: number = 1) {
    this.ensureAudio();
    if (!this.audio) return;

    this.audio.volume = Math.max(0, Math.min(1, volume));

    if (!this.unlocked) {
      this.pendingPlay = { volume };
      document.addEventListener("click", this.unlock, { once: true });
      document.addEventListener("keydown", this.unlock, { once: true });
      document.addEventListener("touchstart", this.unlock, { once: true });
      return;
    }

    this.audio.currentTime = 0;
    this.audio.play().catch(() => {});
  }

  stop() {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  setVolume(volume: number) {
    if (!this.audio) return;
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }
}

export const notificationSound = new NotificationSoundService();
