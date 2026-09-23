import { Schema } from 'effect';

import type { BoardItem } from './types';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 3;

export const CameraSchema = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  z: Schema.Finite.check(
    Schema.isBetween({ minimum: MIN_ZOOM, maximum: MAX_ZOOM }),
  ),
});
export type Camera = typeof CameraSchema.Type;

export function screenToWorld(point: { x: number; y: number }, camera: Camera) {
  return {
    x: point.x / camera.z - camera.x,
    y: point.y / camera.z - camera.y,
  };
}

export function zoomCamera(
  camera: Camera,
  point: { x: number; y: number },
  nextZoom: number,
): Camera {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const anchor = screenToWorld(point, camera);
  return {
    x: point.x / z - anchor.x,
    y: point.y / z - anchor.y,
    z,
  };
}

export function fitCamera(
  items: BoardItem[],
  viewport = { width: window.innerWidth, height: window.innerHeight },
): Camera {
  if (items.length === 0) {
    return { x: viewport.width / 2, y: viewport.height / 2, z: 1 };
  }
  const bounds = items.map((item) => {
    const radians = (item.rotation * Math.PI) / 180;
    const rotatedWidth =
      Math.abs(item.width * Math.cos(radians)) +
      Math.abs(item.height * Math.sin(radians));
    const rotatedHeight =
      Math.abs(item.width * Math.sin(radians)) +
      Math.abs(item.height * Math.cos(radians));
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    return {
      minX: centerX - rotatedWidth / 2,
      minY: centerY - rotatedHeight / 2,
      maxX: centerX + rotatedWidth / 2,
      maxY: centerY + rotatedHeight / 2,
    };
  });
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  const boardWidth = Math.max(1, maxX - minX);
  const boardHeight = Math.max(1, maxY - minY);
  const sidePadding = viewport.width < 640 ? 34 : 72;
  const topPadding = 48;
  const bottomPadding = viewport.width < 640 ? 118 : 126;
  const usableWidth = viewport.width - sidePadding * 2;
  const usableHeight = viewport.height - topPadding - bottomPadding;
  const z = Math.min(
    1,
    Math.max(
      MIN_ZOOM,
      Math.min(usableWidth / boardWidth, usableHeight / boardHeight),
    ),
  );
  return {
    x: (sidePadding + usableWidth / 2) / z - (minX + boardWidth / 2),
    y: (topPadding + usableHeight / 2) / z - (minY + boardHeight / 2),
    z,
  };
}
