if (process.env.CLOUDFLARE_PRODUCTION_APPROVED !== 'yes') {
  console.error(
    'Production deploy bị chặn. Chỉ chạy sau staging acceptance và go/no-go, ' +
    'với CLOUDFLARE_PRODUCTION_APPROVED=yes.',
  );
  process.exit(1);
}
