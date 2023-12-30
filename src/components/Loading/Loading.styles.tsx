import styled, { keyframes } from "styled-components";

const rotate = keyframes`
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
`;

export const LoadingContainer = styled.div`
	height: 100vh;
	width: 100vw;
	display: flex;
	justify-content: center;
	align-items: center;
`;

export const LoadingIcon = styled.img`
	width: 50px;
	height: 50px;
	transform-origin: center;
	animation: ${rotate} 1s linear infinite;
`;
