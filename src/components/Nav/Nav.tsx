import {
	StyledNav,
	StyledNavLink,
	StyledNavLinkContainer,
	StyledNavTitleRest,
} from "./Nav.styles";

// commit
// figure out cl issues -> not quite happy with navlink animations
const Nav = () => {
	return (
		<StyledNav>
			<StyledNavTitleRest to="/">Watters</StyledNavTitleRest>
			<StyledNavLinkContainer>
				<StyledNavLink to="#about">About</StyledNavLink>
				<StyledNavLink to="#projects">Projects</StyledNavLink>
				<StyledNavLink to="#contact">Contact</StyledNavLink>
			</StyledNavLinkContainer>
		</StyledNav>
	);
};

export default Nav;
