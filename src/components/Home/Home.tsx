import useHome from "./useHome";
import "../../styles/typewriter.css";
import ContactCard from "./ContactCard";

const Home = () => {
	const { subtitleText } = useHome();

	return (
		<section
			id="home"
			className="relative flex flex-col justify-end h-screen p-10 items-start"
		>
			<h1 className="text-[10rem] font-medium" style={{ fontFamily: "Bebas Neue" }}>
				Jack Watters
			</h1>
			<h2
				className="typewriter font-medium text-[4rem] lowercase text-left leading-tight min-h-[80px]"
				style={{ fontFamily: "Inconsolata" }}
			>
				{subtitleText}
			</h2>
			<ContactCard />
		</section>
	);
};

export default Home;
