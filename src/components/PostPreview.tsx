import type { Post } from "@/content/config";
import type { CollectionEntry } from "astro:content";

interface PostPreviewProps {
	post: Post;
}

const PostPreview = ({ post }: PostPreviewProps) => {
	return (
		<div className="w-96">
			<div>{post.title}</div>
			<div>{post.pubDate.toLocaleDateString()}</div>
			<div>{post.description}</div>
		</div>
	);
};

export default PostPreview;
