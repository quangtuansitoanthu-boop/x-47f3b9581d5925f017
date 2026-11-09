/** Keep the timeout active until the response body has been consumed. */
export function requestDeadline(signal?: AbortSignal | null, milliseconds = 12_000) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), milliseconds);
  return { signal: controller.signal, dispose() { clearTimeout(timer); signal?.removeEventListener('abort', abort); } };
}

export async function fetchWithDeadline(input: RequestInfo | URL, init?: RequestInit, milliseconds = 12_000, fetcher: typeof fetch = fetch): Promise<Response> {
  const deadline = requestDeadline(init?.signal ?? (input instanceof Request ? input.signal : null), milliseconds);
  try {
    const response = await fetcher(input, { ...init, signal: deadline.signal });
    if (!response.body) { deadline.dispose(); return response; }
    if ([204, 205, 304].includes(response.status)) {
      deadline.dispose();
      void response.body.cancel().catch(() => {});
      return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    const reader = response.body.getReader();
    return new Response(new ReadableStream({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) { deadline.dispose(); controller.close(); }
          else controller.enqueue(chunk.value);
        } catch (error) { deadline.dispose(); controller.error(error); }
      },
      async cancel(reason) { deadline.dispose(); await reader.cancel(reason); },
    }), { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) { deadline.dispose(); throw error; }
}

export async function fetchBoundedBytes(url: string, signal: AbortSignal, maxBytes = 64 * 1024 * 1024): Promise<Uint8Array> {
  const deadline = requestDeadline(signal, 30_000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: deadline.signal });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('File is too large'); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Streaming download is unavailable');
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > maxBytes) throw new Error('File is too large');
        chunks.push(chunk.value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { deadline.dispose(); }
}
