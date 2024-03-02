import { motion } from "framer-motion";

const Contact = () => {
	return (
		<section
			className="relative flex h-screen flex-col items-center justify-between gap-6"
			id="contact"
		>
			<motion.h2
				className="mx-8 mt-[10vmin] text-center  font-rubik-scribble text-[min(22vw,10vmax)] leading-none"
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ delay: 0.25, duration: 1, ease: "easeInOut" }}
			>
				Get in touch
			</motion.h2>
			<div className="mx-[10vmin] hidden  max-w-[1200px] flex-col gap-1 sm:flex">
				<motion.h3
					className="text-center text-[4.5vmin]"
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ delay: 0.25, duration: 1, ease: "easeInOut" }}
				>
					{"I'd Always love to discuss"}
				</motion.h3>
				<motion.div
					className="flex flex-wrap justify-center gap-2 text-[3.3vmin] "
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ delay: 0.25, duration: 1, ease: "easeInOut" }}
				>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						Frontend Development
					</span>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						Small Business Growth
					</span>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						Language Acquisition
					</span>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						React
					</span>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						Hockey
					</span>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						Brutalist design
					</span>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						Magical Realism
					</span>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						Reggaeton
					</span>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						Lacrosse
					</span>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						World Travel
					</span>
					<span className="rounded-full border-2 border-solid border-amber-50 border-opacity-50 px-3 pt-1 hover:scale-105 hover:bg-amber-50 hover:text-neutral-900">
						Yerba Mate
					</span>
				</motion.div>
			</div>
			<div>
				<div className="mx-4 flex w-screen flex-col-reverse items-start justify-evenly gap-4 sm:mb-8 sm:max-h-[40vh] sm:flex-row">
					<div className="mb-4 flex max-h-[33vh] w-3/4 self-start sm:mb-0 sm:w-fit sm:max-w-[33vw]">
						<img
							src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703923329/Chilly_xmtdvm.jpg"
							alt=""
							className="w-fit  object-contain"
							draggable="false"
						/>
					</div>
					<div className="flex w-[75vw] flex-col justify-start sm:mt-[4vmin] sm:w-1/4">
						<span className="text-4xl leading-none sm:text-[5vw]">Social</span>
						<hr />
						<div className="mt-6 flex flex-col gap-6 font-inconsolata text-2xl sm:text-[2.5vmin]">
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
					<div className="flex w-[75vw] flex-col justify-start sm:mt-[4vmin] sm:w-1/4">
						<span className="text-4xl leading-none sm:text-[5vw]">Contact</span>
						<hr />
						<div className="mt-6 flex flex-col gap-6 font-inconsolata text-2xl sm:text-[2.5vmin]">
							<a href="tel:+19544949167">
								<span>Tel. 954-494-9167</span>
							</a>
							<a href="mailto:jack.watters@me.com">
								<span>Email. jackwatters@me.com</span>
							</a>
							<span>17 Plymouth Ave, San Francisco, 94941</span>
						</div>
					</div>
				</div>
				<div className="mx-4 my-2 flex flex-wrap justify-evenly font-inconsolata text-xl uppercase">
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
