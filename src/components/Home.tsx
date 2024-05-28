import "../styles/animations/typewriter.css";
import { useTypingEffect } from "../lib/hooks/useTypingEffect";
import textDescriptions from "@/constants/textDescriptions";

const Home = () => {
	const subtitleText = useTypingEffect(textDescriptions);

	return (
		<section
			id="home"
			className="relative flex h-screen flex-col items-start justify-end p-10"
		>
			<div className="">
				<h1 className="font-bebas text-[24vw] leading-none antialiased md:text-[20vw] xl:text-[16vw]">
					Jack Watters
				</h1>
				<h2 className="typewriter min-h-[10vw] w-fit text-left font-inconsolata text-[8vw] font-medium lowercase leading-tight antialiased">
					{subtitleText}
				</h2>
			</div>
		</section>
	);
};

export default Home;
