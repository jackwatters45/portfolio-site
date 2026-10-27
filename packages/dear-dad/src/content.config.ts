import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const letters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/letters' }),
  schema: z.object({
    title: z.string().min(1),
    date: z.coerce.date(),
    draft: z.boolean().default(true),
  }),
});

export const collections = { letters };
