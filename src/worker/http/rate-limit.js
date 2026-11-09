export async function checkRateLimit(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return true;
  const result = await binding.limit({ key });
  return result.success !== false;
}
