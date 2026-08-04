export async function getDb() {
  const { db } = await import("@/db/index.server");
  return db;
}

export async function getAuth() {
  const { auth } = await import("@/lib/auth.server");
  return auth;
}

export async function getServerRequest() {
  const { getRequest } = await import("@tanstack/react-start/server");
  return getRequest();
}

export async function getFileStorage() {
  const { fileStorage } = await import("@/lib/storage.server");
  return fileStorage;
}

export async function getDataUrlHelpers() {
  return await import("@/lib/dataUrl.server");
}

export async function getClinicalHtmlHelpers() {
  return await import("@/lib/clinical-html.server");
}

export async function getPdfGenerateHelpers() {
  return await import("@/lib/pdf-generate.server");
}
