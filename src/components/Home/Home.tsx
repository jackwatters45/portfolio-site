import useHome from "./useHome";
import "../../styles/typewriter.css";
import ContactCard from "./ContactCard";
import { StyledHomeContainer, StyledSubtitleText, StyledTitleText } from "./Home.styles";

const Home = () => {
	const { subtitleText } = useHome();

	return (
		<StyledHomeContainer>
			<StyledTitleText>Jack Watters</StyledTitleText>
			<StyledSubtitleText className="typewriter">{subtitleText}</StyledSubtitleText>
			<ContactCard />
		</StyledHomeContainer>
	);
};

export default Home;
