export interface IPortfolioProject {
	name: string;
	previewImg: string;
	repoUrl: string;
	liveUrl: string;
}

const projectsData: IPortfolioProject[] = [
	{
		name: "Odin Book",
		previewImg: "https://placehold.co/400",
		repoUrl: "https://github.com/jackwatters45/odin-book",
		liveUrl: "https://odin-book.jackwatters.dev",
	},
	{
		name: "Notion-inspired Todo List",
		previewImg: "https://placehold.co/400",
		repoUrl: "https://github.com/jackwatters45/todo-list-react",
		liveUrl: "https://todo-list.jackwatters.dev/",
	},
	{
		name: "Blog Api",
		previewImg: "https://placehold.co/400",
		repoUrl: "https://github.com/jackwatters45/blog-api",
		liveUrl: "https://blog-api-frontend.jackwatters.dev/",
	},

	{
		name: "Members Only",
		previewImg: "https://placehold.co/400",
		repoUrl: "https://github.com/jackwatters45/express-members-only",
		liveUrl: "https://members-only.jackwatters.dev/",
	},
	{
		name: "Example Personal Portfolio",
		previewImg: "https://placehold.co/400",
		repoUrl: "https://github.com/jackwatters45/example-personal-portfolio",
		liveUrl: "https://jackwattersportfolio01.web.app/",
	},
];

export default projectsData;
