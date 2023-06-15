import appleTv from "./appleTv/index.js";

export default function getServices() {
  return [
    {
      name: "Apple TV",
      func: appleTv,
    },
  ];
}
