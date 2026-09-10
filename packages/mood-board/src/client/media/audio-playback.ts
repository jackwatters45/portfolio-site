export type PausePlayback = () => void;

export class AudioPlaybackCoordinator {
  readonly #players = new Map<string, PausePlayback>();

  register(id: string, pause: PausePlayback): () => void {
    this.#players.set(id, pause);
    return () => {
      if (this.#players.get(id) === pause) this.#players.delete(id);
    };
  }

  playing(id: string): void {
    for (const [playerId, pause] of this.#players) {
      if (playerId !== id) pause();
    }
  }

  pauseAll(): void {
    for (const pause of this.#players.values()) pause();
  }
}
