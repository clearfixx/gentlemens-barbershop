import { SiteHeader } from '@/components/site-header'

export default function HomePage() {
  return <main id="top" className="landing">
    <SiteHeader />
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">Традиції. Майстерність. Стиль.</p>
        <h1 id="hero-title">МІСЦЕ, ДЕ<br/>НАРОДЖУЄТЬСЯ<br/><em>СТИЛЬ.</em></h1>
        <p>Чоловічий догляд із характером. Класична майстерність, увага до деталей і атмосфера, до якої хочеться повертатися.</p>
        <div className="hero-actions"><a className="cta" href="#booking">Записатися</a><a href="#about">Дізнатися більше ↗</a></div>
      </div>
      <div className="hero-art" role="img" aria-label="Декоративна заглушка для фотографії барбершопу"><span>✦<small>GENTLEMEN’S BARBERSHOP</small></span></div>
      <a className="scroll-hint" href="#about" aria-label="Перейти до наступної секції">↓</a>
    </section>
    <section id="about" className="content-section"><p className="eyebrow">Чому обирають нас</p><h2>БІЛЬШЕ, НІЖ СТРИЖКА</h2><p>Майстерність, атмосфера та увага до деталей.</p></section>
    <section id="services" className="content-section alt"><p className="eyebrow">Традиції догляду</p><h2>НАШІ ПОСЛУГИ</h2><p>Стрижка · Борода · Королівське гоління</p></section>
    <section id="team" className="content-section"><p className="eyebrow">Майстри</p><h2>НАША КОМАНДА</h2><p>Профілі барберів з’являться після підключення CMS.</p></section>
    <section id="locations" className="content-section alt"><p className="eyebrow">Локації</p><h2>ЯК НАС ЗНАЙТИ</h2><p>Адреси та графіки роботи будуть додані в CMS.</p></section>
    <section id="booking" className="content-section"><p className="eyebrow">Ваш візит</p><h2>ОНЛАЙН-ЗАПИС</h2><p>Сервіс бронювання перебуває в розробці.</p></section>
    <footer className="site-footer">© 2026 GENTLEMEN’S BARBERSHOP</footer>
  </main>
}
