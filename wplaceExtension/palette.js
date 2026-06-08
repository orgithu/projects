export const PALETTE = [
  { id: 1, name: 'Black', rgb: [0, 0, 0] },
  { id: 2, name: 'Dark Gray', rgb: [60, 60, 60] },
  { id: 3, name: 'Gray', rgb: [120, 120, 120] },
  { id: 4, name: 'Light Gray', rgb: [210, 210, 210] },
  { id: 5, name: 'White', rgb: [255, 255, 255] },
  { id: 6, name: 'Dark Red', rgb: [96, 0, 24] },
  { id: 7, name: 'Red', rgb: [237, 28, 36] },
  { id: 8, name: 'Orange', rgb: [255, 127, 39] },
  { id: 9, name: 'Dark Orange', rgb: [246, 170, 9] },
  { id: 10, name: 'Yellow', rgb: [249, 221, 59] },
  { id: 11, name: 'Light Yellow', rgb: [255, 250, 188] },
  { id: 12, name: 'Green', rgb: [14, 185, 104] },
  { id: 13, name: 'Light Green', rgb: [19, 230, 123] },
  { id: 14, name: 'Bright Green', rgb: [135, 255, 94] },
  { id: 15, name: 'Teal', rgb: [12, 129, 110] },
  { id: 16, name: 'Cyan', rgb: [16, 174, 166] },
  { id: 17, name: 'Light Cyan', rgb: [19, 225, 190] },
  { id: 18, name: 'Dark Blue', rgb: [40, 80, 158] },
  { id: 19, name: 'Blue', rgb: [64, 147, 228] },
  { id: 20, name: 'Light Blue', rgb: [96, 247, 242] },
  { id: 21, name: 'Purple', rgb: [107, 80, 246] },
  { id: 22, name: 'Light Purple', rgb: [153, 177, 251] },
  { id: 23, name: 'Dark Purple', rgb: [120, 12, 153] },
  { id: 24, name: 'Magenta', rgb: [170, 56, 185] },
  { id: 25, name: 'Light Magenta', rgb: [224, 159, 249] },
  { id: 26, name: 'Dark Pink', rgb: [203, 0, 122] },
  { id: 27, name: 'Pink', rgb: [236, 31, 128] },
  { id: 28, name: 'Light Pink', rgb: [243, 141, 169] },
  { id: 29, name: 'Brown', rgb: [104, 70, 52] },
  { id: 30, name: 'Dark Brown', rgb: [149, 104, 42] },
  { id: 31, name: 'Tan', rgb: [248, 178, 119] },
  { id: 32, name: 'Medium Gray', rgb: [170, 170, 170] },
  { id: 33, name: 'Maroon', rgb: [165, 14, 30] },
  { id: 34, name: 'Salmon', rgb: [250, 128, 114] },
  { id: 35, name: 'Red Orange', rgb: [228, 92, 26] },
  { id: 36, name: 'Beige', rgb: [214, 181, 148] },
  { id: 37, name: 'Olive', rgb: [156, 132, 49] },
  { id: 38, name: 'Yellow Green', rgb: [197, 173, 49] },
  { id: 39, name: 'Pale Yellow', rgb: [232, 212, 95] },
  { id: 40, name: 'Forest Green', rgb: [74, 107, 58] },
  { id: 41, name: 'Moss Green', rgb: [90, 148, 74] },
  { id: 42, name: 'Mint Green', rgb: [132, 197, 115] },
  { id: 43, name: 'Steel Blue', rgb: [15, 121, 159] },
  { id: 44, name: 'Aqua', rgb: [187, 250, 242] },
  { id: 45, name: 'Sky Blue', rgb: [125, 199, 255] },
  { id: 46, name: 'Indigo', rgb: [77, 49, 184] },
  { id: 47, name: 'Navy Blue', rgb: [74, 66, 132] },
  { id: 48, name: 'Slate Blue', rgb: [122, 113, 196] },
  { id: 49, name: 'Periwinkle', rgb: [181, 174, 241] },
  { id: 50, name: 'Peach', rgb: [219, 164, 99] },
  { id: 51, name: 'Bronze', rgb: [209, 128, 81] },
  { id: 52, name: 'Light Peach', rgb: [255, 197, 165] },
  { id: 53, name: 'Rust', rgb: [155, 82, 73] },
  { id: 54, name: 'Rose', rgb: [209, 128, 120] },
  { id: 55, name: 'Blush', rgb: [250, 182, 164] },
  { id: 56, name: 'Coffee', rgb: [123, 99, 82] },
  { id: 57, name: 'Taupe', rgb: [156, 132, 107] },
  { id: 58, name: 'Charcoal', rgb: [51, 57, 65] },
  { id: 59, name: 'Slate', rgb: [109, 117, 141] },
  { id: 60, name: 'Lavender', rgb: [179, 185, 209] },
  { id: 61, name: 'Khaki', rgb: [109, 100, 63] },
  { id: 62, name: 'Sand', rgb: [148, 140, 107] },
  { id: 63, name: 'Cream', rgb: [205, 197, 158] },
];

export const PALETTE_BY_ID = new Map(PALETTE.map((entry) => [entry.id, entry]));

export const TRANSPARENT_ID = 0;
export const SENTINEL_ID = -1;

export const rgbString = (rgb) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

export const colorCssById = (id) => {
  if (id === SENTINEL_ID) return 'rgb(158, 189, 255)';
  if (id === TRANSPARENT_ID) return null;
  const entry = PALETTE_BY_ID.get(id);
  return entry ? rgbString(entry.rgb) : 'rgb(140, 140, 140)';
};
