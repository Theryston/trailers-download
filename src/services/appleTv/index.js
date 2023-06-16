import puppeteer from "puppeteer";
import normalizeText from "../../utils/normalizeText.js";
import loading from "loading-cli";
import { prompt, print } from "gluegun";
import downloadFromPlaylist from "./downloadFromPlaylist.js";

const load = loading({
  color: "yellow",
});

export default async function appleTv({ name, year, language, outPath }) {
  load.start("[Apple TV] Opening browser");
  const browser = await puppeteer.launch({
    headless: "new",
  });
  const page = await browser.newPage();
  load.succeed("[Apple TV] Browser opened");

  try {
    load.start("[Apple TV] Searching for Apple Tv page on Google");
    await page.goto(
      `https://google.com/search?q=${name} ${year} ${language} site:https://tv.apple.com`
    );
    load.succeed("[Apple TV] Google search finished");

    load.start("[Apple TV] Getting the results");
    const googleResults = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a"));
      const results = anchors.map((anchor) => {
        return {
          href: anchor.href,
          text: anchor.text.split("|")[0].trim().replace("Assistir ", ""),
        };
      });
      return results.filter((result) =>
        result.href.startsWith("https://tv.apple.com")
      );
    });

    const program = googleResults.find((result) => {
      const normalizedText = normalizeText(result.text);
      const normalizedName = normalizeText(name);
      return normalizedText === normalizedName;
    });

    if (!program) {
      browser.close();
      load.info("[Apple TV] Apple TV page not found");
      return false;
    }

    load.succeed(`[Apple TV] Apple TV page found: ${program.href}`);

    const confirmedPage = await prompt.confirm(
      "[Apple TV] Is this the correct page?"
    );

    if (!confirmedPage) {
      browser.close();
      print.info("[Apple TV] Please, try again with the correct name and year");
      return false;
    }

    load.start("[Apple TV] Opening the Apple TV page");
    await page.goto(program.href);
    load.succeed("[Apple TV] Apple TV page opened");

    load.start("[Apple TV] Verifying if has trailers");

    await new Promise((resolve) => setTimeout(resolve, 5000));

    try {
      await page.waitForSelector("#uts-col-Trailers", {
        timeout: 10000,
      });
    } catch (error) {
      browser.close();
      load.info("[Apple TV] Trailer not found. Try use another language");
      load.stop();
      return false;
    }

    let trailersSection = await page.$("#uts-col-Trailers");

    if (!trailersSection) {
      browser.close();
      load.info("[Apple TV] Trailer not found. Try use another language");
      load.stop();
      return false;
    }

    load.succeed("[Apple TV] Trailer found");

    let ul = await trailersSection.$("ul");
    let arrayLi = await ul.$$("li");

    for (let i = 0; i < arrayLi.length; i++) {
      load.start(`[Apple TV] Opening trailer ${i + 1}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await page.waitForSelector("#uts-col-Trailers");
      trailersSection = await page.$("#uts-col-Trailers");

      ul = await trailersSection.$("ul");
      arrayLi = await ul.$$("li");

      await page.evaluate(() => {
        const trailersSection = document.querySelector("#uts-col-Trailers");
        trailersSection.scrollIntoView();
      });

      const button = await arrayLi[i].$("button");
      await button.click();

      load.succeed(`[Apple TV] Trailer ${i + 1} opened`);

      load.start(`[Apple TV] Getting the videos url of trailer ${i + 1}`);

      let timeoutResolve = 10000;
      const playlist = await new Promise((resolve) => {
        const interval = setInterval(() => {
          timeoutResolve -= 1000;

          if (timeoutResolve === 0) {
            clearInterval(interval);
            resolve(false);
          }
        }, 1000);

        page.on("response", async (response) => {
          const url = response.url();

          if (url.includes("playlist.m3u8") && timeoutResolve > 0) {
            resolve(url);
          }
        });
      });

      if (!playlist) {
        browser.close();
        load.fail("[Apple TV] None video found");
        return false;
      }

      load.succeed(`[Apple TV] Videos url of trailer ${i + 1} found`);

      await downloadFromPlaylist({ playlist, outPath, videoNumber: i + 1 });

      load.succeed(`[Apple TV] Trailer ${i + 1} downloaded`);

      await page.reload();
    }

    await browser.close();
    load.succeed("[Apple TV] Browser closed");
    return true;
  } catch (error) {
    browser.close();
    load.fail("[Apple TV] Something went wrong");
    console.error(error);
    return false;
  }
}
