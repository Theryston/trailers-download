import puppeteer from 'puppeteer';
import normalizeText from '../../utils/normalizeText.js';
import loading from 'loading-cli';
import { prompt, print } from 'gluegun';
import downloadFromPlaylist from './downloadFromPlaylist.js';
import slug from 'slug';
import path from 'node:path';
import fs from 'node:fs';

const load = loading({
	color: 'yellow',
});

export default async function appleTv({ name, year, language, outPath }) {
	load.start('[Apple TV] Opening browser');
	const browser = await puppeteer.launch({
		headless: 'new',
	});
	const page = await browser.newPage();
	load.succeed('[Apple TV] Browser opened');

	try {
		load.start('[Apple TV] Searching for Apple Tv page on Google');
		await page.goto(
			`https://google.com/search?q=${name} ${year} ${language} site:https://tv.apple.com`
		);
		load.succeed('[Apple TV] Google search finished');

		load.start('[Apple TV] Getting the results');
		const googleResults = await page.evaluate(() => {
			const anchors = Array.from(document.querySelectorAll('a'));
			const results = anchors.map((anchor) => {
				const hrefParts = anchor.href.split('/');
				return {
					href: anchor.href,
					text: hrefParts[hrefParts.length - 2],
				};
			});
			return results.filter((result) =>
				result.href.startsWith('https://tv.apple.com')
			);
		});

		let program = googleResults.find((result) => {
			const normalizedText = normalizeText(result.text);
			const normalizedName = normalizeText(name);
			return normalizedText === normalizedName;
		});

		let ignoreConfirmation = false;
		if (!program) {
			load.fail('[Apple TV] Apple Tv page not found');

			const { customPage } = await prompt.ask({
				type: 'input',
				name: 'customPage',
				message: 'Page not found, enter a custom:',
			});

			if (!customPage || !customPage.length || !customPage.startsWith('http')) {
				browser.close();
				print.info('[Apple TV] Please, try again with the correct page');
				return false;
			}

			program = {
				href: customPage,
				text: 'Custom page',
			};

			ignoreConfirmation = true;
		}

		if (!ignoreConfirmation) {
			load.succeed(`[Apple TV] Apple TV page found: ${program.href}`);

			const confirmedPage = await prompt.confirm(
				'[Apple TV] Is this the correct page?'
			);

			if (!confirmedPage) {
				const { customPage } = await prompt.ask({
					type: 'input',
					name: 'customPage',
					message: 'Enter the correct page:',
				});

				if (
					!customPage ||
					!customPage.length ||
					!customPage.startsWith('http')
				) {
					browser.close();
					print.info('[Apple TV] Please, try again with the correct page');
					return false;
				}

				program.href = customPage;
			}
		}

		load.start('[Apple TV] Opening the Apple TV page');
		await page.goto(program.href);
		load.succeed('[Apple TV] Apple TV page opened');

		load.start('[Apple TV] Verifying if has trailers');

		await new Promise((resolve) => setTimeout(resolve, 5000));

		try {
			await page.waitForSelector('#uts-col-Trailers', {
				timeout: 10000,
			});
		} catch (error) {
			browser.close();
			load.info('[Apple TV] Trailer not found. Try use another language');
			load.stop();
			return false;
		}

		let trailersSection = await page.$('#uts-col-Trailers');

		if (!trailersSection) {
			browser.close();
			load.info('[Apple TV] Trailer not found. Try use another language');
			load.stop();
			return false;
		}

		let ul = await trailersSection.$('ul');
		let arrayLi = await ul.$$('li');

		if (!arrayLi.length) {
			browser.close();
			load.info('[Apple TV] Trailer not found. Try use another language');
			load.stop();
			return false;
		}

		load.succeed(`[Apple TV] ${arrayLi.length} trailers found`);

		for (let i = 0; i < arrayLi.length; i++) {
			load.start(`[Apple TV] Opening trailer ${i + 1}`);
			await new Promise((resolve) => setTimeout(resolve, 5000));
			await page.waitForSelector('#uts-col-Trailers');
			trailersSection = await page.$('#uts-col-Trailers');

			ul = await trailersSection.$('ul');
			arrayLi = await ul.$$('li');

			await page.evaluate(() => {
				const trailersSection = document.querySelector('#uts-col-Trailers');
				trailersSection.scrollIntoView();
			});

			const button = await arrayLi[i].$('button');
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

				page.on('response', async (response) => {
					const url = response.url();

					if (url.includes('playlist.m3u8') && timeoutResolve > 0) {
						resolve(url);
					}
				});
			});

			if (!playlist) {
				browser.close();
				load.fail('[Apple TV] None video found');
				return false;
			}

			let videoTitle = await arrayLi[i].$('.typography-title-3.text-truncate');
			videoTitle = await videoTitle.evaluate((el) => el.textContent);
			let resultVideoPath = path.join(
				outPath,
				`${slug(videoTitle) || `trailer-${i + 1}`}.mp4`
			);

			if (fs.existsSync(resultVideoPath)) {
				resultVideoPath = path.join(
					outPath,
					`${slug(videoTitle) + `-${i + 1}` || `trailer-${i + 1}`}.mp4`
				);
			}

			load.succeed(`[Apple TV] Videos url of trailer ${i + 1} found`);

			await downloadFromPlaylist({
				playlist,
				resultVideoPath,
				videoNumber: i + 1,
			});

			load.succeed(`[Apple TV] Trailer ${i + 1} downloaded`);

			await page.reload();
		}

		await browser.close();
		load.succeed('[Apple TV] All trailers downloaded');
		return true;
	} catch (error) {
		browser.close();
		load.fail('[Apple TV] Something went wrong');
		console.error(error);
		return false;
	}
}
