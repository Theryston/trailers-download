import fs from "node:fs";

export default async function saveBlobFile(blob, output) {
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(output, buffer);
}
