'use client';

import { useEffect, useState } from 'react';
import { getSignedUrl } from '../../lib/storageClient';

// Displays an image stored in a private Supabase Storage bucket by
// fetching a short-lived signed URL first (shows a soft placeholder
// while that request is in flight).
export default function StorageImage({ bucket, path, alt = '', className = '' }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    getSignedUrl(bucket, path).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => {
      active = false;
    };
  }, [bucket, path]);

  if (!url) {
    return <div className={`${className} bg-sand-dark/40 animate-pulse`} />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
