import { api, blobErrorMessage, publicApi } from './api';

function filenameFrom(header, fallback) {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) { try { return decodeURIComponent(star[1]); } catch { /* fall through */ } }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Download an authenticated (or public, with `client`) file endpoint. Throws an Error with a readable message. */
export async function downloadFrom(url, fallbackName, client = api) {
  try {
    const res = await client.get(url, { responseType: 'blob' });
    saveBlob(res.data, filenameFrom(res.headers['content-disposition'], fallbackName));
  } catch (e) { throw new Error(await blobErrorMessage(e, 'Download failed.')); }
}

export async function fetchBlob(url, client = api) {
  try { return (await client.get(url, { responseType: 'blob' })).data; }
  catch (e) { throw new Error(await blobErrorMessage(e, 'Could not open the file.')); }
}

export const publicClient = publicApi;
