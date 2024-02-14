import { motion } from "framer-motion";

// import "../styles/animations/repeated-text.css";
import ProjectCard from "./ProjectCard";
import useProjectsAnimation from "../hooks/useProjectsAnimation";
import projectsData from "@/constants/projectsData"; 
import {
techStack1, techStack2 } from "../constants/techStacks";

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
			className="relative flex flex-col justify-between gap-4 h-screen"
			id="projects"
		>
			<motion.h2
				className="text-7xl sm:text-[8vmax] mx-12 mt-[8vmax] lg:mt-[8vmin] text-right"
				initial={{ opacity: 0, y: "-50%" }}
				whileInView={{ opacity: 1, y: "0" }}
				viewport={{ once: true }}
				transition={{ duration: 1, delay: 0.75, ease: "easeInOut" }}
			>
				Some Projects
			</motion.h2>
			<motion.div
				className="relative flex-1 items-center flex justify-center mb-4 px-4"
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ opacity: { delay: 1, duration: 3, ease: "easeInOut" } }}
			>
				<div
					className="absolute flex gap-[4vmin] left-1/2 -translate-x-1/2"
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
						<ProjectCard
							key={project.repoUrl}
							{...project}
							tabIndex={-1}
							role="option"
							aria-selected={focusedIndex === index}
						/>
					))}
				</div>
			</motion.div>
			<div className="text-[5vmax] 2xl:text-[7vmin] w-full whitespace-nowrap overflow-hidden block">
				<div className="inline-block will-change-transform repeated-text leading-none">
					{techStack1.map((technology, index) => (
						<span key={index} className="mx-12">
							{technology}
						</span>
					))}
				</div>
				<hr className="mb-2" />
				<div className="inline-block will-change-transform repeated-text-reverse leading-none">
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