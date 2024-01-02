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
		<section className="relative flex flex-col h-[165vh]" id="projects">
			<div className="mx-12 mt-[25vh] ">
				<h2 className="text-9xl text-right">Some Projects</h2>
				<hr className="" />
			</div>
			<div
				className="absolute top-1/2 left-1/2 -translate-y-1/2  items-center -translate-x-1/2 flex justify-center gap-[2vw] select-none  h-[75vh]"
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
			<div className="absolute bottom-0 text-[5vw] w-full whitespace-nowrap overflow-hidden  mb-[15vh] ">
				<div className="inline-flex gap-[5vw] will-change-transform repeated-text my-2">
					{techStack1.map((technology, index) => (
						<span key={index}>{technology}</span>
					))}
				</div>
				<hr />
				<div className=" relative inline-flex gap-[5vw] will-change-transform repeated-text-reverse my-4">
					{techStack2.map((technology, index) => (
						<span key={index}>{technology}</span>
					))}
				</div>
			</div>
		</section>
	);
};

export default Projects;
