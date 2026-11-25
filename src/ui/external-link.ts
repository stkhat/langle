/**
 * A link that opens in a new tab (another site, or another Langle page): the new page
 * gets no handle on this one (`noopener`) and is not told where it was opened from
 * (`noreferrer`: no address of the page, video or Langle page the link was on).
 * Spread on the `<a>`: `<a href={url} {...NEW_TAB}>`.
 */
export const NEW_TAB = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
