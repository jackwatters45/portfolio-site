import ProjectCard from "./Card/ProjectCard";
import useProjectsAnimation from "@/hooks/useProjectsAnimation";
import { projectsData, techStack1, techStack2 } from "./constants";

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
		<section className="relative flex flex-col h-screen" id="projects">
			<div className="mx-12 my-24">
				<h2 className="text-9xl text-right">Some Projects</h2>
				<hr className="" />
			</div>
			<div
				className="absolute top-1/2 left-1/2 -translate-y-2/3  -translate-x-1/2 flex justify-center gap-[4vw] select-none"
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
			<div className="absolute bottom-[10vh] text-[5vw] w-full whitespace-nowrap overflow-hidden ">
				<div className="inline-flex gap-[5vw] will-change-transform repeated-text my-2">
					{techStack1.map((technology, index) => (
						<span key={index}>{technology}</span>
					))}
				</div>
				<hr />
				<div className="inline-flex gap-[5vw] will-change-transform repeated-text-reverse my-4">
					{techStack2.map((technology, index) => (
						<span key={index}>{technology}</span>
					))}
				</div>
			</div>
		</section>
	);
};

export default Projects;
