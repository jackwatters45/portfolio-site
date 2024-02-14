// import ContactCard from "./ContactCard";
import "../styles/animations/typewriter.css";
import { useTypingEffect } from "../hooks/useTypingEffect";
import textDescriptions from "@/constants/textDescriptions";

const Home = () => {
	const subtitleText = useTypingEffect(textDescriptions);

	return (
		<section
			id="home"
			className="relative flex flex-col justify-end h-screen p-10 items-start"
		>
			<div className="my-12">
				<h1 className="text-[16vw] leading-none" style={{ fontFamily: "Bebas Neue" }}>
					Jack Watters
				</h1>
				<h2
					className="typewriter font-medium text-[6vw] lowercase text-left leading-tight min-h-[7.5vw] w-fit"
					style={{ fontFamily: "Inconsolata" }}
				>
					{subtitleText}
				</h2>
			</div>
			{/* <ContactCard /> */}
		</section>
	);
};

export default Home;
