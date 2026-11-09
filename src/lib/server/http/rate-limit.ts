export async function checkRateLimit(binding: { limit?: (input: { key: string }) => Promise<{ success?: boolean }> } | null | undefined, key: string): Promise<boolean> {
  if (!binding || typeof binding.limit !== 'function') return true;
  const result = await binding.limit({ key });
  return result.success !== false;
}
