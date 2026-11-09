# Tu tập cùng Quang Từ

`Tu tập cùng Quang Từ` là một PWA tiếng Việt cho nội dung Phật giáo, chạy production bằng SvelteKit trên Cloudflare Workers, D1 và R2.

Môi trường phát triển và GitHub Actions dùng Node.js 24 LTS. Chạy `nvm use` để chọn đúng major version trước khi cài dependency hoặc chạy release gates.

## Kiến Trúc Hiện Tại

- `quangtu-web` là web runtime duy nhất và chạy SvelteKit tại `https://quangtu.vn`.
- `quangtu-jobs` sở hữu scheduled cleanup độc lập với web runtime.
- Google và Facebook OAuth là các đường đăng nhập; authorization luôn do session và capability phía server quyết định. Kết nối nhập bài Facebook là capability admin riêng, không phải điều kiện để đăng nhập.
- Repository không còn source/build/deploy path cho rollback Worker cũ. Redirect `.html`, storage keys và PWA cleanup cũ chỉ còn để bảo vệ người dùng hiện hữu.
- Các entry point và boundary chính được dẫn từ [`docs/codebase-summary.md`](./docs/codebase-summary.md); contract vận hành nằm trong [`docs/deployment-guide.md`](./docs/deployment-guide.md).

## Runtime

- Web worker config: [`wrangler.sveltekit.jsonc`](./wrangler.sveltekit.jsonc)
- Jobs worker config: [`wrangler.jobs.jsonc`](./wrangler.jobs.jsonc)
- Routes: `src/routes/`
- Shared shell: `src/routes/+layout.svelte` + `src/lib/components/layout/*`
- Primary commands:

```bash
npm run check
npm run build
npm test
```

`npm test` chạy core gate không gồm browser E2E; dùng `npm run test:release`
cho toàn bộ core + Playwright.

Production deploy dùng explicit Wrangler configs và approval guard. Luôn lấy command
hiện hành từ `package.json` và theo runbook trong
[`docs/deployment-guide.md`](./docs/deployment-guide.md#deploy-commands).

### Chạy local đầy đủ

Chọn Node.js 24, cài dependency đúng theo `package-lock.json`, rồi khởi động
SvelteKit cùng D1/R2 local:

```bash
npm install
npm run dev
```

Mở `http://127.0.0.1:4173`. Đăng nhập local dùng provider OAuth đã được cấu hình;
Google và Facebook có callback riêng, còn connector nhập bài Facebook cần thêm
quyền và secret bảo vệ token. Xem thiết lập và các gate an toàn tại
[`docs/deployment-guide.md`](./docs/deployment-guide.md#sveltekit-full-local-runtime).

Nếu chỉ cần Vite UI mà không chuẩn bị D1 hoặc tài khoản local, dùng `npm run dev:vite`.
Các bước cài đặt, chạy test nhanh và Playwright E2E nằm trong
[`docs/deployment-guide.md`](./docs/deployment-guide.md#cài-source-lần-đầu).

## Repo Layout

| Path | Vai trò |
|---|---|
| `src/routes/` | SvelteKit pages, layout, route handlers and catchall API bridge |
| `src/lib/` | shared components, browser helpers, server helpers, contracts, styles |
| `src/worker/` | shared JavaScript domain/API modules được SvelteKit server bridge tái sử dụng |
| `src/jobs/` | production scheduled cleanup worker |
| `migrations/` | D1 schema and migration history |
| `tests/` | unit, integration, deployment, PWA và browser test suites |
| `docs/` | live project docs |
| `plans/` | stateful implementation plans and completion reports |
| `static/vendor/pdfjs/` | self-hosted PDF.js 6.2.108 bundle and cmap assets |

## Contract Boundaries

- Same-origin API và security contract: [`docs/api-contract.md`](./docs/api-contract.md)
- Runtime, route và module ownership: [`docs/system-architecture.md`](./docs/system-architecture.md)
- Migration source boundary: [`docs/migration-source-boundary.md`](./docs/migration-source-boundary.md)
- UI/authoring decisions: [`docs/design-guidelines.md`](./docs/design-guidelines.md)

## Documentation

- [`docs/project-overview-pdr.md`](./docs/project-overview-pdr.md)
- [`docs/codebase-summary.md`](./docs/codebase-summary.md)
- [`docs/code-standards.md`](./docs/code-standards.md)
- [`docs/system-architecture.md`](./docs/system-architecture.md)
- [`docs/project-roadmap.md`](./docs/project-roadmap.md)
- [`docs/deployment-guide.md`](./docs/deployment-guide.md)
- [`docs/design-guidelines.md`](./docs/design-guidelines.md)
- [`docs/api-contract.md`](./docs/api-contract.md)
- [`docs/migration-source-boundary.md`](./docs/migration-source-boundary.md)

## Known Limits

- Repository không còn chứa legacy rollback runtime; rollback production cần dùng Cloudflare version history và D1/R2 backups theo quy trình vận hành bên ngoài repo.
- Accessibility/browser parity is automated for the main routes, but real-device verification remains a release gate.

## Claude Code

Quy trình code, 7 skills chuyên biệt Capacitor và 3 MCP cho dự án được cấu hình trong `CLAUDE.md`,
`.claude/skills/` và `.mcp.json`. Xem nguồn, cách sử dụng và lệnh kiểm tra tại
[`docs/claude-code-setup.md`](./docs/claude-code-setup.md).

## License

No license file is present in the repository. Treat license status as unconfirmed until a file or explicit statement is added.
