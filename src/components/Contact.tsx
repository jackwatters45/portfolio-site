import { motion } from "framer-motion";

const Contact = () => {
	return (
		<section
			className="relative flex flex-col items-center gap-6 justify-between h-screen"
			id="contact"
		>
			<motion.h2
				className="text-[min(22vw,10vmax)] mt-[10vmin] mx-8  leading-none text-center"
				style={{ fontFamily: "Rubik Scribble" }}
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ delay: 0.25, duration: 1, ease: "easeInOut" }}
			>
				Get in touch
			</motion.h2>
			<div className="flex-col gap-1  mx-[10vmin] max-w-[1200px] hidden sm:flex">
				<motion.h3
					className="text-[4.5vmin] text-center"
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ delay: 0.25, duration: 1, ease: "easeInOut" }}
				>
					{"I'd Always love to discuss"}
				</motion.h3>
				<motion.div
					className="flex flex-wrap text-[3.3vmin] gap-2 justify-center "
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ delay: 0.25, duration: 1, ease: "easeInOut" }}
				>
					<span className="pt-1 px-3 border-2 border-solid rounded-full border-amber-50 border-opacity-50 hover:text-neutral-900 hover:bg-amber-50 hover:scale-105">
						Frontend Development
					</span>
					<span className="pt-1 px-3 border-2 border-solid rounded-full border-amber-50 border-opacity-50 hover:text-neutral-900 hover:bg-amber-50 hover:scale-105">
						Small Business Growth
					</span>
					<span className="pt-1 px-3 border-2 border-solid rounded-full border-amber-50 border-opacity-50 hover:text-neutral-900 hover:bg-amber-50 hover:scale-105">
						Language Acquisition
					</span>
					<span className="pt-1 px-3 border-2 border-solid rounded-full border-amber-50 border-opacity-50 hover:text-neutral-900 hover:bg-amber-50 hover:scale-105">
						React
					</span>
					<span className="pt-1 px-3  border-2 border-solid rounded-full border-amber-50  border-opacity-50 ">
						Startups
					</span>
					<span className="pt-1 px-3 border-2 border-solid rounded-full border-amber-50 border-opacity-50 hover:text-neutral-900 hover:bg-amber-50 hover:scale-105">
						Brutalist design
					</span>
					<span className="pt-1 px-3 border-2 border-solid rounded-full border-amber-50 border-opacity-50 hover:text-neutral-900 hover:bg-amber-50 hover:scale-105">
						Magical Realism
					</span>
					<span className="pt-1 px-3 border-2 border-solid rounded-full border-amber-50 border-opacity-50 hover:text-neutral-900 hover:bg-amber-50 hover:scale-105">
						Reggaeton
					</span>
					<span className="pt-1 px-3 border-2 border-solid rounded-full border-amber-50 border-opacity-50 hover:text-neutral-900 hover:bg-amber-50 hover:scale-105">
						Lacrosse
					</span>
					<span className="pt-1 px-3 border-2 border-solid rounded-full border-amber-50 border-opacity-50 hover:text-neutral-900 hover:bg-amber-50 hover:scale-105">
						World Travel
					</span>
					<span className="pt-1 px-3 border-2 border-solid rounded-full border-amber-50 border-opacity-50 hover:text-neutral-900 hover:bg-amber-50 hover:scale-105">
						Yerba Mate
					</span>
				</motion.div>
			</div>
			<div>
				<div className="flex justify-evenly gap-4 items-start flex-col-reverse sm:flex-row sm:max-h-[40vh] sm:mb-8 mx-4 w-screen">
					<div className="w-3/4 max-h-[33vh] mb-4 sm:max-w-[33vw] sm:w-fit sm:mb-0 flex self-start">
						<img
							src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703923329/Chilly_xmtdvm.jpg"
							alt=""
							className="object-contain  w-fit"
							draggable="false"
						/>
					</div>
					<div className="flex flex-col justify-start w-[75vw] sm:w-1/4 sm:mt-[4vmin]">
						<span className="text-4xl sm:text-[5vw] leading-none">Social</span>
						<hr />
						<div
							className="flex flex-col gap-6 text-2xl sm:text-[2.5vmin] mt-6"
							style={{ fontFamily: "Inconsolata" }}
						>
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
					<div className="flex flex-col justify-start w-[75vw] sm:w-1/4 sm:mt-[4vmin]">
						<span className="text-4xl sm:text-[5vw] leading-none">Contact</span>
						<hr />
						<div
							className="flex flex-col gap-6 text-2xl sm:text-[2.5vmin] mt-6"
							style={{ fontFamily: "Inconsolata" }}
						>
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
				<div
					className="flex justify-evenly flex-wrap text-xl uppercase my-2 mx-4"
					style={{ fontFamily: "Inconsolata" }}
				>
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
