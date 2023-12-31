import styled from "styled-components";

export const StyledHelloContainer = styled.div`
	display: flex;
	margin-top: 8vh;
	width: fit-content;
	flex-direction: column;
	justify-content: flex-end;

	margin: 15vh 6rem 0;
`;

export const StyledNameText = styled.div`
	display: flex;
	font-size: 6rem;
	font-family: "Rubik Scribble";

	:first-child {
		min-width: 34vw;
	}
`;

export const StyledNameSubtext = styled.span`
	text-align: right;
	font-size: 1.5rem;
`;

export const StyledAboutTextImageContainer = styled.div`
	display: flex;
	justify-content: space-evenly;
	margin-top: 1.5rem;
`;

export const StyledAboutText = styled.div`
	margin-top: 1.5rem;
	padding-left: 1.5rem;
	font-size: 3vw;
	max-width: 66.6%;
	line-height: 1.5;
	text-transform: uppercase;
	font-family: sans-serif;
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
`;

export const StyledAboutImage = styled.img`
	width: 22.2vw;
	margin-top: 2.5rem;
	object-fit: cover;
`;

export const StyledPhotoCaption = styled.span`
	position: absolute;
	top: 105%;
	left: 10%;

	font-size: 1.5vw;
	font-family: "Inconsolata";
`;

export const StyledCircleScribble = styled.img`
	position: absolute;
	width: 130%;
	left: -25%;

	bottom: -22.75%;
`;
