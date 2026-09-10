import { Schema } from "effect";

export const MAX_IMAGE_ANNOTATION_TITLE_CHARACTERS = 120;
export const MAX_IMAGE_ANNOTATION_DESCRIPTION_CHARACTERS = 600;

export const normalizeImageAnnotationText = (
  value: string | undefined,
  maximum: number,
): string | undefined => {
  const normalized = value?.trim();
  if (!normalized || normalized.length > maximum) return undefined;
  return normalized;
};

export const ImageAnnotationTitleSchema = Schema.String.check(
  Schema.isLengthBetween(1, MAX_IMAGE_ANNOTATION_TITLE_CHARACTERS),
)
  .check(
    Schema.makeFilter((value) =>
      normalizeImageAnnotationText(value, MAX_IMAGE_ANNOTATION_TITLE_CHARACTERS) === value
        ? undefined
        : { path: [], issue: "Image annotation titles must be trimmed text" },
    ),
  )
  .pipe(Schema.brand("ImageAnnotationTitle"));
export type ImageAnnotationTitle = typeof ImageAnnotationTitleSchema.Type;
export const ImageAnnotationDescriptionSchema = Schema.String.check(
  Schema.isLengthBetween(1, MAX_IMAGE_ANNOTATION_DESCRIPTION_CHARACTERS),
)
  .check(
    Schema.makeFilter((value) =>
      normalizeImageAnnotationText(value, MAX_IMAGE_ANNOTATION_DESCRIPTION_CHARACTERS) === value
        ? undefined
        : { path: [], issue: "Image annotation descriptions must be trimmed text" },
    ),
  )
  .pipe(Schema.brand("ImageAnnotationDescription"));
export type ImageAnnotationDescription = typeof ImageAnnotationDescriptionSchema.Type;

export const normalizeImageAnnotationTitle = (
  value: string | undefined,
): ImageAnnotationTitle | undefined => {
  const normalized = normalizeImageAnnotationText(value, MAX_IMAGE_ANNOTATION_TITLE_CHARACTERS);
  return normalized === undefined ? undefined : ImageAnnotationTitleSchema.make(normalized);
};

export const normalizeImageAnnotationDescription = (
  value: string | undefined,
): ImageAnnotationDescription | undefined => {
  const normalized = normalizeImageAnnotationText(
    value,
    MAX_IMAGE_ANNOTATION_DESCRIPTION_CHARACTERS,
  );
  return normalized === undefined ? undefined : ImageAnnotationDescriptionSchema.make(normalized);
};
