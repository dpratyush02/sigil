---
name: Luminous Noir
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#20201f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e5e2e1'
  on-surface-variant: '#d1c6ab'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#9a9078'
  outline-variant: '#4d4632'
  surface-tint: '#eec200'
  primary: '#ffecb9'
  on-primary: '#3c2f00'
  primary-container: '#facc15'
  on-primary-container: '#6c5700'
  inverse-primary: '#735c00'
  secondary: '#b7c8db'
  on-secondary: '#223241'
  secondary-container: '#384858'
  on-secondary-container: '#a6b7ca'
  tertiary: '#ededed'
  on-tertiary: '#2f3131'
  tertiary-container: '#d0d1d1'
  on-tertiary-container: '#58595a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe083'
  primary-fixed-dim: '#eec200'
  on-primary-fixed: '#231b00'
  on-primary-fixed-variant: '#574500'
  secondary-fixed: '#d3e4f8'
  secondary-fixed-dim: '#b7c8db'
  on-secondary-fixed: '#0c1d2b'
  on-secondary-fixed-variant: '#384858'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353535'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  button-text:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 24px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  margin-safe: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  stack-xl: 64px
---

## Brand & Style

The design system is anchored in a philosophy of **Secure Clarity**. It is designed for high-stakes environments—fintech, security, and premium utility—where trust is built through high-contrast legibility and a sophisticated, "dark mode first" aesthetic. 

The style is a synthesis of **Minimalism** and **Corporate Modern**, utilizing a deep, obsidian-like canvas to make primary actions feel radiant and urgent. The emotional response is one of calm confidence; the UI recedes to the background, allowing critical information and the "Sunflower" yellow accents to command attention. Imagery should favor professional flat illustrations with a restricted palette to maintain a cohesive, high-end editorial feel.

## Colors

The palette is strictly high-contrast to ensure maximum accessibility and a premium feel. 

- **Primary:** Sunflower Yellow (#FACC15) is reserved exclusively for primary calls-to-action, success states, and critical highlights.
- **Secondary:** A muted Navy Charcoal (#273746) is used for illustrative elements, secondary containers, and backgrounds for inactive states.
- **Backgrounds:** The foundation is a Deep Charcoal (#1A1A1A). Avoid pure black to prevent "smearing" on OLED screens and to maintain a softer, more professional depth.
- **Typography:** Primary text is pure white or off-white for maximum readability against the dark backdrop.

## Typography

This design system utilizes **Inter** for all typographic roles to ensure a technical, clean, and highly legible experience. 

Headlines should use heavy weights (600-700) with slight negative letter-spacing to create a "locked-in" editorial appearance. Body text remains generous in line-height to combat the eye strain often associated with light-on-dark interfaces. For mobile, headline sizes are scaled down to ensure no more than 3-4 words per line in primary onboarding headers.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a focus on vertical rhythm and centered compositions for mobile-first views. 

- **Safe Margins:** A minimum of 24px horizontal margin is required on all mobile screens to prevent content from crowding the bezel.
- **Vertical Rhythm:** Use an 8px base unit. Component spacing should scale from 16px (internal) to 32px/64px (sections).
- **Desktop/Tablet:** Content should center-align within a maximum container width of 1200px.
- **Onboarding/Empty States:** Layouts should be vertically centered with the primary illustration occupying the top 40% of the viewport.

## Elevation & Depth

Depth in the design system is achieved through **Tonal Layering** rather than traditional drop shadows.

- **Level 0 (Base):** The Deep Charcoal (#1A1A1A) background.
- **Level 1 (Surfaces):** Cards and elevated containers use a slightly lighter grey (#242424) or the Secondary Navy (#273746) to distinguish themselves from the background.
- **Interactive Elements:** Primary buttons use the Sunflower color, which inherently "pops" forward due to its high luminance. 
- **Shadows:** If used, they must be "Ambient Shadows"—ultra-diffused, black-tinted glows with 0px offset and 20px+ blur, used only on Level 1 cards to provide a subtle lift.

## Shapes

The design system utilizes a **Pill-shaped** geometry. This "generous roundness" (24px to 32px) serves as a friendly counterpoint to the dark, serious color palette, making the interface feel approachable and modern.

- **Primary Buttons:** Must be full-pill (height/2 radius).
- **Cards/Containers:** Minimum 24px corner radius.
- **Selection Indicators:** Circular (e.g., pagination dots, radio buttons).
- **Inputs:** 16px to 24px radius to match the overall softness of the container language.

## Components

### Buttons
- **Primary:** Full-pill shape, Sunflower Yellow background, Charcoal text. No border.
- **Secondary/Ghost:** Transparent background with white text or a subtle white border. Used for "Skip" or "Back" actions.
- **Iconic:** Perfect circles with centered icons, typically used for navigation arrows.

### Cards
- Surfaces should be solid #242424.
- Padding should be uniform (24px or 32px) to match the generous corner radius.

### Input Fields
- Dark grey backgrounds (#242424) with a subtle 1px border that turns Sunflower Yellow on focus.
- Placeholder text should be 50% opacity white.

### Illustrations
- Flat style only.
- Palette: #273746 (Navy), #FACC15 (Yellow), #FFFFFF (White), and #1A1A1A (Background match).
- Elements should appear floating or grounded by simple flat shadows.

### Pagination Indicators
- Inactive: Muted grey (#333333).
- Active: Pure White (#FFFFFF) or Sunflower Yellow.