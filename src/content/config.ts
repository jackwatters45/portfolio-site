import { defineCollection, z } from 'astro:content';

const postSchema = z.object({
  title: z.string(),
  pubDate: z.date(),
  description: z.string(),
  author: z.string(),
  tags: z.array(z.string()),
  draft: z.boolean().optional(),
});

const postsCollection = defineCollection({
  type: 'content',
  schema: postSchema,
});

export const collections = {
  posts: postsCollection,
};
