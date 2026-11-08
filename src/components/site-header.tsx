import { ThemeToggle } from './theme-toggle'

const links = [
  { href: '#about', label: 'Про нас' },
  { href: '#services', label: 'Послуги' },
  { href: '#team', label: 'Майстри' },
  { href: '#locations', label: 'Локації' },
]

export function SiteHeader() {
  return (
    <header className="site-header">
      <a href="#top" className="site-brand" aria-label="Gentlemen’s Barbershop — на початок">
        <span className="site-brand__symbol" aria-hidden="true">✦</span>
        <span>GENTLEMEN’S <small>BARBERSHOP</small></span>
      </a>
      <nav aria-label="Головна навігація" className="site-nav">
        {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      <div className="site-header__actions">
        <ThemeToggle />
        <a className="header-booking" href="#booking">Записатися</a>
      </div>
    </header>
  )
}
