import { createGlobalStyle } from "styled-components";

const GlobalStyle = createGlobalStyle`  
  :root {
    font-family: "Roboto Mono";
    line-height: 1.5;
    color-scheme: dark;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;
  }


  html {
    color: ${({ theme }) => theme.colors.text1};
    background-color: ${({ theme }) => theme.colors.background1};
    scroll-behavior: smooth;
  }

  button {
    background: transparent;
    outline: none;
    border: none;
    cursor: pointer;
  }

  a {
    text-decoration: none;
    color: inherit
  }

  :hover {
    transition: all 0.1s ease-in-out;
  }
`;

export default GlobalStyle;
