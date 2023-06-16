import saveBlobFile from "./saveBlobFile.js";

export default async function downloadFile(url, path) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  await saveBlobFile(new Blob([buffer]), path);
}
