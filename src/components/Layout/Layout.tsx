import { Suspense, lazy, useEffect, useState } from "react";

import Home from "../Home";
import Nav from "../Nav";
import Loading from "../Loading";

const About = lazy(() => import("../About"));
const Projects = lazy(() => import("../Projects"));
const Contact = lazy(() => import("../Contact"));

const Layout = () => {
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		setTimeout(() => {
			setIsLoaded(true);
		}, 1000);
	}, []);

	return isLoaded ? (
		<main className="h-screen w-screen overflow-x-hidden">
			<Nav />
			<Home />
			<Suspense>
				<About />
				<Projects />
				<Contact />
			</Suspense>
		</main>
	) : (
		<Loading />
	);
};

export default Layout;
