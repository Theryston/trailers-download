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

    let program = googleResults.find((result) => {
      const normalizedText = normalizeText(result.text);
      const normalizedName = normalizeText(name);
      return normalizedText === normalizedName;
    });

    let ignoreConfirmation = false;
    if (!program) {
      load.fail("[Netflix] Netflix page not found");

      const { customPage } = await prompt.ask({
        type: "input",
        name: "customPage",
        message: "Page not found, enter a custom:",
      });

      if (!customPage || !customPage.length || !customPage.startsWith("http")) {
        browser.close();
        print.info("[Netflix] Please, try again with the correct page");
        return false;
      }

      program = {
        href: customPage,
        text: "Custom page",
      };

      ignoreConfirmation = true;
    }

    if (!ignoreConfirmation) {
      load.succeed(`[Netflix] Netflix page found: ${program.href}`);

      const confirmedPage = await prompt.confirm(
        "[Netflix] Is this the correct page?"
      );

      if (!confirmedPage) {
        const { customPage } = await prompt.ask({
          type: "input",
          name: "customPage",
          message: "Enter the correct page:",
        });

        if (
          !customPage ||
          !customPage.length ||
          !customPage.startsWith("http")
        ) {
          browser.close();
          print.info("[Netflix] Please, try again with the correct page");
          return false;
        }

        program.href = customPage;
      }
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

    let ul = await trailersSection.$("ul");
    let arrayLi = await ul.$$("li");
    const liOrder = [];

    for (let i = 0; i < arrayLi.length; i++) {
      let videoTitle = await arrayLi[i].$(".additional-video-title");
      videoTitle = await videoTitle.evaluate((el) => el.textContent);
      liOrder.push({
        videoTitle,
        index: i,
      });
    }

    if (!arrayLi.length) {
      browser.close();
      load.info("[Netflix] Trailer not found. Try use another language");
      load.stop();
      return false;
    }

    load.succeed(`[Netflix] ${arrayLi.length} trailers found`);

    load.start("[Netflix] Preparing requests observer");
    await page.setRequestInterception(true);

    page.on("request", (request) => {
      if (
        request.url().indexOf("https://www.netflix.com/playapi") !== -1 &&
        request.method() === "POST"
      ) {
        const body = JSON.parse(request.postData());
        const hasProfile = body.params.profiles.some(
          (profile) => profile === "playready-h264mpl40-dash"
        );

        if (hasProfile) {
          request.continue();
        } else {
          request.continue({
            postData: JSON.stringify({
              ...body,
              params: {
                ...body.params,
                profiles: [...body.params.profiles, "playready-h264mpl40-dash"],
              },
            }),
          });
        }
      } else {
        request.continue();
      }
    });
    load.succeed("[Netflix] Requests observer ready");

    for (let i = 0; i < arrayLi.length; i++) {
      load.start(`[Netflix] Opening trailer ${i + 1}`);
      trailersSection = await page.$(
        ".nmtitle-section.section-additional-videos"
      );

      ul = await trailersSection.$("ul");
      arrayLi = await ul.$$("li");

      for (let i = 0; i < arrayLi.length; i++) {
        let videoTitle = await arrayLi[i].$(".additional-video-title");
        videoTitle = await videoTitle.evaluate((el) => el.textContent);

        let correspondingOrder = liOrder.find(
          (order) => order.videoTitle === videoTitle
        );

        if (correspondingOrder) {
          arrayLi[i].orderIndex = correspondingOrder.index;
        }
      }

      arrayLi.sort((a, b) => a.orderIndex - b.orderIndex);

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
      const biggestVideo = body.result.video_tracks[0].streams.reduce(
        (prev, current) => {
          if (current.bitrate > prev.bitrate) {
            return current;
          }
          return prev;
        }
      );
      const videoUrl = biggestVideo.urls[0].url;

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

      let timeoutProcess = setTimeout(() => {
        ffmpegProcess.kill();
      }, 1000 * 60 * 5);

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

      try {
        await new Promise((resolve, reject) => {
          ffmpegProcess.on("close", (code) => {
            if (code === 0) {
              clearTimeout(timeoutProcess);
              resolve();
            }
            reject();
          });
        });

        load.succeed(`[Netflix] Audio and video of trailer ${i + 1} merged`);
      } catch (error) {
        load.fail(`[Netflix] Something went wrong with trailer ${i + 1}`);
      }

      load.start(`[Netflix] Deleting temp files of trailer ${i + 1}`);
      fs.unlinkSync(videoTempPath);
      fs.unlinkSync(audioTempPath);
      load.succeed(`[Netflix] Temp files of trailer ${i + 1} deleted`);

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
