export default function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[^a-zA-Zs]/g, "")
    .toLowerCase();
}
