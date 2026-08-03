'use client';

import { useEffect, useRef, useState } from 'react';

// Renders every page of a PDF onto its own <canvas>, stacked in a
// scrollable column. This avoids relying on the browser's built-in
// PDF viewer inside an <iframe>, which on mobile Safari often shows
// only the first page with no way to scroll through the rest.
export default function PdfViewer({ fileUrl }) {
  const containerRef = useRef(null);
  const [error, setError] = useState('');
  const [loadingPdf, setLoadingPdf] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await import('pdfjs-dist/build/pdf');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error('Failed to fetch file');
        const buffer = await res.arrayBuffer();

        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled) return;

        const container = containerRef.current;
        container.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.marginBottom = '16px';
          canvas.style.borderRadius = '8px';
          canvas.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)';

          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;

          if (cancelled) return;
          container.appendChild(canvas);
        }

        setLoadingPdf(false);
      } catch (e) {
        if (!cancelled) {
          setError('Could not load this PDF.');
          setLoadingPdf(false);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  return (
    <div>
      {loadingPdf && <p className="text-ink/60 text-sm mb-3">Loading…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div ref={containerRef} />
    </div>
  );
}
