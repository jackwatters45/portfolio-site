import { Suspense, lazy } from "react";

import Home from "../Home";
import Nav from "../Nav";

const About = lazy(() => import("../About"));
const Projects = lazy(() => import("../Projects"));
const Contact = lazy(() => import("../Contact"));

const Layout = () => {
	return (
		<main className="h-screen w-screen overflow-x-hidden">
			<Nav />
			<Home />
			<Suspense>
				<About />
				<Projects />
				<Contact />
			</Suspense>
		</main>
	);
};

export default Layout;
