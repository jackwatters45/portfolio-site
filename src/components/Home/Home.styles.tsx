import styled from "styled-components";

export const StyledHomeContainer = styled.section`
	min-height: calc(100vh - 96px);
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	padding: 2.5rem;
	position: relative;
`;

export const StyledTitleContainer = styled.div`
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 2rem;
`;

export const StyledTitleText = styled.h1`
	font-size: 10rem;
	font-weight: 500;
	font-family: "Bebas Neue";
	align-self: flex-end;
`;

export const StyledSubtitleText = styled.h2`
	font-size: 4rem;
	font-weight: 500;
	text-transform: lowercase;
	width: fit-content;
	text-align: left;
	line-height: 1.2;
	min-height: 76.8px;
`;
