import { Suspense, lazy } from "react";

import Home from "../Home";
import Nav from "../Nav";
import Loading from "../Loading";
import useLayout from "./useLayout";

const About = lazy(() => import("../About"));
const Projects = lazy(() => import("../Projects"));
const Contact = lazy(() => import("../Contact"));

const Layout = () => {
	const { isLoaded } = useLayout();

	return (
		<main
			className="h-screen w-screen overflow-x-hidden"
			style={{ overflowY: isLoaded ? undefined : "hidden" }}
		>
			{!isLoaded && <Loading />}
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
