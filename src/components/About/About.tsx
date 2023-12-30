import {
	StyledAboutImage,
	StyledAboutPageContainer,
	StyledAboutText,
	StyledAboutTextImageContainer,
	StyledHelloContainer,
	StyledNameSubtext,
	StyledNameText,
} from "./About.styles";

// TODO text
// TODO hover -> hello in diff languages
// TODO some quirky comment on the photo
// TODO hover photo or associated text -> zoom in on tigre

const About = () => {
	return (
		<StyledAboutPageContainer>
			<StyledHelloContainer>
				<StyledNameText>
					{/* TODO hover -> hello in diff languages */}
					<span>Hello.</span>
					<span>I am Jack</span>
				</StyledNameText>
				<StyledNameSubtext>(John)</StyledNameSubtext>
			</StyledHelloContainer>
			<StyledAboutTextImageContainer>
				<StyledAboutText>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
					incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
					nostrud
				</StyledAboutText>
				<StyledAboutImage
					src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703920496/IMG_8366_ix17v0.jpg"
					alt=""
				/>
			</StyledAboutTextImageContainer>
		</StyledAboutPageContainer>
	);
};

export default About;
