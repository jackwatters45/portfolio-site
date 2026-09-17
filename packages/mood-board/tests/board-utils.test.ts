import { describe, expect, it } from "vitest";

import {
  accessibleFieldColors,
  contrastRatio,
  DEFAULT_BOARD_BACKGROUND,
  formatHexColorInput,
  normalizeHexColor,
} from "../src/client/board/board-utils";

describe("custom hex colors", () => {
  it("normalizes lowercase six-digit values", () => {
    expect(formatHexColorInput("#c85a3d")).toBe("#C85A3D");
    expect(normalizeHexColor("#c85a3d")).toBe("#C85A3D");
  });

  it("preserves incomplete input without accepting it as a color", () => {
    expect(formatHexColorInput("#c85")).toBe("#C85");
    expect(normalizeHexColor("#C85")).toBeNull();
    expect(normalizeHexColor("#C85A3Z")).toBeNull();
    expect(normalizeHexColor("#C85A3D00")).toBeNull();
  });

  it("chooses accessible field text and selection colors", () => {
    expect(DEFAULT_BOARD_BACKGROUND).toBe("#EDEDED");
    for (const background of [
      DEFAULT_BOARD_BACKGROUND,
      "#242728",
      "#8A8A8A",
      "#777777",
      "#FF670D",
      "#919191",
    ]) {
      const colors = accessibleFieldColors(background);
      expect(contrastRatio(background, colors.foreground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(background, colors.muted)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(background, colors.selection)).toBeGreaterThanOrEqual(3);
    }
  });

  it("requires the exact #RRGGBB shape", () => {
    expect(normalizeHexColor("365b55")).toBeNull();
    expect(normalizeHexColor(" #C85A3D")).toBeNull();
    expect(normalizeHexColor("#C8 5A3D")).toBeNull();
  });
});
