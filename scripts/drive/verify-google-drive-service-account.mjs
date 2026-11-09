import {
  createDriveAccessToken,
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  DRIVE_FOLDER_MIME_TYPE,
  listDriveChildren,
  loadServiceAccount,
} from './google-drive-service-account.js';

const rootFolderId = process.env.GOOGLE_DRIVE_AUDIO_ROOT_FOLDER_ID || DEFAULT_DRIVE_ROOT_FOLDER_ID;
const serviceAccount = loadServiceAccount(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE);
const accessToken = await createDriveAccessToken(serviceAccount);
const children = await listDriveChildren(accessToken, rootFolderId);
const folders = children.filter((item) => item.mimeType === DRIVE_FOLDER_MIME_TYPE);

console.log(JSON.stringify({
  ok: true,
  serviceAccount: serviceAccount.client_email,
  rootFolderId,
  directChildFolders: folders.length,
}));
