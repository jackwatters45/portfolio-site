import { motion } from "framer-motion";

import "../styles/animations/repeated-text.css";
// import ProjectCard from "./ProjectCard";
import useProjectsAnimation from "../hooks/useProjectsAnimation";
import projectsData from "@/constants/projectsData";
import { techStack1, techStack2 } from "../constants/techStacks";
import Icon from "@mdi/react";
import { mdiGithub, mdiOpenInNew } from "@mdi/js";

const Projects = () => {
	const {
		trackRef,
		handleOnDown,
		handleOnUp,
		handleOnMove,
		handleKeyDown,
		focusedIndex,
	} = useProjectsAnimation(projectsData.length);

	return (
		<section
			className="relative flex h-screen flex-col justify-between gap-4"
			id="projects"
		>
			<motion.h2
				className="mx-12 mt-[8vmax] text-right text-7xl sm:text-[8vmax] lg:mt-[8vmin]"
				initial={{ opacity: 0, y: "-50%" }}
				whileInView={{ opacity: 1, y: "0" }}
				viewport={{ once: true }}
				transition={{ duration: 1, delay: 0.75, ease: "easeInOut" }}
			>
				Some Projects
			</motion.h2>
			<motion.div
				className="relative mb-4 flex flex-1 items-center justify-center px-4"
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ opacity: { delay: 1, duration: 3, ease: "easeInOut" } }}
			>
				<div
					className="absolute left-1/2 flex -translate-x-1/2 gap-[4vmin]"
					ref={trackRef}
					tabIndex={0}
					onKeyDown={handleKeyDown}
					role="listbox"
					aria-label="Project slider"
					onMouseDown={handleOnDown}
					onMouseUp={handleOnUp}
					onMouseMove={handleOnMove}
				>
					{projectsData.map((project, index) => (
						<div
							className="relative h-[44vmax] w-[36vmax] rounded transition-transform hover:scale-105 lg:h-[44vmin]
    lg:w-[36vmin] "
							role="option"
							aria-selected={focusedIndex === index}
							key={project.repoUrl}
							tabIndex={-1}
						>
							<img
								src={project.previewImg}
								alt="Project Preview"
								className="absolute inset-0 h-full rounded object-cover object-center"
								draggable="false"
							/>
							<div className="absolute inset-0 z-10 flex rounded bg-black bg-opacity-30 opacity-0 hover:opacity-100">
								<span className="mx-auto my-2 h-min text-2xl">{project.name}</span>
								<a
									className="absolute bottom-1.5 left-1.5"
									href={project.repoUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									<Icon path={mdiGithub} size={1} color={"#fffbeb"} />
								</a>
								<a
									className="absolute bottom-1.5 right-1.5"
									href={project.liveUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									<Icon path={mdiOpenInNew} size={1} color={"#fffbeb"} />
								</a>
							</div>
						</div>
					))}
				</div>
			</motion.div>
			<div className="block w-full overflow-hidden whitespace-nowrap text-[5vmax] 2xl:text-[7vmin]">
				<div className="repeated-text inline-block leading-none will-change-transform">
					{techStack1.map((technology, index) => (
						<span key={index} className="mx-12">
							{technology}
						</span>
					))}
				</div>
				<hr className="mb-2" />
				<div className="repeated-text-reverse inline-block leading-none will-change-transform">
					{techStack2.map((technology, index) => (
						<span key={index} className="mx-12">
							{technology}
						</span>
					))}
				</div>
			</div>
		</section>
	);
};

export default Projects;
