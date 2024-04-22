export interface IPortfolioProject {
	name: string;
	previewImg: string;
	repoUrl: string;
	liveUrl: string;
}

const projectsData: IPortfolioProject[] = [
	{
		name: "Schmedium Blog Platform",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1704262356/blog-api-frontend.jackwatters.dev_write_lppdlt.webp",
		repoUrl: "https://github.com/jackwatters45/blog-api",
		liveUrl: "https://blog-api-frontend.jackwatters.dev/",
	},
	{
		name: "Notion-inspired Todo List",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1704250919/www.todo-list.jackwatters.dev_d6bfe314-a75d-4b33-9bdd-edbf90a0f988__yfunny.webp",
		repoUrl: "https://github.com/jackwatters45/todo-list-react",
		liveUrl: "https://todo-list.jackwatters.dev/",
	},
	{
		name: "Team Send",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1713817686/team-send.jackwatters.dev__1_py7zpd.webp",
		repoUrl: "https://github.com/jackwatters45/team-send",
		liveUrl: "https://team-send.jackwatters.dev/",
	},
	{
		name: "Odin Book",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1704265614/odin-book.jackwatters.dev_user_6591f3a62e76436d6db8732c_5_cjvt8e.webp",
		repoUrl: "https://github.com/jackwatters45/odin-book",
		liveUrl: "https://odin-book.jackwatters.dev",
	},
	{
		name: "Public Repos Display",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1704337056/jackwatters45.github.io__1_vtnp0k.webp",
		repoUrl: "https://github.com/jackwatters45/jackwatters45.github.io",
		liveUrl: "https://jackwatters45.github.io/",
	},
];

export default projectsData;
