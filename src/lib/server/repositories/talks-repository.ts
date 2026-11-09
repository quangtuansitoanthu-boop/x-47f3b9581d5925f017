import type { CloudflareEnvLike } from '../cloudflare-context';

export interface DriveCatalogRow {
  drive_file_id: string;
  visibility: string;
}

export interface AlbumDownloadSizeRow {
  tieu_de: string;
  dien_gia: string | null;
  drive_file_id: string | null;
  byte_size: number | null;
}

export function createTalksRepository(env: CloudflareEnvLike) {
  return {
    async readAlbumDownloadSizes(albumId: string, rootFolderId: string, readPrivate: boolean): Promise<AlbumDownloadSizeRow[]> {
      const result = await env.DB.prepare(`
        SELECT talks.tieu_de, talks.dien_gia, files.drive_file_id, files.byte_size
        FROM phap_thoai AS talks
        LEFT JOIN phap_thoai_drive_sources AS sources
          ON sources.album_id = talks.id AND sources.drive_root_folder_id = ?
        LEFT JOIN phap_thoai_drive_files AS files
          ON files.album_id = talks.id AND files.drive_folder_id = sources.drive_folder_id
        WHERE talks.id = ? AND (talks.visibility = 'public' OR ? = 1)
        ORDER BY files.sort_order
        LIMIT 501
      `).bind(rootFolderId, albumId, readPrivate ? 1 : 0).all<AlbumDownloadSizeRow>();
      return result.results ?? [];
    },

    async findDriveCatalog(fileId: string, rootFolderId: string): Promise<DriveCatalogRow | null> {
      return env.DB.prepare(`
        SELECT files.drive_file_id, talks.visibility
        FROM phap_thoai_drive_files AS files
        INNER JOIN phap_thoai_drive_sources AS sources
          ON sources.drive_folder_id = files.drive_folder_id
          AND sources.album_id = files.album_id
        INNER JOIN phap_thoai AS talks ON talks.id = files.album_id
        WHERE files.drive_file_id = ? AND sources.drive_root_folder_id = ?
        LIMIT 1
      `).bind(fileId, rootFolderId).first<DriveCatalogRow>();
    },
  };
}
