import Link from 'next/link'
import { ThemeToggle } from './theme-toggle'

const links = [
  { href: '/#about', label: 'Про нас' },
  { href: '/catalog', label: 'Каталог' },
  { href: '/#team', label: 'Майстри' },
  { href: '/#locations', label: 'Локації' },
]

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="site-brand" aria-label="Gentlemen’s Barbershop — на початок">
        <span className="site-brand__symbol" aria-hidden="true">✦</span>
        <span>GENTLEMEN’S <small>BARBERSHOP</small></span>
      </Link>
      <nav aria-label="Головна навігація" className="site-nav">
        {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className="site-header__actions">
        <ThemeToggle />
        <Link className="header-booking" href="/catalog">Послуги й майстри</Link>
      </div>
    </header>
  )
}
