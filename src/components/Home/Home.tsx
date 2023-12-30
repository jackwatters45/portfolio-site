import useHome from "./useHome";
import "../../styles/typewriter.css";
import BusinessCard from "./BusinessCard";
import { StyledHomeContainer, StyledSubtitleText, StyledTitleText } from "./Home.styles";

const Home = () => {
	const { subtitleText } = useHome();

	return (
		<StyledHomeContainer>
			<StyledTitleText>Jack Watters</StyledTitleText>
			<StyledSubtitleText className="typewriter">{subtitleText}</StyledSubtitleText>
			<BusinessCard />
		</StyledHomeContainer>
	);
};

export default Home;
