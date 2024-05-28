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

const coverLetterSchema = z.object({
	title: z.string(),
	company: z.string(),
	position: z.string(),
	date: z.date(),
});

const coverLettersCollection = defineCollection({
	type: "content",
	schema: coverLetterSchema,
});

export const collections = {
	posts: postsCollection,
	"cover-letter": coverLettersCollection,
};
