export interface IPortfolioProject {
	name: string;
	previewImg: string;
	description: string;
	repoUrl: string;
	liveUrl: string;
}

const projectsData: IPortfolioProject[] = [
	{
		name: "Schmedium Blog Platform",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1704262356/blog-api-frontend.jackwatters.dev_write_lppdlt.webp",
		description: "A blog platform with a WYSIWYG editor and user authentication.",
		repoUrl: "https://github.com/jackwatters45/blog-api",
		liveUrl: "https://blog-api-frontend.jackwatters.dev/",
	},
	{
		name: "Odin Book",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1704265614/odin-book.jackwatters.dev_user_6591f3a62e76436d6db8732c_5_cjvt8e.webp",

		description: "Facebook clone",
		repoUrl: "https://github.com/jackwatters45/odin-book",
		liveUrl: "https://odin-book.jackwatters.dev",
	},
	{
		name: "Team Send",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1713817686/team-send.jackwatters.dev__1_py7zpd.webp",
		description: "Easily send targeted bulk SMS to groups",
		repoUrl: "https://github.com/jackwatters45/team-send",
		liveUrl: "https://team-send.yatusabes.co/",
	},
	// {
	// 	name: "Responder",
	// 	previewImg:
	// 		"",
	// 	description: "Optimize Google Business replies using OpenAI. In	progress...",
	// 	repoUrl: "https://github.com/jackwatters45/responder",
	// 	liveUrl: "https://responder.yatusabes.co/",

	// },
	{
		name: "Notion-inspired Todo List",
		previewImg:
			"https://res.cloudinary.com/drheg5d7j/image/upload/v1704250919/www.todo-list.jackwatters.dev_d6bfe314-a75d-4b33-9bdd-edbf90a0f988__yfunny.webp",
		description: "Notion inspired todo list created using React",
		repoUrl: "https://github.com/jackwatters45/todo-list-react",
		liveUrl: "https://todo-list.jackwatters.dev/",
	},
];

export default projectsData;
