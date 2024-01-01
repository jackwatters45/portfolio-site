import theme from "@/styles/theme";
import { mdiGithub, mdiOpenInNew } from "@mdi/js";
import Icon from "@mdi/react";
import { HtmlHTMLAttributes } from "react";
import { IPortfolioProject } from "../constants/projectsData";

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
			className="relative w-[28vw] h-[32vw] rounded transition-transform
    hover:scale-110"
			{...props}
		>
			<img
				src={previewImg}
				alt="Project Preview"
				className="absolute inset-0 object-cover object-center h-full rounded"
			/>
			<div className="absolute flex inset-0 bg-black bg-opacity-30 z-10 rounded opacity-0 hover:opacity-100">
				<span className="mx-auto my-2 h-min text-2xl">{name}</span>
				<a
					className="absolute bottom-1.5 left-1.5"
					href={repoUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon path={mdiGithub} size={1} color={theme.colors.text1} />
				</a>
				<a
					className="absolute bottom-1.5 right-1.5"
					href={liveUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon path={mdiOpenInNew} size={1} color={theme.colors.text1} />
				</a>
			</div>
		</div>
	);
};

export default ProjectCard;
