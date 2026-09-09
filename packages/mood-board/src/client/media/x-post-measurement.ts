export const MAX_X_POST_CARD_WIDTH = 1_100;
export const MAX_X_POST_VISUAL_SCALE = 2;

export const xPostVisualScale = (iframeWidth: number, availableWidth: number): number | null => {
  if (
    !Number.isFinite(iframeWidth) ||
    iframeWidth <= 0 ||
    !Number.isFinite(availableWidth) ||
    availableWidth <= 0
  )
    return null;
  return Math.min(MAX_X_POST_VISUAL_SCALE, Math.max(1, availableWidth / iframeWidth));
};

export const renderedXPostHeight = (
  iframeHeight: number,
  rootScrollHeight: number,
): number | null => {
  if (!Number.isFinite(iframeHeight) || iframeHeight < 100 || !Number.isFinite(rootScrollHeight)) {
    return null;
  }
  return Math.min(2_000, Math.max(240, Math.ceil(rootScrollHeight)));
};

export const measureRenderedXPostHeight = (
  iframe: Pick<HTMLIFrameElement, "offsetHeight">,
  root: Pick<HTMLElement, "scrollHeight">,
): number | null => renderedXPostHeight(iframe.offsetHeight, root.scrollHeight);
