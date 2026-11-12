<p align="center">
  <strong>GENTLEMEN'S BARBERSHOP</strong><br>
  <em>Premium Barbershop Web Platform</em>
</p>

<h1 align="center">Gentlemen's Barbershop</h1>

<p align="center">
  <strong>A premium barbershop experience, from the first impression to the next appointment.</strong><br>
  Multi-location discovery, services, appointment planning, content and management,<br>
  wrapped in an editorial light-and-dark interface.
</p>

<p align="center">
  <img alt="Status: active development" src="https://img.shields.io/badge/status-active%20development-b78b50?style=flat-square">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-1d1713?style=flat-square&logo=nextdotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-087ea4?style=flat-square&logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Payload CMS" src="https://img.shields.io/badge/CMS-Payload-333333?style=flat-square">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-17-4169e1?style=flat-square&logo=postgresql&logoColor=white">
</p>

<p align="center">
  <a href="#experience">Experience</a> ·
  <a href="#platform">Platform</a> ·
  <a href="#technology">Technology</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#project-status">Status</a> ·
  <a href="#documentation">Documentation</a>
</p>

---

## Experience

Warm parchment, deep chocolate, restrained brass, atmospheric photography and modern interaction patterns. The goal is a functional barbershop website with a distinct visual identity — not a scrolling demo.

> **Design showcase:** The two approved concept visuals (technology poster and full light/dark landing mockup) belong in `docs/images/project-poster.webp` and `docs/images/light-dark-concept.webp`. These are design concepts, **not screenshots of the running app**. They will be linked in the README as soon as the image assets are committed to the repository.

<table>
<tr>
<td width="33%" valign="top"><h3>✂️ Find your barber</h3>Discover the team, locations and services. Public catalog content is data-driven rather than hard-coded.</td>
<td width="33%" valign="top"><h3>📅 Plan your visit</h3>Explore real availability in a guided booking flow. Production booking confirmation remains intentionally disabled until release acceptance.</td>
<td width="33%" valign="top"><h3>☀️ / 🌙 Two distinct moods</h3>Light and dark themes, responsive layouts, flat controls and reduced-motion support.</td>
</tr>
</table>

## Platform

The scope below describes the **planned product experience**, not a claim that every module has shipped.

| Area | Product direction |
| --- | --- |
| **Public website** | Editorial hero, team, services, locations, reviews, products, news and contact |
| **Appointments** | Five-step location, barber, service, time and confirmation flow, backed by guarded server-side booking logic |
| **Customer space** | Profile, appointment history, favorites, purchases, notifications and loyalty overview |
| **Barber workspace** | Schedules, appointments and operational views |
| **Shop** | First-party grooming product catalog, cart, pickup and delivery within Ukraine |
| **Administration** | Payload-powered CMS and custom business workflows |
| **Languages** | Ukrainian and English with structured translation resources |

### Design principles

- **Editorial luxury:** restrained serif headings, Inter body text, cream/chocolate palette and muted gold.
- **Flat by default:** no glossy gradients, raised buttons, aggressive glow or heavy drop shadows.
- **Cinematic, not obstructive:** three primary atmospheric sections; native scrolling everywhere else.
- **Accessible:** keyboard-friendly navigation, responsive booking CTA and reduced-motion support.
- **Server-authoritative booking:** prices, schedules, conflicts and idempotency are validated on the backend.

## Technology

The project poster illustrates the **approved target stack**. Not all depicted libraries are installed yet.

| Layer | Currently implemented | Approved future integrations |
| --- | --- | --- |
| Frontend | **Next.js 16**, **React 19**, **TypeScript**, custom CSS foundation | **Tailwind CSS**, **shadcn/ui**, **Motion**, **Embla Carousel** |
| Client UI | Server/client React components and local state | **Zustand**, **TanStack Query**, **React Hook Form**, **Zod** |
| CMS / backend | **Payload CMS 3**, Next.js routes and domain services | Additional content and operational modules |
| Database | **PostgreSQL 17**, transactional booking domain | Shop and expanded loyalty workflows |
| Tooling | **Docker Compose**, **pnpm**, **GitHub Actions** | Production release tooling |

> **Architecture:** One Next.js application with Payload CMS and PostgreSQL. There is **no separate NestJS backend and no Supabase dependency**. See [Architecture](docs/ARCHITECTURE.md).

## Getting started

Requires **Node.js 24.22.1+**, **pnpm 11.9.0**, Docker Desktop (Linux containers) and PostgreSQL via Docker Compose.

```powershell
git clone https://github.com/clearfixx/gentlemens-barbershop.git
cd gentlemens-barbershop
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local

# Generate a strong PAYLOAD_SECRET and place it in .env.local.
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

docker compose up -d postgres
docker compose ps
pnpm dev
```

Open **http://localhost:3000** (website) or **http://localhost:3000/admin** (CMS). The initial administrator must be provisioned using the trusted process in [Admin bootstrap](docs/ADMIN-BOOTSTRAP.md); public admin registration is not supported.

Set `PAYLOAD_SECRET` and `DATABASE_URL` in `.env.local`. The example secret is only a placeholder; never use it outside local testing or commit real credentials.

### Quality checks

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions runs automated checks, but a commit should be treated as verified only after its CI run succeeds.

## Project status

**Active development — not production-ready.** The repository includes a working Next.js/Payload foundation, localized public pages, catalog and availability previews, extensive guarded booking-domain work, and early navigation and hero implementation. **Public booking confirmation remains disabled** pending release checks.

The approved visual mockup represents the **design target**, not the current released experience. Reviews, products, advanced customer accounts, admin operations and additional marketing sections are still in development or planned.

See [Implementation status](docs/IMPLEMENTATION-STATUS.md), [Roadmap](docs/ROADMAP.md), and [Backend gaps](docs/BACKEND_V1_GAP_AUDIT.md).

## Documentation

| Document | Description |
| --- | --- |
| [Product specification](docs/PRODUCT.md) | Approved capabilities and product boundaries |
| [Canonical UI/UX](docs/UI_UX_CANON.md) | Frozen visual language, scrolling and motion rules |
| [Architecture](docs/ARCHITECTURE.md) | Next.js/Payload and business-domain decisions |
| [Roadmap](docs/ROADMAP.md) | Delivery phases and acceptance scope |
| [Implementation status](docs/IMPLEMENTATION-STATUS.md) | Confirmed work and remaining verification |
| [Admin bootstrap](docs/ADMIN-BOOTSTRAP.md) | Secure administrator provisioning |
| [CI](docs/CI.md) | Validation workflows |

## Contributing & usage

This is a work-in-progress repository. Open an issue before proposing large architectural or visual changes. No license file is currently included: public visibility does not automatically grant rights to reuse, modify or redistribute the code. A dedicated license and contribution policy are pending.

---

<p align="center">
<strong>GENTLEMEN'S BARBERSHOP</strong><br>
<sub>Craft. Character. Attention to detail.</sub>
</p>
