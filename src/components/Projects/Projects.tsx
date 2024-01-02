import ProjectCard from "./Card/ProjectCard";
import useProjectsAnimation from "@/hooks/useProjectsAnimation";
import { projectsData, techStack1, techStack2 } from "./constants";
import "../../styles/animations/slide-animation.css";

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
			<h2 className="text-7xl sm:text-9xl mx-12 mt-[8vmax] lg:mt-[8vmin] text-right ">
				Some Projects
			</h2>
			<div className="relative flex-1 items-center flex justify-center mb-4 px-4 select-none">
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
			</div>
			<div className="text-[6vmax] 2xl:text-[8vmin] w-full whitespace-nowrap overflow-hidden flex flex-col gap-3">
				<div className="inline-flex gap-[5vw] will-change-transform repeated-text  leading-none">
					{techStack1.map((technology, index) => (
						<span key={index}>{technology}</span>
					))}
				</div>
				<hr />
				<div className="relative inline-flex gap-[5vw] will-change-transform repeated-text-reverse leading-none my-2">
					{techStack2.map((technology, index) => (
						<span key={index}>{technology}</span>
					))}
				</div>
			</div>
		</section>
	);
};

export default Projects;
