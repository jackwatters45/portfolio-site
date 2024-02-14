import { mdiGithub, mdiInstagram, mdiLinkedin } from "@mdi/js";
import Icon from "@mdi/react";

import { useEffect, useRef, useState } from "react";

const useContactCard = () => {
	const cardRef = useRef<HTMLDivElement>(null);

	const [isOpen, setIsOpen] = useState(false);
	const [contentVisible, setContentVisible] = useState(false);

	const closeCard = () => {
		setIsOpen(false);
		setContentVisible(false);
	};

	const openCard = () => {
		setIsOpen(true);
		if (!contentVisible) setTimeout(() => setContentVisible(true), 100);
	};

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (cardRef.current && !cardRef.current.contains(event.target as Node)) closeCard();
		};

		if (isOpen) document.addEventListener("click", handleClickOutside, true);
		return () => document.removeEventListener("click", handleClickOutside, true);
	}, [isOpen]);

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeCard();
		};

		if (isOpen) window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [isOpen]);

	return { cardRef, isOpen, closeCard, openCard, contentVisible };
};

const ContactCard = () => {
	const { cardRef, isOpen, closeCard, openCard, contentVisible } = useContactCard();

	return isOpen ? (
		<div className="absolute right-10 bottom-10 text-neutral-900 bg-amber-50 w-56 h-64 transition  hidden xl:block">
			{contentVisible && (
				<div
					className="relative flex flex-col justify-between items-start h-full w-full px-3 py-5 text-left text-[1rem]"
					style={{ fontFamily: "Bebas Neue" }}
					ref={cardRef}
				>
					<div className="flex justify-between w-full">
						<div className="flex flex-col mt-2">
							<span className="text-[1.75rem] leading-none">Jack Watters</span>
							<span>Software Developer</span>
						</div>
						<button onClick={closeCard}>
							<img
								src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703751903/chilly_Icon_aqnqzg.png"
								alt="Chilly Watters"
								title="Chilly Watters"
								className="w-[50px] cursor-pointer object-contain  "
								style={{ transform: "rotateY(180deg)" }}
								draggable="false"
							/>
						</button>
					</div>
					<div className="flex justify-between w-full items-end leading-tight">
						<div className="flex flex-col li ">
							<a href="tel:+19544949167">Tel. 954-494-9167</a>
							<a href="mailto:jack.watters@me.com">Email. jackwatters@me.com</a>
							17 Plymouth Ave, SF, 94941
						</div>
						<div className="flex flex-col gap-2">
							<a
								href="https://www.instagram.com/jackwatters45/"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Icon path={mdiInstagram} size={1} color={"#171717"} />
							</a>
							<a
								href="https://www.linkedin.com/in/john-watters/"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Icon path={mdiLinkedin} size={1} color={"#171717"} />
							</a>
							<a
								href="https://github.com/jackwatters45"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Icon path={mdiGithub} size={1} color={"#171717"} />
							</a>
						</div>
					</div>
				</div>
			)}
		</div>
	) : (
		<button
			className="absolute right-10 bottom-10 bg-amber-50 cursor-pointer h-[150px] w-[150px] transition  hidden xl:block hover:scale-105"
			onClick={openCard}
		/>
	);
};

export default ContactCard;
