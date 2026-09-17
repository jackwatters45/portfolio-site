import { describe, expect, it, vi } from "vitest";

import { AudioPlaybackCoordinator } from "../src/client/media/audio-playback";

describe("audio playback coordinator", () => {
  it("pauses every other registered player", () => {
    const coordinator = new AudioPlaybackCoordinator();
    const first = vi.fn();
    const second = vi.fn();
    const spotify = vi.fn();
    coordinator.register("first", first);
    coordinator.register("second", second);
    coordinator.register("spotify", spotify);

    coordinator.playing("second");
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(spotify).toHaveBeenCalledOnce();
  });

  it("cleans up players and pauses everything on board exit", () => {
    const coordinator = new AudioPlaybackCoordinator();
    const first = vi.fn();
    const second = vi.fn();
    const unregister = coordinator.register("first", first);
    coordinator.register("second", second);
    unregister();
    coordinator.pauseAll();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
