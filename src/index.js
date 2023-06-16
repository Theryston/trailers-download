import { print } from "gluegun";
import path from "path";
import getServices from "./services/index.js";
import collectParams from "./terminal/collectParams.js";
import slug from "slug";
import fs from "node:fs";

print.info("Welcome to the Trailers Download");
const parameters = await collectParams();

const trailersPath = path.join(process.cwd(), "trailers");

if (!fs.existsSync(trailersPath)) {
  fs.mkdirSync(trailersPath);
}

const outPath = path.join(
  trailersPath,
  slug(`${parameters.name} ${parameters.year}`)
);

if (!fs.existsSync(outPath)) {
  fs.mkdirSync(outPath);
} else {
  fs.rmSync(outPath, { recursive: true });
  fs.mkdirSync(outPath);
}

let services = getServices();

if (parameters.service !== "All") {
  services = services.filter((service) => service.name === parameters.service);
}

for (const service of services) {
  print.info(`Trying to find the trailer on ${service.name}`);
  const hasFound = await service.func({ ...parameters, outPath });

  if (hasFound) {
    break;
  }
}
