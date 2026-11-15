'use client'

import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Locale } from '@/i18n/config'

type EligibleVisit = { id: number; startsAt: string }
type OwnReview = { id: number; rating: number; comment: string; status: 'pending' | 'published' | 'rejected'; createdAt: string }

export function AccountReviews({ locale, eligibleVisits, reviews }: {
  locale: Locale
  eligibleVisits: EligibleVisit[]
  reviews: OwnReview[]
}) {
  const uk = locale === 'uk'
  const router = useRouter()
  const [bookingId, setBookingId] = useState(eligibleVisits[0]?.id ?? 0)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const formatter = new Intl.DateTimeFormat(uk ? 'uk-UA' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv',
  })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setMessage('')
    setError('')
    setBusy(true)
    try {
      const response = await fetch('/api/account/reviews', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, rating, comment }),
      })
      if (!response.ok) {
        if (response.status === 409) throw new Error(uk ? 'Для цього візиту відгук уже є або він недоступний.' : 'This visit already has a review or is not eligible.')
        if (response.status === 401) throw new Error(uk ? 'Потрібно увійти в акаунт.' : 'Please sign in.')
        throw new Error(uk ? 'Не вдалося надіслати відгук.' : 'Could not submit the review.')
      }
      setComment('')
      setMessage(uk ? 'Відгук надіслано на модерацію.' : 'Your review was sent for moderation.')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (uk ? 'Помилка мережі.' : 'Network error.'))
    } finally {
      setBusy(false)
    }
  }

  const labels = {
    pending: uk ? 'На модерації' : 'Pending moderation',
    published: uk ? 'Опубліковано' : 'Published',
    rejected: uk ? 'Відхилено' : 'Rejected',
  }
  return <div className="account-reviews">
    {reviews.length > 0 && <ul className="account-reviews__list">
      {reviews.map(review => <li key={review.id} className="account-reviews__item">
        <div className="account-reviews__meta">
          <span className="account-reviews__stars" aria-label={(uk ? 'Оцінка: ' : 'Rating: ') + review.rating + '/5'}>
            {Array.from({ length: 5 }, (_, index) =>
              <Star key={index} size={14} fill={index < review.rating ? 'currentColor' : 'none'} aria-hidden="true"/>)}
          </span>
          <span>{labels[review.status]}</span>
        </div>
        <p>{review.comment}</p>
        <time dateTime={review.createdAt}>{formatter.format(new Date(review.createdAt))}</time>
      </li>)}
    </ul>}
    {eligibleVisits.length > 0 ? <form className="account-reviews__form" onSubmit={event => void submit(event)}>
      <h3>{uk ? 'Залишити відгук про візит' : 'Review a completed visit'}</h3>
      <label htmlFor="account-review-booking">{uk ? 'Завершений візит' : 'Completed visit'}</label>
      <select id="account-review-booking" value={bookingId}
        onChange={event => setBookingId(Number(event.target.value))} disabled={busy}>
        {eligibleVisits.map(visit => <option key={visit.id} value={visit.id}>
          {formatter.format(new Date(visit.startsAt))} · #{visit.id}
        </option>)}
      </select>
      <fieldset className="account-reviews__rating">
        <legend>{uk ? 'Оцінка' : 'Rating'}</legend>
        {[1, 2, 3, 4, 5].map(value => <label key={value}>
          <input type="radio" name="reviewRating" value={value} checked={rating === value}
            onChange={() => setRating(value)} disabled={busy}/>
          <span>{value} <Star size={13} aria-hidden="true" /></span>
        </label>)}
      </fieldset>
      <label htmlFor="account-review-comment">{uk ? 'Ваш відгук' : 'Your review'}</label>
      <textarea id="account-review-comment" value={comment} onChange={event => setComment(event.target.value)}
        minLength={10} maxLength={1500} rows={3} required disabled={busy}
        placeholder={uk ? 'Розкажіть про візит (від 10 символів)' : 'Tell us about your visit (at least 10 characters)'} />
      <button type="submit" disabled={busy || bookingId === 0 || comment.trim().length < 10}>
        {busy ? (uk ? 'Надсилання…' : 'Sending…') : (uk ? 'Надіслати відгук' : 'Submit review')}
      </button>
      {message && <p role="status" className="account-reviews__success">{message}</p>}
      {error && <p role="alert" className="account-reviews__error">{error}</p>}
    </form> : reviews.length === 0 ? <p className="account-reviews__empty">
      {uk ? 'Відгук можна залишити після завершеного візиту.' : 'You can leave a review after a completed visit.'}
    </p> : null}
  </div>
}
