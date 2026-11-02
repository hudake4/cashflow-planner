/** Saves a blob through a temporary download link. */
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has handed the file to the browser.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
