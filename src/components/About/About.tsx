import useAbout from "./useAbout";

const About = () => {
	const { currentGreeting, loopThroughText, stopLooping } = useAbout();

	return (
		<section className="relative flex flex-col justify-end h-screen" id="about">
			<div className="flex flex-col justify-end mt-[15vh] mx-24 w-[calc(100%-12rem)]">
				<div
					className="flex justify-between text-[6rem]"
					style={{ fontFamily: "Rubik Scribble" }}
				>
					<span onMouseEnter={loopThroughText} onMouseLeave={stopLooping}>
						{`${currentGreeting}!`}
					</span>
					<span>{" I'm Jack."}</span>
				</div>
				<span className="text-right text-2xl">(John)</span>
			</div>
			<div className="flex justify-evenly mt-6">
				<div className="mt-6 pl-6 text-[3.2vw] leading-normal uppercase font-sans gap-6 flex flex-col max-w-[66.6%]">
					<span>I am a full stack developer based in San Francisco</span>
					<span>
						I value elegant, minimalistic software that enhances user experience
					</span>
					<span>I enjoy travel, language learning and hiking with my dogs</span>
				</div>
				<div style={{ position: "relative", height: "fit-content" }}>
					<img
						className="mt-10 object-cover w-[22.2vw]"
						src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703920496/IMG_8366_ix17v0.jpg"
						alt="Me and my cat friend Tigre"
					/>
					<img
						className="absolute w-[130%] -left-1/4 -bottom-[22.75%]"
						src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703982209/tigre_circle_mtuhib.png"
						alt=""
					/>
					<span
						className="absolute top-[105%] left-[10%] leading-normal text-[1.5vw]"
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
