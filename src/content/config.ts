import { defineCollection, z } from "astro:content";

const postSchema = z.object({
	title: z.string(),
	pubDate: z.date(),
	description: z.string(),
	author: z.string(),
	tags: z.array(z.string()),
	published: z.boolean(),
	blogUrl: z.string(),
});

const postsCollection = defineCollection({
	type: "content",
	schema: postSchema,
});

export type Post = z.infer<typeof postSchema>;

export const collections = {
	posts: postsCollection,
};
