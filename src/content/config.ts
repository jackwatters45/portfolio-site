import { z, defineCollection } from "astro:content";

// posts
const postSchema = z.object({
	title: z.string(),
	pubDate: z.date(),
	description: z.string(),
	author: z.string(),
	image: z.object({
		url: z.string(),
		alt: z.string(),
	}),
	tags: z.array(z.string()),
});

const postsCollection = defineCollection({
	type: "content",
	schema: postSchema,
});

export type Post = z.infer<typeof postSchema>;

// all
export const collections = {
	posts: postsCollection,
};
