import puppeteer from "puppeteer";
import loading from "loading-cli";
import { prompt, print } from "gluegun";
import normalizeText from "../../utils/normalizeText.js";
import downloadFile from "../../utils/downloadFile.js";
import getTotalVideoFrames from "../../utils/getTotalVideoFrames.js";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import fs from "node:fs";
import path from "node:path";
import slug from "slug";

const load = loading({
  color: "yellow",
});

export default async function netflix({ name, year, language, outPath }) {
  load.start("[Netflix] Opening browser");
  const browser = await puppeteer.launch({
    headless: "new",
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.5005.124 Safari/537.36 Edg/102.0.1245.44"
  );
  load.succeed("[Netflix] Browser opened");

  try {
    load.start("[Netflix] Searching for Netflix page on Google");
    await page.goto(
      `https://google.com/search?q=${name} ${year} ${language} site:https://www.netflix.com`
    );
    load.succeed("[Netflix] Google search finished");

    load.start("[Netflix] Getting the results");
    const googleResults = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a"));
      const results = anchors.map((anchor) => {
        return {
          href: anchor.href,
          text: anchor.text.split("|")[0].trim().replace("Assistir ", ""),
        };
      });
      return results.filter((result) =>
        result.href.startsWith("https://www.netflix.com")
      );
    });

    const program = googleResults.find((result) => {
      const normalizedText = normalizeText(result.text);
      const normalizedName = normalizeText(name);
      return normalizedText === normalizedName;
    });

    if (!program) {
      browser.close();
      load.info("[Netflix] Netflix page not found");
      return false;
    }

    load.succeed(`[Netflix] Netflix page found: ${program.href}`);

    const confirmedPage = await prompt.confirm(
      "[Netflix] Is this the correct page?"
    );

    if (!confirmedPage) {
      browser.close();
      print.info("[Netflix] Please, try again with the correct name and year");
      return false;
    }

    load.start("[Netflix] Opening the Netflix page");
    await page.goto(program.href);
    load.succeed("[Netflix] Netflix page opened");

    load.start("[Netflix] Verifying if has trailers");

    try {
      await page.waitForSelector(".nmtitle-section.section-additional-videos", {
        timeout: 10000,
      });
    } catch (error) {
      browser.close();
      load.info("[Netflix] Trailer not found. Try use another language");
      load.stop();
      return false;
    }

    let trailersSection = await page.$(
      ".nmtitle-section.section-additional-videos"
    );

    if (!trailersSection) {
      browser.close();
      load.info("[Netflix] Trailer not found. Try use another language");
      load.stop();
      return false;
    }

    load.succeed("[Netflix] Trailer found");

    let ul = await trailersSection.$("ul");
    let arrayLi = await ul.$$("li");

    for (let i = 0; i < arrayLi.length; i++) {
      load.start(`[Netflix] Opening trailer ${i + 1}`);
      trailersSection = await page.$(
        ".nmtitle-section.section-additional-videos"
      );

      ul = await trailersSection.$("ul");
      arrayLi = await ul.$$("li");

      await page.evaluate(() => {
        const trailersSection = document.querySelector(
          ".nmtitle-section.section-additional-videos"
        );
        trailersSection.scrollIntoView();
      });

      let videoTitle = await arrayLi[i].$(".additional-video-title");
      videoTitle = await videoTitle.evaluate((el) => el.textContent);

      const button = await arrayLi[i].$("button");
      await button.click();

      load.succeed(`[Netflix] Trailer ${i + 1} opened`);

      load.start(`[Netflix] Waiting for trailer ${i + 1} to load`);
      const response = await page.waitForResponse(
        (response) =>
          response.url().indexOf("https://www.netflix.com/playapi") !== -1,
        {
          timeout: 10000,
        }
      );

      const body = await response.json();
      const audioUrl = body.result.audio_tracks[0].streams[0].urls[0].url;
      const videoMaxCroppedWidth = body.result.video_tracks[0].maxCroppedWidth;
      const videoUrl = body.result.video_tracks[0].streams.find(
        (stream) => stream.crop_w === videoMaxCroppedWidth
      ).urls[0].url;

      load.succeed(`[Netflix] Trailer ${i + 1} loaded`);

      const tempDir = path.join(process.cwd(), "temp");

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }

      const videoTempPath = path.join(tempDir, `${Date.now()}-video.mp4`);
      const audioTempPath = path.join(tempDir, `${Date.now()}-audio.mp4`);

      load.start(`[Netflix] Downloading video of trailer ${i + 1}`);
      await downloadFile(videoUrl, videoTempPath);
      load.succeed(`[Netflix] Video of trailer ${i + 1} downloaded`);

      load.start(`[Netflix] Downloading audio of trailer ${i + 1}`);
      await downloadFile(audioUrl, audioTempPath);
      load.succeed(`[Netflix] Audio of trailer ${i + 1} downloaded`);

      load.start(`[Netflix] Merging audio and video of trailer ${i + 1}`);
      const videoFrames = await getTotalVideoFrames(videoTempPath);

      const resultVideoPath = path.join(outPath, `${slug(videoTitle)}.mp4`);
      const ffmpegCommand = `${ffmpegPath} -i ${videoTempPath} -i ${audioTempPath} -c:v copy -c:a aac -strict experimental ${resultVideoPath}`;
      const ffmpegProcess = spawn(ffmpegCommand, { shell: true });

      ffmpegProcess.stderr.on("data", (data) => {
        const logString = data.toString().trim();

        if (!logString.startsWith("frame=")) {
          return;
        }

        const frame = parseInt(logString.split("=")[1].split(" ")[1] || "0");
        const percentage = Math.round((frame / videoFrames) * 100);
        load.text = `[Netflix] Merging audio and video of trailer ${
          i + 1
        } - ${percentage}%`;
      });

      await new Promise((resolve, reject) => {
        ffmpegProcess.on("close", (code) => {
          if (code === 0) {
            resolve();
          }
          reject();
        });
      });

      load.succeed(`[Netflix] Audio and video of trailer ${i + 1} merged`);

      load.start(`[Netflix] Deleting temp files of trailer ${i + 1}`);
      fs.unlinkSync(videoTempPath);
      fs.unlinkSync(audioTempPath);
      load.succeed(`[Netflix] Temp files of trailer ${i + 1} deleted`);

      load.succeed(`[Netflix] Trailer ${i + 1} downloaded`);
      await page.reload();
    }

    browser.close();
    load.succeed("[Netflix] All trailers downloaded");
    return true;
  } catch (error) {
    browser.close();
    load.fail("[Netflix] Something went wrong");
    console.error(error);
    return false;
  }
}
