import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const review = z.object({
  score: z.number().min(0).max(10).nullable().default(null),
  review: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value ?? ''),
});

const ratings = z.object({ meg: review, jack: review });

const restaurants = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/restaurants' }),
  schema: z
    .object({
      name: z.string().trim().min(1),
      suburb: z.string().trim().min(1),
      address: z.string().trim().optional(),
      mapsUrl: z.string().url().startsWith('https://').optional(),
      coordinates: z
        .tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])
        .optional(),
      visited: z.string().date().optional(),
      draft: z.boolean().default(true),
      ratings,
      items: z
        .array(
          z.object({
            name: z
              .string()
              .trim()
              .nullish()
              .transform((value) => value ?? ''),
            price: z.number().nonnegative().nullable().default(null),
            ratings,
          }),
        )
        .min(1),
    })
    .superRefine((data, ctx) => {
      if (data.draft) return;
      const complete = (value: z.infer<typeof ratings>) =>
        [value.meg, value.jack].every(
          ({ score, review }) => score !== null && review.length > 0,
        );
      if (
        !data.visited ||
        !complete(data.ratings) ||
        data.items.some(
          (item) =>
            !item.name || item.price === null || !complete(item.ratings),
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Published restaurants need a visit date, complete Meg and Jack reviews, item names, and prices.',
        });
      }
    }),
});

export const collections = { restaurants };
