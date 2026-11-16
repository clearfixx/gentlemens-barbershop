import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import { notFound, redirect } from 'next/navigation'
import config from '@/payload.config'
import { isLocale } from '@/i18n/config'
import { resolveLocationScope } from '@/lib/admin/location-access'
import { loadProfessionalReviewDetail } from '@/lib/admin/professional-review-detail'
import { ProfessionalRejectForm } from '@/components/admin/professional-reject-form'
import { ProfessionalBiographyApprove } from '@/components/admin/professional-biography-approve'
import '../../approvals/management.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Деталі погодження | Gentlemen’s Barbershop',
  robots: { index: false, follow: false },
}

export default async function ProfessionalReviewDetailPage({
  params,
}: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  const uk = locale === 'uk'
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect(`/${locale}/auth`)
  if (user.role !== 'admin' && user.role !== 'location_admin') notFound()
  const scope = await resolveLocationScope(payload, {
    id: Number(user.id), role: user.role,
  }).catch(() => null)
  if (!scope) notFound()
  let detail: Awaited<ReturnType<typeof loadProfessionalReviewDetail>>
  try {
    detail = await loadProfessionalReviewDetail(payload, scope, id)
  } catch (error) {
    if (error instanceof RangeError ||
      (error instanceof Error && /outside assigned|private|mismatch|not found/i.test(error.message))) {
      notFound()
    }
    throw error
  }
  const fieldNames: Record<string, string> = uk
    ? { bio: 'Біографія', localizedBio: 'Переклад біографії' }
    : { bio: 'Biography', localizedBio: 'Biography translation' }
  const statuses: Record<string, string> = uk
    ? { pending: 'Очікує', approved: 'Схвалено', rejected: 'Відхилено' }
    : { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }

  return <main className="management-shell management-detail-shell">
    <aside className="management-sidebar">
      <Link className="management-brand" href={`/${locale}/management`}>
        GENTLEMEN’S <span>BARBERSHOP</span>
      </Link>
      <p className="management-sidebar__caption">{uk ? 'КЕРУВАННЯ' : 'MANAGEMENT'}</p>
      <Link className="management-sidebar__item" href={`/${locale}/management`}>
        {uk ? 'Огляд мережі' : 'Network overview'}
      </Link>
      <Link className="management-sidebar__item management-sidebar__item--active"
        href={`/${locale}/management/professional-reviews`}>
        {uk ? 'Погодження контенту' : 'Content reviews'}
      </Link>
    </aside>
    <div className="management-workspace">
      <div className="management-content">
        <p className="management-eyebrow">GENTLEMEN’S / {uk ? 'ПРОФЕСІЙНИЙ КОНТЕНТ' : 'PROFESSIONAL CONTENT'}</p>
        <Link href={`/${locale}/management/professional-reviews`} className="management-back-link">
          {uk ? '← До списку заявок' : '← Back to review queue'}
        </Link>
        <div className="management-heading">
          <div>
            <h1>{uk ? 'Заявка на зміну профілю' : 'Professional profile review'} #{detail.id}</h1>
            <p>{detail.barber.name} · {uk ? 'Заклад' : 'Location'} #{detail.locationId}</p>
          </div>
          <span className="management-scope">{statuses[detail.status]}</span>
        </div>
        <section className="management-panel" aria-labelledby="professional-detail-heading">
          <h2 id="professional-detail-heading">
            {uk ? 'Порівняння текстових змін' : 'Text changes comparison'}
          </h2>
          {detail.fields.length ? detail.fields.map(field => <div className="management-review-field" key={field.field}>
            <h3>{fieldNames[field.field]}{field.field === 'localizedBio' && detail.localizedLocale
              ? ` (${detail.localizedLocale.toUpperCase()})` : ''}</h3>
            <div className="management-review-comparison">
              <div><strong>{uk ? 'Було' : 'Previous'}</strong>
                <p>{field.before ?? (uk ? 'Немає тексту або формат не підтримується' : 'No text or unsupported format')}</p>
              </div>
              <div><strong>{uk ? 'Запропоновано' : 'Proposed'}</strong>
                <p>{field.after ?? (uk ? 'Немає тексту або формат не підтримується' : 'No text or unsupported format')}</p>
              </div>
            </div>
          </div>) : <p className="management-empty">
            {uk ? 'У заявці немає підтримуваних текстових змін.' : 'No supported text changes found.'}
          </p>}
          {detail.unsupportedChangeCount > 0 && <p className="management-review-warning">
            {uk
              ? `Інші зміни (${detail.unsupportedChangeCount}) приховані до впровадження безпечної перевірки медіа та структури даних.`
              : `${detail.unsupportedChangeCount} other changes are hidden pending media and schema validation.`}
          </p>}
        </section>
        {detail.status === 'rejected' && detail.rejectionReason && <section className="management-panel management-booking-results">
          <h2>{uk ? 'Причина відхилення' : 'Rejection reason'}</h2>
          <p>{detail.rejectionReason}</p>
        </section>}
        {scope.role === 'admin' && detail.status === 'pending' && detail.approvableKind &&
          <ProfessionalBiographyApprove id={detail.id} locale={locale} kind={detail.approvableKind}/>}
        {scope.role === 'admin' && detail.status === 'pending' &&
          <ProfessionalRejectForm id={detail.id} locale={locale}/>}
        <p className="management-booking-note">{uk
          ? 'Можна схвалити звичайну біографію або перевірений переклад однією мовою. Фото, сертифікати та соцпосилання ще недоступні для публікації.'
          : 'A verified plain biography or a single-language translation may be approved. Photos, certificates and social links cannot yet be published.'}</p>
      </div>
    </div>
  </main>
}
