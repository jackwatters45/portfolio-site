import { HashLink as Link } from "react-router-hash-link";

import "../../styles/animations/line-through.css";
import "../../styles/animations/wipe-animation.css";

const Nav = () => {
	return (
		<nav className="flex justify-between px-10 py-8 fixed w-screen z-10">
			<Link
				to="#home"
				className="line-through-animation text-xl uppercase"
				style={{ fontFamily: "Roboto Mono" }}
				smooth
			>
				Watters
			</Link>
			<div
				className="text-xl uppercase h-8 flex gap-4 truncate font-bold -mt-0.5  leading-snug"
				style={{ fontFamily: "Inconsolata" }}
			>
				<Link to="#about" className="wipe-animation" smooth>
					About
				</Link>
				<Link to="#projects" className="wipe-animation" smooth>
					Projects
				</Link>
				<Link to="#contact" className="wipe-animation" smooth>
					Contact
				</Link>
			</div>
		</nav>
	);
};

export default Nav;
