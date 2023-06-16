import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

export default async function getTotalVideoFrames(videoPath) {
  const command = `${ffmpegPath} -i ${videoPath} -map 0:v:0 -c copy -f null -`;
  const process = spawn(command, { shell: true });
  let totalFrames = 0;
  process.stderr.on("data", (data) => {
    const stderr = data.toString();
    const match = stderr.match(/frame=\s*(\d+)/);
    const frame = match ? parseInt(match[1]) : 0;
    totalFrames = frame;
  });

  await new Promise((resolve, reject) => {
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      }
      reject();
    });
  });

  return totalFrames;
}
