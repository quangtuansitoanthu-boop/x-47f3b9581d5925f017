export interface AudioArtwork {
  position: string;
  src: string;
}

export function parseAudioArtwork(value: string | null | undefined): AudioArtwork {
  const artwork = String(value ?? '');
  const marker = '#pos=';
  if (!artwork.includes(marker)) return { position: 'center', src: artwork };

  const [src, encodedPosition = 'center'] = artwork.split(marker, 2);
  try {
    return { position: decodeURIComponent(encodedPosition) || 'center', src };
  } catch {
    return { position: 'center', src };
  }
}
