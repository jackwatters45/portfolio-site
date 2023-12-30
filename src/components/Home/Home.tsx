import useHome from "./useHome";
import "../../styles/typewriter.css";
import BusinessCard from "./BusinessCard";
import {
	StyledHomeContainer,
	StyledSubtitleText,
	StyledTitleContainer,
	StyledTitleText,
} from "./Home.styles";

// INITIAL LOADING (DOG HEAD ROTATING)
// responsive
const Home = () => {
	const { subtitleText } = useHome();

	return (
		<StyledHomeContainer>
			<StyledTitleContainer>
				<StyledTitleText>Jack Watters</StyledTitleText>
				<BusinessCard />
			</StyledTitleContainer>
			<StyledSubtitleText className="typewriter">{subtitleText}</StyledSubtitleText>
		</StyledHomeContainer>
	);
};

export default Home;
