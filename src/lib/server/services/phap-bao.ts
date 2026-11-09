import type { CloudflareEnvLike } from '../cloudflare-context';
import { ServerInputError } from '../errors';

export interface PhapBaoItemRecord {
  id: string;
  loai: 'kinh' | 'phap_bao';
  tieu_de: string;
  mo_ta: string;
  anh_url: string;
  link_shopee: string;
  con_hang: number;
  so_thu_tu: number;
  created_at: string;
  updated_at: string;
}

export interface PhapBaoHistoryRecord {
  id: string;
  user_id: string;
  item_id: string | null;
  item_title: string;
  item_loai: string;
  danh_hieu: string;
  shopee_url: string;
  created_at: string;
}

export async function listPublicPhapBaoItems(env: CloudflareEnvLike): Promise<PhapBaoItemRecord[]> {
  const result = await env.DB.prepare(`
    SELECT id, loai, tieu_de, mo_ta, anh_url, link_shopee, con_hang, so_thu_tu, created_at, updated_at
    FROM phap_bao_items
    ORDER BY so_thu_tu ASC, created_at ASC
  `).all<PhapBaoItemRecord>();
  return result.results ?? [];
}

export async function createPhapBaoItem(
  env: CloudflareEnvLike,
  input: {
    loai?: unknown;
    tieu_de?: unknown;
    mo_ta?: unknown;
    anh_url?: unknown;
    link_shopee?: unknown;
    con_hang?: unknown;
    so_thu_tu?: unknown;
  }
): Promise<PhapBaoItemRecord> {
  const loai = String(input.loai ?? '').trim();
  if (loai !== 'kinh' && loai !== 'phap_bao') {
    throw new ServerInputError(400, 'invalid_loai', 'Loại phải là "kinh" hoặc "phap_bao".');
  }

  const tieuDe = String(input.tieu_de ?? '').trim();
  if (!tieuDe || tieuDe.length > 255) {
    throw new ServerInputError(400, 'invalid_title', 'Tên kinh/pháp bảo không được để trống.');
  }

  const linkShopee = String(input.link_shopee ?? '').trim();
  if (!linkShopee || linkShopee.length > 2000) {
    throw new ServerInputError(400, 'invalid_shopee_link', 'Link Shopee không hợp lệ.');
  }

  const moTa = String(input.mo_ta ?? '').trim();
  const anhUrl = String(input.anh_url ?? '').trim();
  const conHang = input.con_hang === 0 || input.con_hang === false ? 0 : 1;
  const soThuTu = Number.isFinite(Number(input.so_thu_tu)) ? Number(input.so_thu_tu) : 0;

  const id = `pb_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO phap_bao_items (id, loai, tieu_de, mo_ta, anh_url, link_shopee, con_hang, so_thu_tu, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, loai, tieuDe, moTa, anhUrl, linkShopee, conHang, soThuTu, now, now).run();

  return {
    id,
    loai: loai as 'kinh' | 'phap_bao',
    tieu_de: tieuDe,
    mo_ta: moTa,
    anh_url: anhUrl,
    link_shopee: linkShopee,
    con_hang: conHang,
    so_thu_tu: soThuTu,
    created_at: now,
    updated_at: now
  };
}

export async function updatePhapBaoItem(
  env: CloudflareEnvLike,
  id: string,
  input: {
    loai?: unknown;
    tieu_de?: unknown;
    mo_ta?: unknown;
    anh_url?: unknown;
    link_shopee?: unknown;
    con_hang?: unknown;
    so_thu_tu?: unknown;
  }
): Promise<PhapBaoItemRecord> {
  const existing = await env.DB.prepare('SELECT id FROM phap_bao_items WHERE id = ?').bind(id).first();
  if (!existing) {
    throw new ServerInputError(404, 'item_not_found', 'Không tìm thấy kinh/pháp bảo cần sửa.');
  }

  const loai = String(input.loai ?? '').trim();
  if (loai !== 'kinh' && loai !== 'phap_bao') {
    throw new ServerInputError(400, 'invalid_loai', 'Loại phải là "kinh" hoặc "phap_bao".');
  }

  const tieuDe = String(input.tieu_de ?? '').trim();
  if (!tieuDe || tieuDe.length > 255) {
    throw new ServerInputError(400, 'invalid_title', 'Tên kinh/pháp bảo không được để trống.');
  }

  const linkShopee = String(input.link_shopee ?? '').trim();
  if (!linkShopee || linkShopee.length > 2000) {
    throw new ServerInputError(400, 'invalid_shopee_link', 'Link Shopee không hợp lệ.');
  }

  const moTa = String(input.mo_ta ?? '').trim();
  const anhUrl = String(input.anh_url ?? '').trim();
  const conHang = input.con_hang === 0 || input.con_hang === false ? 0 : 1;
  const soThuTu = Number.isFinite(Number(input.so_thu_tu)) ? Number(input.so_thu_tu) : 0;
  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE phap_bao_items
    SET loai = ?, tieu_de = ?, mo_ta = ?, anh_url = ?, link_shopee = ?, con_hang = ?, so_thu_tu = ?, updated_at = ?
    WHERE id = ?
  `).bind(loai, tieuDe, moTa, anhUrl, linkShopee, conHang, soThuTu, now, id).run();

  return {
    id,
    loai: loai as 'kinh' | 'phap_bao',
    tieu_de: tieuDe,
    mo_ta: moTa,
    anh_url: anhUrl,
    link_shopee: linkShopee,
    con_hang: conHang,
    so_thu_tu: soThuTu,
    created_at: '',
    updated_at: now
  };
}

export async function deletePhapBaoItem(env: CloudflareEnvLike, id: string): Promise<void> {
  const result = await env.DB.prepare('DELETE FROM phap_bao_items WHERE id = ?').bind(id).run();
  if (result.meta?.changes === 0) {
    throw new ServerInputError(404, 'item_not_found', 'Không tìm thấy kinh/pháp bảo cần xóa.');
  }
}

export async function recordPhapBaoClaim(
  env: CloudflareEnvLike,
  userId: string,
  input: {
    itemId?: unknown;
    itemTitle?: unknown;
    itemLoai?: unknown;
    danhHieu?: unknown;
    shopeeUrl?: unknown;
  }
): Promise<PhapBaoHistoryRecord> {
  const itemId = typeof input.itemId === 'string' && input.itemId ? input.itemId : null;
  const itemTitle = String(input.itemTitle ?? 'Kinh / Pháp Bảo').trim().slice(0, 255);
  const itemLoai = String(input.itemLoai ?? 'kinh').trim().slice(0, 32);
  const danhHieu = String(input.danhHieu ?? 'NAM MÔ ĐỊA TẠNG BỒ TÁT').trim().slice(0, 255);
  const shopeeUrl = String(input.shopeeUrl ?? '').trim().slice(0, 2000);

  const id = `claim_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO phap_bao_history (id, user_id, item_id, item_title, item_loai, danh_hieu, shopee_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, itemId, itemTitle, itemLoai, danhHieu, shopeeUrl, now).run();

  return {
    id,
    user_id: userId,
    item_id: itemId,
    item_title: itemTitle,
    item_loai: itemLoai,
    danh_hieu: danhHieu,
    shopee_url: shopeeUrl,
    created_at: now
  };
}

export async function getUserPhapBaoHistory(
  env: CloudflareEnvLike,
  userId: string
): Promise<PhapBaoHistoryRecord[]> {
  const result = await env.DB.prepare(`
    SELECT id, user_id, item_id, item_title, item_loai, danh_hieu, shopee_url, created_at
    FROM phap_bao_history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(userId).all<PhapBaoHistoryRecord>();

  return result.results ?? [];
}

export async function updateCampaignShopeeLink(
  env: CloudflareEnvLike,
  linkShopee: string
): Promise<{ linkShopee: string }> {
  let cleanLink = linkShopee.trim();
  if (!cleanLink || cleanLink.length > 2000) {
    throw new ServerInputError(400, 'invalid_shopee_link', 'Link Shopee không hợp lệ.');
  }

  // Tự động thêm https:// nếu người dùng dán link dạng shopee.vn/...
  if (!cleanLink.startsWith('http://') && !cleanLink.startsWith('https://')) {
    cleanLink = `https://${cleanLink}`;
  }

  // Basic URL format validation
  try {
    const url = new URL(cleanLink);
    if (!url.protocol.startsWith('http')) {
      throw new Error();
    }
  } catch {
    throw new ServerInputError(400, 'invalid_url', 'Đường dẫn không hợp lệ. Vui lòng nhập link Shopee đúng định dạng.');
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE phap_bao_items
    SET link_shopee = ?, updated_at = ?
  `).bind(cleanLink, now).run();

  if ((result.meta?.changes ?? 0) === 0) {
    const id = `pb_${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO phap_bao_items (id, loai, tieu_de, mo_ta, anh_url, link_shopee, con_hang, so_thu_tu, created_at, updated_at)
      VALUES (?, 'kinh', 'Ấn Phẩm Kinh & Pháp Bảo (Phí sàn 5.000đ · Quà tặng miễn phí)', '', '', ?, 1, 1, ?, ?)
    `).bind(id, cleanLink, now, now).run();
  }

  return { linkShopee: cleanLink };
}

