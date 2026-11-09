#!/usr/bin/env node
/**
 * auto-fill-articles.mjs
 *
 * Tự động điền tom_tat (mô tả) và anh_url (ảnh cover) cho các bài viết
 * trong bảng `baiviet` đang để trống trên D1 production.
 *
 * Sử dụng:
 *   node scripts/data/auto-fill-articles.mjs --dry-run   (mặc định, chỉ xem trước)
 *   node scripts/data/auto-fill-articles.mjs --apply     (thực sự ghi vào D1)
 *
 * Biến môi trường bắt buộc:
 *   CLOUDFLARE_API_TOKEN   — Wrangler/Cloudflare API token
 *   CLOUDFLARE_ACCOUNT_ID  — Cloudflare Account ID
 *   GEMINI_API_KEY         — Google Gemini API key (aistudio.google.com)
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

// ─── Cấu hình ────────────────────────────────────────────────────────────────
const D1_DATABASE_NAME = 'quangtu-db';
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'ec98af014ed5d40aa1c939d19c18aaf1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const BATCH_SIZE = 50; // Số bài xử lý tối đa mỗi lần chạy
const GEMINI_MODEL = 'gemini-2.0-flash';

const isDryRun = !process.argv.includes('--apply');

// ─── Màu terminal ─────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(msg) { process.stdout.write(msg + '\n'); }
function info(msg) { log(`${c.cyan}i${c.reset}  ${msg}`); }
function ok(msg) { log(`${c.green}OK${c.reset} ${msg}`); }
function warn(msg) { log(`${c.yellow}!${c.reset}  ${msg}`); }
function err(msg) { log(`${c.red}X${c.reset}  ${msg}`); }

// ─── Kiểm tra điều kiện ───────────────────────────────────────────────────────
function checkRequirements() {
  const missing = [];
  if (!CLOUDFLARE_API_TOKEN) missing.push('CLOUDFLARE_API_TOKEN');
  if (!GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  if (missing.length) {
    err(`Thieu bien moi truong: ${missing.join(', ')}`);
    log('');
    log('Cach thiet lap (PowerShell):');
    for (const v of missing) {
      log(`  $env:${v} = "your-value-here"`);
    }
    process.exit(1);
  }
}

// ─── Chạy Wrangler D1 query ───────────────────────────────────────────────────
function d1Query(sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', D1_DATABASE_NAME,
      '--remote',
      '--command', sql,
      '--json',
    ],
    {
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
        NO_UPDATE_NOTIFIER: '1',
      },
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(`Wrangler loi:\n${result.stderr || result.stdout}`);
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return parsed?.[0]?.results ?? [];
  } catch {
    throw new Error(`Khong parse duoc JSON tu Wrangler:\n${result.stdout}`);
  }
}

// ─── Trích xuất ảnh từ HTML ───────────────────────────────────────────────────
function extractFirstImage(html) {
  if (!html || typeof html !== 'string') return null;

  // Tìm <img src="..."> hoặc <img src='...'>
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1]) {
    const src = imgMatch[1].trim();
    // Bỏ qua data URI (quá dài)
    if (src.startsWith('data:')) return null;
    return src;
  }

  // Tìm markdown image: ![alt](url)
  const mdMatch = html.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (mdMatch?.[1]) return mdMatch[1].trim();

  return null;
}

// ─── Strip HTML thành plain text ──────────────────────────────────────────────
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Gọi Gemini API để sinh mô tả ────────────────────────────────────────────
async function generateDescription(tieuDe, noiDung) {
  const plainText = stripHtml(noiDung).slice(0, 1000);
  const prompt = `Ban la tro ly viet mo ta ngan cho bai viet Phat phap tieng Viet.

Tieu de: "${tieuDe}"
Noi dung dau bai: "${plainText}"

Hay viet 1-2 cau mo ta ngan gon (toi da 160 ky tu), suc tich, bang tieng Viet, phu hop lam meta description cho website. Chi tra ve doan mo ta, khong giai thich them.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.4 },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API loi ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  return text.slice(0, 200);
}

// ─── Escape SQL string ────────────────────────────────────────────────────────
function sqlEscape(str) {
  return String(str || '').replace(/'/g, "''");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('');
  log(`${c.bold}=== Tu dong dien mo ta & anh cover bai viet ===${c.reset}`);
  log(`Che do: ${isDryRun ? c.yellow + 'DRY-RUN (chi xem, khong ghi)' : c.green + 'APPLY (se ghi vao D1 production)'}${c.reset}`);
  log('');

  checkRequirements();

  // 1. Query các bài cần điền
  info('Dang tim bai viet con thieu du lieu...');
  const rows = d1Query(`
    SELECT id, tieu_de, tom_tat, anh_url, noi_dung, danh_muc
    FROM baiviet
    WHERE (TRIM(tom_tat) = '' OR TRIM(anh_url) = '')
    ORDER BY created_at DESC
    LIMIT ${BATCH_SIZE}
  `);

  if (!rows.length) {
    ok('Khong co bai viet nao can dien. Tat ca da co du du lieu!');
    return;
  }

  info(`Tim thay ${c.bold}${rows.length}${c.reset} bai viet can xu ly.`);
  log('');

  // 2. Xử lý từng bài
  const results = [];
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prefix = `[${String(i + 1).padStart(2)}/${rows.length}]`;
    const shortTitle = (row.tieu_de || '').slice(0, 45);
    process.stdout.write(`${c.dim}${prefix}${c.reset} ${shortTitle}... `);

    const update = {};
    const notes = [];

    try {
      // Xử lý ảnh cover
      if (!row.anh_url?.trim()) {
        const imgUrl = extractFirstImage(row.noi_dung);
        if (imgUrl) {
          update.anh_url = imgUrl;
          notes.push('anh OK');
        } else {
          notes.push('anh: khong tim thay');
        }
      } else {
        notes.push('anh: da co');
      }

      // Xử lý mô tả
      if (!row.tom_tat?.trim()) {
        const desc = await generateDescription(row.tieu_de, row.noi_dung);
        if (desc) {
          update.tom_tat = desc;
          notes.push('mo ta OK');
        } else {
          notes.push('mo ta: trong');
        }
      } else {
        notes.push('mo ta: da co');
      }

      results.push({ row, update, notes });

      if (Object.keys(update).length > 0) {
        process.stdout.write(`${c.green}OK${c.reset} (${notes.join(', ')})\n`);
        successCount++;
      } else {
        process.stdout.write(`${c.dim}bo qua${c.reset} (${notes.join(', ')})\n`);
        skipCount++;
      }
    } catch (error) {
      process.stdout.write(`${c.red}LOI${c.reset} — ${error.message}\n`);
      results.push({ row, update: {}, notes: ['loi: ' + error.message], error: true });
      errorCount++;
    }

    // Delay nhỏ để tránh rate limit Gemini
    if (i < rows.length - 1) await new Promise((r) => setTimeout(r, 400));
  }

  // 3. Hiển thị preview
  log('');
  log(`${c.bold}--- Preview ket qua ---${c.reset}`);
  for (const { row, update } of results) {
    if (!Object.keys(update).length) continue;
    log(`\n${c.bold}${row.tieu_de}${c.reset}`);
    if (update.anh_url) log(`  ${c.blue}Anh:${c.reset} ${update.anh_url}`);
    if (update.tom_tat) log(`  ${c.blue}Mo ta:${c.reset} ${update.tom_tat}`);
  }

  log('');
  log(`${c.bold}--- Tong ket ---${c.reset}`);
  log(`  ${c.green}Se cap nhat: ${successCount} bai${c.reset}`);
  if (skipCount) log(`  ${c.dim}Bo qua: ${skipCount} bai${c.reset}`);
  if (errorCount) log(`  ${c.red}Loi: ${errorCount} bai${c.reset}`);

  if (isDryRun) {
    log('');
    warn('Day la che do DRY-RUN — khong co gi duoc ghi vao database.');
    warn('De thuc su ap dung, chay lai voi:');
    log(`  ${c.bold}node scripts/data/auto-fill-articles.mjs --apply${c.reset}`);
    return;
  }

  // 4. Ghi vào D1 production
  log('');
  info('Dang ghi vao D1 production...');

  const now = new Date().toISOString();
  let written = 0;
  for (const { row, update } of results) {
    if (!Object.keys(update).length) continue;

    const setClosed = Object.entries(update)
      .map(([col, val]) => `${col} = '${sqlEscape(val)}'`)
      .join(', ');

    try {
      d1Query(`UPDATE baiviet SET ${setClosed}, updated_at = '${now}' WHERE id = '${sqlEscape(row.id)}'`);
      ok(`Cap nhat: ${(row.tieu_de || '').slice(0, 50)}`);
      written++;
    } catch (error) {
      err(`Loi khi cap nhat "${(row.tieu_de || '').slice(0, 40)}": ${error.message}`);
    }
  }

  log('');
  ok(`${c.bold}Hoan thanh! Da cap nhat ${written}/${successCount} bai viet.${c.reset}`);
}

main().catch((error) => {
  err('Script gap loi khong mong doi:');
  console.error(error);
  process.exit(1);
});
