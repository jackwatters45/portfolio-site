import { motion } from "framer-motion";

import greetings from "../constants/greetings";
import useLoopThroughText from "../hooks/useLoopThroughText";

const useAbout = () => {
	const { currentIndex, loopThroughText, stopLooping } = useLoopThroughText(
		greetings.length,
		100,
	);

	const currentGreeting = greetings[currentIndex];

	return {
		currentGreeting,
		loopThroughText,
		stopLooping,
	};
};

const About = () => {
	const { currentGreeting, loopThroughText, stopLooping } = useAbout();

	return (
		<section className="relative flex flex-col justify-evenly h-screen" id="about">
			<div className="flex flex-col justify-end  mx-[6vw] w-[calc(100%-12vw)]  gap-[1vh]">
				<motion.span
					onMouseEnter={loopThroughText}
					onMouseLeave={stopLooping}
					style={{ fontFamily: "Rubik Scribble" }}
					className="leading-none text-[15vmin] sm:text-[12vmin]"
					initial={{ opacity: 0, y: "-50%" }}
					whileInView={{ opacity: 1, y: "0" }}
					viewport={{ once: true }}
					transition={{ delay: 0.25, ease: "easeInOut", duration: 1 }}
				>
					{`${currentGreeting}!`}
				</motion.span>
				<motion.div
					className="flex flex-col w-fit self-end"
					initial={{ opacity: 0, y: "-50%" }}
					whileInView={{ opacity: 1, y: "0" }}
					viewport={{ once: true }}
					transition={{ delay: 0.25, ease: "easeInOut", duration: 1 }}
				>
					<span className="leading-none text-[12vmin] sm:text-[10vmin]">
						{"I'm Jack."}
					</span>
					<span className="text-right text-lg sm:text-3xl">(John)</span>
				</motion.div>
			</div>
			<motion.div
				className="flex justify-evenly  flex-col-reverse items-center sm:flex-row"
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ delay: 0.75, duration: 1, ease: "easeInOut" }}
			>
				<div className="mt-10 text-[5vmin] leading-normal uppercase font-sans gap-6 flex flex-col max-w-[75%] sm:pl-6 sm:text-[4vmin] sm:max-w-[min(50vw,66vw)]">
					<span>I am a full stack developer based in San Francisco</span>
					<span>
						I value elegant, minimalistic software that enhances user experience
					</span>
					<span>I enjoy travel, language learning and hiking with my dogs</span>
				</div>
				<div className="relative h-fit flex flex-col items-center align-middle">
					<img
						className=" object-cover max-h-[40vh] w-3/4 sm:w-[34vmin]"
						src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703920496/IMG_8366_ix17v0.jpg"
						alt="Me and my cat friend Tigre"
						draggable="false"
					/>
					<span
						className=" mt-[5%]  leading-normal sm:ml-[10%] text-[4vmin] sm:text-[max(2vmin,1.5vw)]"
						style={{ fontFamily: "Inconsolata" }}
					>
						Me and my friend Tigre
					</span>
				</div>
			</motion.div>
		</section>
	);
};

export default About;
