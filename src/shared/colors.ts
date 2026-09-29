// Course colours from UCalgary's brand palette (ucalgary.ca/brand): red,
// then secondary colours, then accents. `text` / `textDark` are darker or
// lighter shades of the same hue so course codes stay readable (4.5:1) on
// light and dark backgrounds.

export interface CourseColor {
  bar: string;
  text: string;
  textDark: string;
}

const PALETTE: CourseColor[] = [
  { bar: "#D6001C", text: "#C00019", textDark: "#FF6B7A" }, // Red
  { bar: "#FF671F", text: "#B8470F", textDark: "#FF9A66" }, // Dark Orange
  { bar: "#9C0534", text: "#9C0534", textDark: "#F07A9C" }, // Berry
  { bar: "#47A67C", text: "#2A7552", textDark: "#6FCB9F" }, // Teal (accent)
  { bar: "#ED0A72", text: "#B8085A", textDark: "#FF6FAE" }, // Rubine
  { bar: "#FFA300", text: "#8F5600", textDark: "#FFC04D" }, // Light Orange
  { bar: "#6C3302", text: "#6C3302", textDark: "#D3AC8B" }, // Brown / Taupe (accents)
];

// Colours follow the order the student picked courses in, so they're stable
// between syncs.
export function courseColor(courseId: number, selected: number[]): CourseColor {
  const i = selected.indexOf(courseId);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}
