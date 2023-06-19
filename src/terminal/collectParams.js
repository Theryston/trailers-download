import { prompt, print } from "gluegun";
import getServices from "../services/index.js";

export default async function collectParams() {
  print.info(
    "Please, enter the following parameters for we found the trailers"
  );

  const { type } = await prompt.ask({
    type: "select",
    name: "type",
    message: "You want to download trailers from movies or series?",
    choices: [
      {
        name: "movie",
        message: "Movie",
      },
      {
        name: "series",
        message: "Series",
      },
    ],
  });

  const { language } = await prompt.ask({
    type: "select",
    name: "language",
    message: "What language do you want?",
    choices: [
      {
        name: "original",
        message: "Native Language",
      },
      {
        name: "PT",
        message: "Portuguese",
      },
      {
        name: "BR",
        message: "Portuguese (Brazil)",
      },
      {
        name: "US",
        message: "English",
      },
      {
        name: "ES",
        message: "Spanish",
      },
    ],
  });

  const { name } = await prompt.ask({
    type: "input",
    name: "name",
    message: `What's the ${language} name of the ${type}?`,
  });

  const { year } = await prompt.ask({
    type: "input",
    name: "year",
    message: `What's the release year of the ${type}?`,
  });

  const services = getServices();
  const { service } = await prompt.ask({
    type: "select",
    name: "service",
    message: "What service do you want?",
    choices: ["All", ...services.map((service) => service.name)],
  });

  const { aspectRadios } = await prompt.ask({
    type: "multiselect",
    name: "aspectRadios",
    message: "What aspect radios do you want?",
    choices: [
      "1:1",
      "4:3",
      "5:4",
      "16:9",
      "21:9",
      "3:4",
      "4:5",
      "9:16",
      "9:21",
    ],
  });

  return {
    type,
    language,
    name,
    year,
    service,
    aspectRadios,
  };
}
