export default function HomePage() {
  return (
    <main className="landing">
      <header className="brand"><span className="brand-mark">✦</span><span>GENTLEMEN’S<small>BARBERSHOP</small></span></header>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Преміальний барбершоп</p>
          <h1 id="hero-title">КЛАСИЧНИЙ СТИЛЬ.<br />СУЧАСНИЙ ПІДХІД.</h1>
          <p>Місце, де традиції чоловічого догляду поєднуються з бездоганним сервісом.</p>
          <a className="cta" href="#services">Наші послуги</a>
        </div>
        <div className="hero-art" aria-label="Декоративний простір для майбутньої фотографії барбершопу"><span>GENTLEMEN’S</span></div>
      </section>
      <section id="services" className="services"><p className="eyebrow">Gentlemen’s Barbershop</p><h2>НАШІ ПОСЛУГИ</h2><p>Стрижка · Оформлення бороди · Королівське гоління</p></section>
    </main>
  )
}
