/** Downloads `text` as a file of media type `type` through a Blob URL (needs no permission). */
export function download(
  fileName: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Firefox reads the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
