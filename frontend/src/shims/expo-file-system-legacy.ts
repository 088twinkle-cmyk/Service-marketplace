/**
 * Web shim for `expo-file-system/legacy`.
 *
 * Only the handful of helpers used for image uploads are implemented; on the
 * web the data is read from the object URL / FileReader API instead of the
 * device filesystem.
 */
export const EncodingType = {
  UTF8: "utf8",
  Base64: "base64",
} as const;

export const cacheDirectory = "";

export async function readAsStringAsync(
  uri: string,
  options?: { encoding?: string }
): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();

  if (options?.encoding === EncodingType.Base64) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(blob);
    });
  }

  return blob.text();
}

export async function copyAsync(options?: {
  from?: string;
  to?: string;
}): Promise<void> {
  // No filesystem on the web — the object URL is already usable.
  void options;
}

export async function deleteAsync(uri?: string): Promise<void> {
  // Nothing to delete on the web.
  void uri;
}

export async function getInfoAsync(uri: string) {
  return { exists: Boolean(uri), uri, isDirectory: false, size: 0 };
}

export default {
  EncodingType,
  cacheDirectory,
  readAsStringAsync,
  copyAsync,
  deleteAsync,
  getInfoAsync,
};
