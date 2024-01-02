import useAbout from "./useAbout";

const About = () => {
	const { currentGreeting, loopThroughText, stopLooping } = useAbout();

	return (
		<section className="relative flex flex-col justify-evenly h-screen" id="about">
			<div className="flex flex-col justify-end  mx-[6vw] w-[calc(100%-12vw)]  gap-[1vh]">
				<span
					onMouseEnter={loopThroughText}
					onMouseLeave={stopLooping}
					style={{ fontFamily: "Rubik Scribble" }}
					className="leading-none text-[15vmin] sm:text-[12vmin]"
				>
					{`${currentGreeting}!`}
				</span>
				<div className="flex flex-col w-fit self-end">
					<span className="leading-none text-[12vmin] sm:text-[10vmin]">
						{"I'm Jack."}
					</span>
					<span className="text-right text-lg sm:text-3xl">(John)</span>
				</div>
			</div>
			<div className="flex justify-evenly  flex-col-reverse items-center sm:flex-row">
				<div className="mt-10 text-[5vmin] leading-normal uppercase font-sans gap-6 flex flex-col max-w-[75%] sm:pl-6 sm:text-[4vmin] sm:max-w-[min(50vw,66vw)]">
					<span>I am a full stack developer based in San Francisco</span>
					<span>
						I value elegant, minimalistic software that enhances user experience
					</span>
					<span>I enjoy travel, language learning and hiking with my dogs</span>
				</div>
				<div className="relative h-fit flex flex-col items-center">
					<img
						className=" object-cover  max-h-[40vh] w-3/4 sm:w-[34vmin]"
						src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703920496/IMG_8366_ix17v0.jpg"
						alt="Me and my cat friend Tigre"
					/>
					{/* TODO not close to right */}
					{/* <img
						className="absolute w-[130%] -left-1/4 -bottom-[22.75%]"
						src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703982209/tigre_circle_mtuhib.png"
						alt=""
					/> */}
					<span
						className=" mt-[5%]  leading-normal sm:ml-[10%] text-[4vmin] sm:text-[max(2vmin,1.5vw)]"
						style={{ fontFamily: "Inconsolata" }}
					>
						Me and my friend Tigre
					</span>
				</div>
			</div>
		</section>
	);
};

export default About;
