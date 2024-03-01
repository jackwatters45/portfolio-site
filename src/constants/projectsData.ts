export interface IPortfolioProject {
	name: string;
	previewImg: string;
	repoUrl: string;
	liveUrl: string;
}

const projectsData: IPortfolioProject[] = [
	{
		name: "Members Only",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1704250148/members-only.jackwatters.dev__tgbemy.webp",
		repoUrl: "https://github.com/jackwatters45/express-members-only",
		liveUrl: "https://members-only.jackwatters.dev/",
	},
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
	{
		name: "Wheres Waldo",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1704336771/jackwatters45.github.io_wheres-waldo-app__wbnfx1.webp",
		repoUrl: "https://github.com/jackwatters45/wheres-waldo-app",
		liveUrl: "https://jackwatters45.github.io/wheres-waldo-app/",
	},
	{
		name: "Example Personal Portfolio",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1704250294/jackwattersportfolio01.web.app__axyrgi.webp",
		repoUrl: "https://github.com/jackwatters45/example-personal-portfolio",
		liveUrl: "https://jackwattersportfolio01.web.app/",
	},
];

export default projectsData;
