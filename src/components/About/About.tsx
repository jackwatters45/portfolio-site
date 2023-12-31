import { Section } from "@/styles/sharedStyles";
import {
	StyledAboutImage,
	StyledAboutText,
	StyledAboutTextImageContainer,
	StyledCircleScribble,
	StyledHelloContainer,
	StyledNameSubtext,
	StyledNameText,
	StyledPhotoCaption,
} from "./About.styles";
import useAbout from "./useAbout";

const About = () => {
	const { currentGreeting, loopThroughText, stopLooping } = useAbout();

	return (
		<Section>
			<StyledHelloContainer>
				<StyledNameText>
					<span onMouseEnter={loopThroughText} onMouseLeave={stopLooping}>
						{`${currentGreeting}!`}
					</span>
					<span>{" I'm Jack."}</span>
				</StyledNameText>
				<StyledNameSubtext>(John)</StyledNameSubtext>
			</StyledHelloContainer>
			<StyledAboutTextImageContainer>
				<StyledAboutText>
					<span>I am a full stack developer based in San Francisco</span>
					<span>
						I value elegant, minimalistic software that enhances user experience
					</span>
					<span>I enjoy travel, language learning and hiking with my dogs</span>
				</StyledAboutText>
				<div style={{ position: "relative", height: "fit-content" }}>
					<StyledAboutImage
						src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703920496/IMG_8366_ix17v0.jpg"
						alt="Me and my cat friend Tigre"
					/>
					<StyledCircleScribble
						src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703982209/tigre_circle_mtuhib.png"
						alt=""
					/>
					<StyledPhotoCaption>Me and my friend Tigre</StyledPhotoCaption>
				</div>
			</StyledAboutTextImageContainer>
		</Section>
	);
};

export default About;
