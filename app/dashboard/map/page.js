'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const TEXT = {
  en: {
    back: '← Back to the app',
    title: 'Community map',
    intro: 'Plan of Hacienda del Señorío de Cifuentes: blocks 01–28, pools, gatehouse and both entrances.',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    reset: 'Whole plan',
    hint: 'Use the buttons to zoom. When zoomed in, drag the map to move around. On a phone you can also pinch.',
    alt: 'Plan of the Hacienda del Señorío de Cifuentes community',
  },
  es: {
    back: '← Volver a la aplicación',
    title: 'Plano de la comunidad',
    intro: 'Plano de Hacienda del Señorío de Cifuentes: bloques 01–28, piscinas, garita y ambas entradas.',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    reset: 'Plano completo',
    hint: 'Use los botones para ampliar. Con el plano ampliado, arrástrelo para moverse. En el móvil también puede pellizcar.',
    alt: 'Plano de la comunidad Hacienda del Señorío de Cifuentes',
  },
  fr: {
    back: '← Retour à l’application',
    title: 'Plan de la résidence',
    intro: 'Plan de Hacienda del Señorío de Cifuentes : blocs 01–28, piscines, poste d’accueil et les deux entrées.',
    zoomIn: 'Agrandir',
    zoomOut: 'Réduire',
    reset: 'Plan complet',
    hint: 'Utilisez les boutons pour zoomer. Une fois agrandi, faites glisser le plan pour vous déplacer. Sur téléphone, vous pouvez aussi pincer.',
    alt: 'Plan de la résidence Hacienda del Señorío de Cifuentes',
  },
  de: {
    back: '← Zurück zur App',
    title: 'Lageplan der Anlage',
    intro: 'Plan der Hacienda del Señorío de Cifuentes: Blöcke 01–28, Pools, Pförtnerhaus und beide Zufahrten.',
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    reset: 'Ganzer Plan',
    hint: 'Mit den Schaltflächen zoomen. Im vergrößerten Zustand den Plan ziehen, um sich zu bewegen. Auf dem Handy geht auch Zwei-Finger-Zoom.',
    alt: 'Lageplan der Anlage Hacienda del Señorío de Cifuentes',
  },
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const STEP = 0.5

export default function CommunityMapPage() {
  const [lang, setLang] = useState('en')
  const [zoom, setZoom] = useState(1)
  const [frameHeight, setFrameHeight] = useState(560)

  useEffect(() => {
    const browserLang = (navigator.language || 'en').slice(0, 2).toLowerCase()
    if (TEXT[browserLang]) setLang(browserLang)

    // The frame always fits on the screen, so the whole plan is visible at zoom 1.
    const updateHeight = () => setFrameHeight(Math.max(380, window.innerHeight - 300))
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  const t = TEXT[lang]
  const buttonStyle = {
    padding: '8px 14px',
    border: '1px solid #cfcfcf',
    borderRadius: 8,
    background: '#fff',
    color: '#222',
    cursor: 'pointer',
    fontSize: 14,
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px' }}>
      <Link
        href="/dashboard"
        style={{
          display: 'inline-block',
          marginBottom: 12,
          padding: '8px 14px',
          borderRadius: 8,
          background: '#1f3a4d',
          color: '#fff',
          textDecoration: 'none',
          fontSize: 14,
        }}
      >
        {t.back}
      </Link>

      <h1 style={{ fontSize: 24, marginBottom: 6 }}>{t.title}</h1>
      <p style={{ marginTop: 0, color: '#555' }}>{t.intro}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + STEP))}
          disabled={zoom >= MAX_ZOOM}
        >
          + {t.zoomIn}
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - STEP))}
          disabled={zoom <= MIN_ZOOM}
        >
          − {t.zoomOut}
        </button>
        <button type="button" style={buttonStyle} onClick={() => setZoom(1)}>
          {t.reset}
        </button>
      </div>

      <div
        style={{
          overflow: 'auto',
          height: frameHeight,
          boxSizing: 'border-box',
          border: '1px solid #ddd',
          borderRadius: 10,
          background: '#f4f1ea',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/community-map.jpg"
          alt={t.alt}
          style={{
            display: 'block',
            margin: '0 auto',
            height: (frameHeight - 2) * zoom,
            width: 'auto',
            maxWidth: 'none',
          }}
        />
      </div>

      <p style={{ fontSize: 13, color: '#666', marginTop: 10 }}>{t.hint}</p>
    </div>
  )
}
