import { motion } from "framer-motion";

import "../styles/animations/repeated-text.css";
import useProjectsAnimation from "../lib/hooks/useProjectsAnimation";
import projectsData from "@/constants/projectsData";
import { techStack1, techStack2 } from "../constants/techStacks";

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
			className="relative flex min-h-screen flex-col justify-between gap-16 py-16 sm:gap-32 lg:gap-48"
			id="projects"
		>
			<motion.h2
				className="px-12  text-right text-7xl sm:text-[8vmax] lg:mt-[8vmin]"
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
					className="left-1/2 flex -translate-x-1/2 gap-[5vmin]"
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
							className="relative h-[40vmax] w-[32vmax] rounded transition-transform hover:scale-105 lg:h-[40vmin]
    lg:w-[32vmin] "
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
							<div className="absolute inset-0 z-10 flex flex-col rounded bg-black bg-opacity-50 opacity-0 hover:opacity-100">
								<span className="mx-auto my-2 h-min text-2xl">{project.name}</span>
								<span className="mx-auto flex flex-grow -translate-y-6 items-center px-4 sm:px-8">
									{project.description}
								</span>
								<a
									className="absolute bottom-1.5 left-1.5"
									href={project.repoUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									<img src="/github.svg" alt="" className="h-5 w-5" />
								</a>
								<a
									className="absolute bottom-1.5 right-1.5"
									href={project.liveUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									<img src="/open-in-new.svg" alt="" className="h-5 w-5" />
								</a>
							</div>
						</div>
					))}
				</div>
			</motion.div>
			<div className="block w-full overflow-hidden whitespace-nowrap text-[5vmax] 2xl:text-[6vmin]">
				<div className="repeated-text inline-block leading-none will-change-transform">
					{techStack1.map((technology) => (
						<span key={technology} className="mx-12">
							{technology}
						</span>
					))}
				</div>
				<hr className="mb-2" />
				<div className="repeated-text-reverse inline-block leading-none will-change-transform">
					{techStack2.map((technology) => (
						<span key={technology} className="mx-12">
							{technology}
						</span>
					))}
				</div>
			</div>
		</section>
	);
};

export default Projects;
