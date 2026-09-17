import type { MediaId } from "../lib/media";
import type { PublicId } from "../lib/public-api";

export const mediaUrl = (mediaId: MediaId): string =>
  `/api/owner/media/${encodeURIComponent(mediaId)}`;

export const publicMediaUrl = (publicId: PublicId, mediaId: MediaId): string =>
  `/api/public/boards/${encodeURIComponent(publicId)}/media/${encodeURIComponent(mediaId)}`;
