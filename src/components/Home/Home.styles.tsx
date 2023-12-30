import styled from "styled-components";

export const StyledHomeContainer = styled.section`
	height: 100vh;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	align-items: flex-start;
	padding: 2.5rem;
	position: relative;
`;

export const StyledTitleText = styled.h1`
	font-size: 10rem;
	font-weight: 500;
	font-family: "Bebas Neue";
`;

export const StyledSubtitleText = styled.h2`
	font-size: 4rem;
	font-weight: 500;
	text-transform: lowercase;
	width: fit-content;
	text-align: left;
	line-height: 1.2;
	min-height: 76.8px;
	font-family: "Inconsolata";
`;
