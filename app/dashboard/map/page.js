'use client'

import { useEffect, useState } from 'react'

const TEXT = {
  en: {
    title: 'Community map',
    intro: 'Plan of Hacienda del Señorío de Cifuentes: blocks 01–28, pools, gatehouse and both entrances.',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    reset: 'Fit to screen',
    open: 'Open full size',
    hint: 'Scroll or drag the map to move around. On a phone you can also pinch to zoom.',
    alt: 'Plan of the Hacienda del Señorío de Cifuentes community',
  },
  es: {
    title: 'Plano de la comunidad',
    intro: 'Plano de Hacienda del Señorío de Cifuentes: bloques 01–28, piscinas, garita y ambas entradas.',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    reset: 'Ajustar a la pantalla',
    open: 'Abrir a tamaño completo',
    hint: 'Desplácese o arrastre el plano para moverse. En el móvil también puede pellizcar para ampliar.',
    alt: 'Plano de la comunidad Hacienda del Señorío de Cifuentes',
  },
  fr: {
    title: 'Plan de la résidence',
    intro: 'Plan de Hacienda del Señorío de Cifuentes : blocs 01–28, piscines, poste d’accueil et les deux entrées.',
    zoomIn: 'Agrandir',
    zoomOut: 'Réduire',
    reset: 'Ajuster à l’écran',
    open: 'Ouvrir en taille réelle',
    hint: 'Faites défiler ou faites glisser le plan pour vous déplacer. Sur téléphone, vous pouvez aussi pincer pour zoomer.',
    alt: 'Plan de la résidence Hacienda del Señorío de Cifuentes',
  },
  de: {
    title: 'Lageplan der Anlage',
    intro: 'Plan der Hacienda del Señorío de Cifuentes: Blöcke 01–28, Pools, Pförtnerhaus und beide Zufahrten.',
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    reset: 'An Bildschirm anpassen',
    open: 'In voller Größe öffnen',
    hint: 'Zum Bewegen den Plan scrollen oder ziehen. Auf dem Handy können Sie auch mit zwei Fingern zoomen.',
    alt: 'Lageplan der Anlage Hacienda del Señorío de Cifuentes',
  },
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const STEP = 0.5

export default function CommunityMapPage() {
  const [lang, setLang] = useState('en')
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const browserLang = (navigator.language || 'en').slice(0, 2).toLowerCase()
    if (TEXT[browserLang]) setLang(browserLang)
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
        <a
          href="/community-map.jpg"
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...buttonStyle, textDecoration: 'none', display: 'inline-block' }}
        >
          {t.open}
        </a>
      </div>

      <div
        style={{
          overflow: 'auto',
          maxHeight: '75vh',
          border: '1px solid #ddd',
          borderRadius: 10,
          background: '#fff',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/community-map.jpg"
          alt={t.alt}
          style={{ display: 'block', width: `${zoom * 100}%`, maxWidth: 'none', height: 'auto' }}
        />
      </div>

      <p style={{ fontSize: 13, color: '#666', marginTop: 10 }}>{t.hint}</p>
    </div>
  )
}
