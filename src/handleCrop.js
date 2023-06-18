import fs from "node:fs";

export default async function handleCrop({ aspectRadios, outPath }) {
  const allVideos = fs.readdirSync(outPath).filter((file) => {
    const fileExtension = file.split(".").pop();
    return fileExtension === "mp4";
  });
}
