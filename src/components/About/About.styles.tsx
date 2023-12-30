import styled from "styled-components";

export const StyledHelloContainer = styled.div`
	display: flex;
	margin-top: 10vh;
	width: fit-content;
	flex-direction: column;
	justify-content: flex-end;

	margin: 15vh 6rem 0;
`;

export const StyledNameText = styled.div`
	display: flex;
	gap: 1rem;
	font-size: 6rem;
	font-family: "Rubik Scribble";
`;

export const StyledNameSubtext = styled.span`
	text-align: right;
	font-size: 1.5rem;
`;

export const StyledAboutTextImageContainer = styled.div`
	display: flex;
	justify-content: space-evenly;
	margin-top: 2rem;
`;

export const StyledAboutText = styled.div`
	margin-top: 3rem;
	padding-left: 1.5rem;
	font-size: 3vw;
	max-width: 66.6%;
	line-height: 1.5;
	text-transform: uppercase;
	font-family: sans-serif;
`;

export const StyledAboutImage = styled.img`
	width: 22.2vw;
	margin-top: 2.5rem;
`;
