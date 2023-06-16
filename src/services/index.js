import appleTv from "./appleTv/index.js";
import netflix from "./netflix/index.js";

export default function getServices() {
  return [
    {
      name: "Apple TV",
      func: appleTv,
    },
    {
      name: "Netflix",
      func: netflix,
    },
  ];
}
