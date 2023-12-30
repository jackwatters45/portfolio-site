import { mdiGithub, mdiInstagram, mdiLinkedin } from "@mdi/js";
import Icon from "@mdi/react";

import theme from "@/styles/theme";
import {
	StyledBlankCard,
	StyledCardContentContainer,
	StyledCardIconsContainer,
	StyledCardImage,
	StyledCardImageIconsContainer,
	StyledCardName,
	StyledCardTextContent,
} from "./BusinessCard.styles";
import useBusinessCard from "./useBusinessCard";

const BusinessCard = () => {
	const { isOpen, closeCard, openCard, contentVisible } = useBusinessCard();

	return (
		<StyledBlankCard onClick={!isOpen ? openCard : undefined} $isOpen={isOpen}>
			{contentVisible && (
				<StyledCardContentContainer>
					<StyledCardTextContent>
						<div className="flex-column">
							<StyledCardName>Jack Watters</StyledCardName>
							<span>Software Developer</span>
						</div>
						<div className="flex-column">
							<a href="tel:+19544949167">
								<span>Tel. 954-494-9167</span>
							</a>
							<a href="mailto:jack.watters@me.com">
								<span>Email. jackwatters@me.com</span>
							</a>
							<span>17 Plymouth Ave, San Francisco, 94941</span>
						</div>
					</StyledCardTextContent>
					<StyledCardImageIconsContainer className="flex-column">
						<StyledCardImage
							src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703751903/chilly_Icon_aqnqzg.png"
							onClick={closeCard}
							title="Chilly Watters"
						/>
						<StyledCardIconsContainer>
							<a
								href="https://www.instagram.com/jackwatters45/"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Icon path={mdiInstagram} size={1} color={theme.colors.background1} />
							</a>
							<a
								href="https://www.linkedin.com/in/john-watters/"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Icon path={mdiLinkedin} size={1} color={theme.colors.background1} />
							</a>
							<a
								href="https://github.com/jackwatters45"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Icon path={mdiGithub} size={1} color={theme.colors.background1} />
							</a>
						</StyledCardIconsContainer>
					</StyledCardImageIconsContainer>
				</StyledCardContentContainer>
			)}
		</StyledBlankCard>
	);
};

export default BusinessCard;
