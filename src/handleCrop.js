import fs from "node:fs";
import loading from "loading-cli";
import path from "node:path";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobePathStatic from "ffprobe-static";
import getTotalVideoFrames from "./utils/getTotalVideoFrames.js";

const ffprobePath = ffprobePathStatic.path;

const load = loading({
  color: "yellow",
});

export default async function handleCrop({ aspectRadios, outPath }) {
  if (!aspectRadios.length) {
    return;
  }

  const allVideos = fs.readdirSync(outPath).filter((file) => {
    const fileExtension = file.split(".").pop();
    return fileExtension === "mp4";
  });

  for (const video of allVideos) {
    const videoName = video.split(".").shift();
    load.start(`[Crop] Handling information from ${videoName}`);
    const videoFolder = path.join(outPath, videoName);

    if (!fs.existsSync(videoFolder)) {
      fs.mkdirSync(videoFolder);
    }

    const originalVideoPath = path.join(videoFolder, "original.mp4");

    fs.renameSync(path.join(outPath, video), originalVideoPath);

    const videoHeight = await getVideoHeight(originalVideoPath);

    const videoTotalFrames = await getTotalVideoFrames(originalVideoPath);

    load.succeed(`[Crop] Information from ${videoName} handled`);

    for (const aspectRadio of aspectRadios) {
      load.start(`[Crop] Cropping ${videoName} to ${aspectRadio}`);
      const videoCropped = path.join(
        videoFolder,
        `${aspectRadio.replace(":", "-")}.mp4`
      );

      const firstNumber = parseInt(aspectRadio.split(":")[0]);
      const secondNumber = parseInt(aspectRadio.split(":")[1]);
      const newWidth = Math.round((videoHeight * firstNumber) / secondNumber);

      const command = `${ffmpegPath} -i "${originalVideoPath}" -filter:v "crop=${newWidth}:${videoHeight}" "${videoCropped}"`;

      const process = spawn(command, { shell: true });

      process.stderr.on("data", (data) => {
        const logString = data.toString().trim();

        if (!logString.startsWith("frame=")) {
          return;
        }

        const frame = parseInt(logString.split("=")[1].split(" ")[1] || "0");
        const percentage = Math.round((frame / videoTotalFrames) * 100);
        load.text = `[Crop] Cropping ${videoName} to ${aspectRadio} - ${percentage}%`;
      });

      await new Promise((resolve, reject) => {
        process.on("close", (code) => {
          if (code === 0) {
            resolve();
          }
          reject();
        });
      });

      load.succeed(`[Crop] ${videoName} cropped to ${aspectRadio}`);
    }
  }
}

async function getVideoHeight(videoPath) {
  const command = `${ffprobePath} -v error -select_streams v:0 -show_entries stream=height -of csv=s=x:p=0 "${videoPath}"`;

  return new Promise((resolve, reject) => {
    const process = spawn(command, { shell: true });
    process.stdout.on("data", (data) => {
      resolve(parseInt(data.toString().trim()));
    });
    process.stderr.on("data", (data) => {
      reject(data.toString());
    });
  });
}
