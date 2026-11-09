# Gentlemen's Barbershop — Canonical UI/UX Specification

**Status:** APPROVED / FROZEN design direction  
**Approved:** 2026-11-09  
**Scope:** Public-facing website, responsive light and dark themes  
**Authority:** This document governs UI/UX implementation. User-provided reference mockup governs brand imagery, palette, and visual character where not explicitly revised below. Functional booking and security requirements remain governed by `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`.

## 1. Design concept

**Editorial Luxury + Flat UI + Cinematic Scrolling** (also called **Editorial Cinematic**).

The experience should feel premium, atmospheric, confident and restrained, without sacrificing speed, usability or conversion. The website is first a functional barbershop booking service, not a scrolling demo.

Retain from approved reference:
- Vintage premium barbershop identity, heritage atmosphere, cream/parchment texture, dark chocolate, restrained brass/gold accents.
- Large cinematic barbershop photography, editorial serif headings, readable Inter body text.
- Light and dark variants of the same brand, with intentional palette mappings rather than literal CSS filter inversion.
- Existing core content: benefits, team, reviews, products, locations, contact and social/footer; services and booking remain prominent.

## 2. Non-negotiable decisions

1. **Exactly three primary cinematic sections on the landing page**, not every section: Hero, Philosophy/Atmosphere, Final booking CTA. Their target viewport heights are specified below; do not force all sections to 100vh.
2. **Hybrid Cinematic Scroll**: native user-controlled scrolling with selective parallax, reveal and optional sticky compositions. No site-wide full-page snap, scroll hijacking or forced scroll lock.
3. **Booking CTA remains accessible and operable at all times**. Scroll effects, overlays and animations must never intercept or delay booking actions. A prominent booking action remains in the global navigation (including a usable mobile equivalent).
4. **Flat design** for all buttons and controls. No beveled/raised 3D buttons, glossy gradients, metallic shine, glow or heavy shadows.
5. Animations are subordinate to accessibility, performance and task completion. Support `prefers-reduced-motion`; degrade gracefully on mobile and constrained devices.
6. Both light and dark themes are first-class and must be visually reviewed separately.

These decisions are frozen; substantial departures require explicit product approval.

## 3. Landing page layout and scroll choreography

| Order | Section | Layout and behavior |
| --- | --- | --- |
| 01 | Hero | **~100svh** desktop target; cinematic barber-chair photography, split/editorial typography, clear primary booking CTA and secondary services CTA. Subtle background depth/parallax, restrained headline reveal. Existing reference slide progress and pause/play may be retained; manual controls and reduced-motion behavior are mandatory if autoplay is used. |
| 02 | Why choose us | Natural content height, generous whitespace, simple flat benefits/cards, no parallax requirement. |
| 03 | Philosophy / Atmosphere | **~100svh** desktop target; immersive full-bleed barber-at-work photography, brief brand statement, subtle parallax and optional sticky text/photo composition. This is an atmospheric transition, not an obstacle to scrolling. |
| 04 | Barbers | Natural height; prominent portraits, readable names/experience and easy path to book a selected barber. |
| 05 | Services | Natural height; scannable services, durations/prices where applicable, direct booking actions. |
| 06 | Reviews | Natural height; accessible manual carousel where useful, no scroll-capture. |
| 07 | Featured products | Natural height; compact product cards and clear catalog links. |
| 08 | Final booking CTA | **~80–100svh** desktop target; atmospheric photographic backdrop, concise closing message and prominent booking CTA. Subtle background transform only. |
| 09 | Locations / Contact / Footer | Natural height; usable location/map details, contact form, social links, newsletter and footer. |

The reference's contact and social sections may be composed differently if needed for responsive clarity, but their functions must remain. The philosophy section is an intentional new cinematic transition; it does not replace the team or services content.

Viewport heights are visual targets, **not hard content clipping constraints**. Use `min-height` and content-aware responsive layouts. Mobile may render these sections at natural heights to avoid cramped text and inaccessible CTAs.

## 4. Scroll and motion rules

- Default: native scrolling, no mandatory snap points.
- Prefer CSS transitions/transforms, `position: sticky` and IntersectionObserver for straightforward effects.
- Consider Motion for React (already in architecture direction) for small component transitions. Add GSAP/ScrollTrigger **only if a proven complex choreography requires it**, with a clear bundle/performance justification; do not introduce both animation systems by default.
- Parallax must be subtle, bounded within its image container, and never expose blank image edges.
- Favor opacity and transform animations; avoid scroll-linked layout thrashing and expensive continuous blur/filter effects.
- Avoid pinning that traps a user for extra scroll distance. All sections must remain navigable with wheel, touch, keyboard and assistive technology.
- Honor `prefers-reduced-motion: reduce`: disable decorative parallax, auto-motion and scroll-linked transforms; keep content visible and fully functional.
- Avoid automatic motion that cannot be paused where accessibility requires it. Preserve explicit pause/play for any auto-advancing hero.
- Smooth scrolling to section anchors must not interfere with keyboard focus, browser history or reduced-motion preferences.

## 5. Flat component language

### Buttons

- **Primary:** solid dark chocolate in light theme; solid restrained brass/gold in dark theme; flat fill, readable contrasting label.
- **Secondary:** transparent/flat surface with thin visible border.
- **Tertiary:** text action with small directional arrow; no container required.
- Corner radius: approximately **4–6px** (design token, not ad-hoc values).
- No glossy or embossed gradients, bevels, 3D depth, bright halo, scale-on-hover or decorative heavy shadow.
- Hover/focus: subtle color/border changes; optional small arrow translation; target transition **150–200ms**.
- Focus-visible indication must be clearly distinguishable in both themes.
- Comfortable pointer/touch targets; aim for at least **44×44 CSS px** for important interactive controls.

### Cards and surfaces

- Flat, restrained surfaces; separation via spacing, subtle borders and tonal contrast rather than elevation.
- Product/team photos carry visual weight. Do not apply decorative gold frames to every item.
- Maintain consistent radii, spacing, border strengths and typography through design tokens.

## 6. Color, typography and themes

Initial reference palette (subject to final token/contrast tuning):
- Cream: `#F2E9DC`
- Dark chocolate: `#2A1D16`
- Muted gold/brass: `#C8A86B`

Light: warm parchment background, dark text, restrained gold accents.  
Dark: deep chocolate/near-black background, light warm text, restrained brass accents.

The dark theme is a **designed tonal inversion**, not `filter: invert()`. Both themes share the same layout, hierarchy, interactions and content.

Typography: **Inter** for body/UI; a complementary editorial serif for prominent headings matching the reference. Ensure Cyrillic/Ukrainian glyph support, readable line-height, robust wrapping and contrast. Texture must remain subtle enough not to impair readability.

Theme toggle belongs in the global navbar; support mobile and keyboard interaction, avoid hydration flash, and preserve the user's selection as appropriate.

## 7. Navigation and booking accessibility

- Global navigation exposes a persistent, prominent **Book / Записатися** action.
- On narrow screens, provide an equally clear mobile action; do not hide booking solely inside an undiscoverable menu.
- Decorative layers must use safe stacking and `pointer-events: none` where appropriate, so they cannot block CTA hit targets.
- No scroll animation may postpone route transitions, opening booking UI, or progressing through the five booking steps.
- Preserve the five-step booking flow and server-authoritative availability/pricing defined in the product and architecture specs.
- Keep forms, menus, carousels, theme toggle and CTAs operable by keyboard with visible focus and appropriate labels.
- Navigation anchors should account for sticky header offset; never obscure section headings.

## 8. Responsive and performance acceptance

- Desktop: three cinematic scenes as described, with readable split compositions.
- Tablet: reduce parallax intensity and adapt image crops; avoid text/photo overlap.
- Mobile: prioritize content, stable layout and booking; simplify or disable parallax/pinning where it harms usability.
- Use responsive images, appropriate `sizes`, modern formats and careful loading priority (hero vs below-fold); avoid layout shifts.
- Test on touch devices and under reduced-motion conditions.
- Aim for healthy Core Web Vitals; no animation dependency may block first meaningful content or booking.
- All interactive controls must have adequate contrast, focus treatment and touch size.

## 9. Implementation order and acceptance checklist

1. Define semantic design tokens for themes, typography, spacing, radii, borders and motion.
2. Build flat reusable button, card and navigation primitives.
3. Build the responsive static landing page first and validate information hierarchy.
4. Implement the three cinematic sections **progressively**, with native scrolling and reduced-motion fallback.
5. Verify global booking CTA, section anchors and complete booking interaction are unaffected by animation layers.
6. Test desktop/tablet/mobile, keyboard, touch, dark/light, reduced motion and low-power behavior.
7. Run available lint/typecheck/build/tests before merging; do not report checks as passed unless run.

### Definition of done

- Three cinematic sections only; remaining sections flow naturally.
- No full-page snap/scroll hijacking.
- Flat primary/secondary/tertiary controls in both themes.
- Booking CTA always discoverable, clickable and keyboard-operable.
- Motion remains optional, performant and accessible.
- Brand and content remain recognizably faithful to the approved reference.

## 10. Change control

This is the **canonical, approved UI/UX direction** as of 2026-11-09. Future mockups and code should conform to it. Fine-tuning responsive breakpoints, exact crop positions, easing curves and final accessible token values is implementation detail, not permission to change the design concept. Any change to the three-scene structure, flat-button principle, scroll model or booking accessibility rule requires explicit approval.
