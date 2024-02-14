import { mdiGithub, mdiOpenInNew } from "@mdi/js";
import Icon from "@mdi/react";
import type { HtmlHTMLAttributes } from "react";
import type { IPortfolioProject } from "../constants/projectsData";

interface ProjectCardProps
	extends HtmlHTMLAttributes<HTMLDivElement>,
		IPortfolioProject {}

const ProjectCard = ({
	name,
	previewImg,
	repoUrl,
	liveUrl,
	...props
}: ProjectCardProps) => {
	return (
		<div
			className="relative w-[36vmax] lg:w-[36vmin] h-[44vmax] lg:h-[44vmin] rounded transition-transform
    hover:scale-105 "
			{...props}
		>
			<img
				src={previewImg}
				alt="Project Preview"
				className="absolute inset-0 object-cover object-center h-full rounded"
				draggable="false"
			/>
			<div className="absolute flex inset-0 bg-black bg-opacity-30 z-10 rounded opacity-0 hover:opacity-100">
				<span className="mx-auto my-2 h-min text-2xl">{name}</span>
				<a
					className="absolute bottom-1.5 left-1.5"
					href={repoUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon path={mdiGithub} size={1} color={"#fffbeb"} />
				</a>
				<a
					className="absolute bottom-1.5 right-1.5"
					href={liveUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon path={mdiOpenInNew} size={1} color={"#fffbeb"} />
				</a>
			</div>
		</div>
	);
};

export default ProjectCard;