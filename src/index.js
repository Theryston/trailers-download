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

let hasFound = false;
for (const service of services) {
  print.info(`Trying to find the trailer on ${service.name}`);
  hasFound = await service.func({ ...parameters, outPath });

  if (hasFound) {
    break;
  }
}

if (hasFound) {
  const tempDir = path.join(process.cwd(), "temp");
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }

  print.success("Trailers downloaded");
} else {
  if (fs.existsSync(outPath)) {
    fs.rmSync(outPath, { recursive: true });
  }

  print.error("Trailer not found");
}
