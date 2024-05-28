import { motion } from "framer-motion";

import greetings from "../constants/greetings";
import useLoopThroughText from "../lib/hooks/useLoopThroughText";

const About = () => {
	const { currentIndex, loopThroughText, stopLooping } = useLoopThroughText(
		greetings.length,
		100,
	);

	const currentGreeting = greetings[currentIndex];

	return (
		<section className="relative flex h-screen flex-col justify-evenly py-4" id="about">
			<div className="flex w-full flex-col justify-end gap-4 px-12">
				<motion.span
					onMouseEnter={loopThroughText}
					onMouseLeave={stopLooping}
					className="font-rubik-scribble text-[15vmin] leading-none sm:text-[12vmin]"
					initial={{ opacity: 0, y: "-50%" }}
					whileInView={{ opacity: 1, y: "0" }}
					viewport={{ once: true }}
					transition={{ delay: 0.25, ease: "easeInOut", duration: 1 }}
				>
					{`${currentGreeting}!`}
				</motion.span>
				<motion.div
					className="flex w-fit flex-col self-end"
					initial={{ opacity: 0, y: "-50%" }}
					whileInView={{ opacity: 1, y: "0" }}
					viewport={{ once: true }}
					transition={{ delay: 0.25, ease: "easeInOut", duration: 1 }}
				>
					<span className="text-[10vmin] leading-none md:text-[8vmin]">
						{"I'm Jack."}
					</span>
					<span className="text-right text-lg sm:text-3xl">(John)</span>
				</motion.div>
			</div>
			<motion.div
				className="flex flex-col-reverse  items-center justify-evenly md:flex-row"
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ delay: 0.75, duration: 1, ease: "easeInOut" }}
			>
				<div className=" flex max-w-[75%] flex-col gap-6 font-sans text-[4.5vmin] uppercase leading-normal sm:pl-6 sm:pt-6 sm:text-[3.5vmin] md:max-w-[min(50vw,66vw)]">
					<span>I am a full stack developer based in San Francisco. </span>{" "}
					<span>
						I value elegant, minimalistic software that enhances user experience.
					</span>
					<span>I enjoy travel, language learning and hiking with my dogs.</span>
				</div>
				<div className="relative flex h-fit flex-col items-center align-middle">
					<img
						className=" max-h-[40vh] w-3/4 object-cover sm:w-[34vmin]"
						src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703920496/IMG_8366_ix17v0.jpg"
						alt="Me and my cat friend Tigre"
						draggable="false"
					/>
					<span className="mt-[5%]  font-inconsolata text-[4vmin] leading-normal sm:ml-[10%] sm:text-[max(2vmin,1.5vw)]">
						Me and my friend Tigre
					</span>
				</div>
			</motion.div>
		</section>
	);
};

export default About;
