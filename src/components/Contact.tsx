import { motion } from "framer-motion";

const discussTags: string[] = [
	"Frontend Development",
	"Small Business Growth",
	"Language Acquisition",
	"React",
	"Hockey",
	"Brutalist design",
	"Magical Realism",
	"Reggaeton",
	"Lacrosse",
	"World Travel",
	"Yerba Mate",
];

const Contact = () => {
	return (
		<section
			className="relative flex h-screen flex-col items-center justify-between gap-16 pt-16 sm:gap-24 sm:pt-32 lg:gap-32 lg:pt-48"
			id="contact"
		>
			<motion.h2
				className="px-8 pt-12 text-center font-rubik-scribble text-6xl leading-none sm:text-8xl xl:text-9xl"
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ delay: 0.25, duration: 1, ease: "easeInOut" }}
			>
				Get in touch
			</motion.h2>
			<div className="flex w-10/12 max-w-screen-xl flex-col gap-2">
				<motion.h3
					className="text-center text-3xl sm:text-4xl lg:text-5xl"
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ delay: 0.25, duration: 1, ease: "easeInOut" }}
				>
					{"I'd Always love to discuss"}
				</motion.h3>
				<motion.div
					className="flex flex-wrap justify-center gap-2 "
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ delay: 0.25, duration: 1, ease: "easeInOut" }}
				>
					{discussTags.map((tag) => (
						<span
							key={tag}
							className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 text-2xl hover:scale-105 hover:bg-amber-50 hover:text-neutral-900  md:text-4xl xl:text-5xl"
						>
							{tag}
						</span>
					))}
				</motion.div>
			</div>
			<div>
				<div className="flex w-screen flex-col-reverse items-center justify-evenly gap-4 px-4 sm:flex-row sm:items-start sm:gap-0">
					<div className="hidden max-h-[50vh] w-1/4 self-center  pb-4 pt-3 md:flex lg:max-h-[40vh]">
						<img
							src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703923329/Chilly_xmtdvm.jpg"
							alt="My dog Chilly"
							className="object-contain"
							draggable="false"
						/>
					</div>
					<div className="flex w-[75vw] flex-col sm:w-1/3 sm:pt-[4vmin] md:w-1/4">
						<span className="text-3xl sm:text-5xl lg:text-7xl ">Social</span>
						<hr />
						<div className="mt-6 flex flex-col gap-6 font-inconsolata text-2xl  md:text-3xl xl:text-4xl">
							<a
								href="https://www.instagram.com/jackwatters45/"
								target="_blank"
								rel="noopener noreferrer"
							>
								Instagram
							</a>
							<a
								href="https://www.linkedin.com/in/john-watters/"
								target="_blank"
								rel="noopener noreferrer"
							>
								Linkedin
							</a>
							<a
								href="https://github.com/jackwatters45"
								target="_blank"
								rel="noopener noreferrer"
							>
								Github
							</a>
							<a
								href="https://open.spotify.com/user/jackwatters22?si=77d268609e904877"
								target="_blank"
								rel="noopener noreferrer"
							>
								Spotify
							</a>
						</div>
					</div>
					<div className="flex w-[75vw] flex-col sm:w-1/3 sm:pt-[4vmin] md:w-1/4">
						<span className="text-3xl sm:text-5xl lg:text-7xl">Contact</span>
						<hr />
						<div className="mt-6 flex flex-col gap-6 font-inconsolata text-2xl  md:text-3xl xl:text-4xl">
							<a href="tel:+19544949167">
								<span>Tel. 954-494-9167</span>
							</a>
							<a href="mailto:jack.watters@me.com">
								<span>Email. jackwatters@me.com</span>
							</a>
							<span>17 Plymouth Ave, San Francisco</span>
						</div>
					</div>
				</div>
				<div className="flex flex-wrap justify-evenly px-4 py-2 pt-16 font-inconsolata text-xl uppercase md:pt-12">
					<span>Site Design inspired by:</span>
					<a
						href="https://bepatrickdavid.com/"
						target="_blank"
						rel="noopener noreferrer"
						className="line-through-animation"
					>
						Patrick David
					</a>
					<a
						href="https://lk.emotion-agency.com/"
						target="_blank"
						rel="noopener noreferrer"
						className="line-through-animation"
					>
						Leonid Kostetckyi
					</a>
					<a
						href="https://adrienlaurent.fr/"
						target="_blank"
						rel="noopener noreferrer"
						className="line-through-animation"
					>
						Adrien Laurent
					</a>
				</div>
			</div>
		</section>
	);
};

export default Contact;
