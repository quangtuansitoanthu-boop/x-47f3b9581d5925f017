export function encodeMediaFileNameHeader(fileName: string): string {
  return encodeURIComponent(fileName);
}
