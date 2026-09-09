type ItemMetadataFields = {
  readonly kind: string;
  readonly src?: unknown;
  readonly mediaId?: unknown;
  readonly href?: unknown;
  readonly text?: unknown;
  readonly color?: unknown;
  readonly label?: unknown;
  readonly annotationTitle?: unknown;
  readonly annotationDescription?: unknown;
  readonly websiteUrl?: unknown;
  readonly websiteImageUrl?: unknown;
  readonly websiteTitle?: unknown;
  readonly websiteDescription?: unknown;
  readonly websiteSiteLabel?: unknown;
  readonly xDisplay?: unknown;
  readonly xTheme?: unknown;
  readonly xHideThread?: unknown;
  readonly xAuthorName?: unknown;
  readonly xAuthorHandle?: unknown;
  readonly xPostText?: unknown;
  readonly xPostDate?: unknown;
};

export type ItemMetadataScope = "private" | "public";

export const itemMetadataIssue = (
  item: ItemMetadataFields,
  scope: ItemMetadataScope,
): { readonly path: ReadonlyArray<string>; readonly issue: string } | undefined => {
  const qualifier = scope === "public" ? "public " : "";
  if (item.kind !== "note" && item.text !== undefined) {
    return { path: ["text"], issue: `Only ${qualifier}notes may contain text` };
  }
  if (item.kind === "note" && item.text === undefined) {
    return {
      path: ["text"],
      issue: scope === "public" ? "Public notes require text" : "Notes require text",
    };
  }
  if (item.kind !== "swatch" && item.color !== undefined) {
    return { path: ["color"], issue: `Only ${qualifier}swatches may contain color` };
  }
  if (item.kind === "swatch" && item.color === undefined) {
    return {
      path: ["color"],
      issue: scope === "public" ? "Public swatches require color" : "Swatches require color",
    };
  }
  if (
    item.kind !== "swatch" &&
    item.kind !== "spotify" &&
    item.kind !== "youtube" &&
    item.kind !== "audio" &&
    item.label !== undefined
  ) {
    return {
      path: ["label"],
      issue: `Only ${qualifier}swatches and audio cards may contain labels`,
    };
  }
  if (
    item.kind !== "image" &&
    item.kind !== "spotify" &&
    item.kind !== "youtube" &&
    item.kind !== "audio" &&
    item.kind !== "x" &&
    item.src !== undefined
  ) {
    return { path: ["src"], issue: `This ${qualifier}item kind cannot contain a source` };
  }
  if (item.kind !== "image" && item.kind !== "audio" && item.mediaId !== undefined) {
    return {
      path: ["mediaId"],
      issue: `Only ${qualifier}images and audio cards may contain managed media`,
    };
  }
  if (
    item.kind !== "image" &&
    (item.annotationTitle !== undefined || item.annotationDescription !== undefined)
  ) {
    return {
      path: ["annotationTitle"],
      issue: `Only ${qualifier}images may contain annotations`,
    };
  }

  const hasXMetadata =
    item.xDisplay !== undefined ||
    item.xTheme !== undefined ||
    item.xHideThread !== undefined ||
    item.xAuthorName !== undefined ||
    item.xAuthorHandle !== undefined ||
    item.xPostText !== undefined ||
    item.xPostDate !== undefined;
  if (item.kind !== "x" && hasXMetadata) {
    return { path: ["xDisplay"], issue: `Only ${qualifier}X cards may contain X metadata` };
  }

  const hasWebsiteMetadata =
    item.websiteUrl !== undefined ||
    item.websiteImageUrl !== undefined ||
    item.websiteTitle !== undefined ||
    item.websiteDescription !== undefined ||
    item.websiteSiteLabel !== undefined;
  if (item.kind !== "website" && hasWebsiteMetadata) {
    return {
      path: ["websiteUrl"],
      issue: `Only ${qualifier}website cards may contain website metadata`,
    };
  }

  if (item.kind !== "image" && item.href !== undefined) {
    return {
      path: ["href"],
      issue: `Only ${qualifier}images may have an external link`,
    };
  }
  return undefined;
};
