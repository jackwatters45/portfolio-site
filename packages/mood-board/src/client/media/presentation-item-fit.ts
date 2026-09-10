export type AvailablePresentationRoom = {
  readonly width: number;
  readonly height: number;
};

export const fitPresentationItemScale = (
  itemWidth: number,
  itemHeight: number,
  room: AvailablePresentationRoom,
): number => Math.min(room.width / itemWidth, room.height / itemHeight, 1.85);
