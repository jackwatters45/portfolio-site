export interface IPortfolioProject {
	name: string;
	previewImg: string;
	repoUrl: string;
	liveUrl: string;
}

const projectsData: IPortfolioProject[] = [
	{
		name: "Odin Book",
		previewImg:
			"https://images.unsplash.com/photo-1524781289445-ddf8f5695861?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1770&q=80",
		repoUrl: "https://github.com/jackwatters45/odin-book",
		liveUrl: "https://odin-book.jackwatters.dev",
	},
	{
		name: "Notion-inspired Todo List",
		previewImg:
			"https://images.unsplash.com/photo-1524781289445-ddf8f5695861?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1770&q=80",
		repoUrl: "https://github.com/jackwatters45/todo-list-react",
		liveUrl: "https://todo-list.jackwatters.dev/",
	},
	{
		name: "Blog Api",
		previewImg:
			"https://images.unsplash.com/photo-1524781289445-ddf8f5695861?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1770&q=80",
		repoUrl: "https://github.com/jackwatters45/blog-api",
		liveUrl: "https://blog-api-frontend.jackwatters.dev/",
	},

	{
		name: "Members Only",
		previewImg:
			"https://images.unsplash.com/photo-1524781289445-ddf8f5695861?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1770&q=80",
		repoUrl: "https://github.com/jackwatters45/express-members-only",
		liveUrl: "https://members-only.jackwatters.dev/",
	},
	{
		name: "Example Personal Portfolio",
		previewImg:
			"https://images.unsplash.com/photo-1524781289445-ddf8f5695861?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1770&q=80",
		repoUrl: "https://github.com/jackwatters45/example-personal-portfolio",
		liveUrl: "https://jackwattersportfolio01.web.app/",
	},
];

export default projectsData;
