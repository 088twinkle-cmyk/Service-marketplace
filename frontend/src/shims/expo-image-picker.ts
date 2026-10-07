/**
 * Web shim for `expo-image-picker`.
 *
 * Uses a hidden <input type="file"> so the browser's native picker is used.
 * The returned asset mirrors the expo-image-picker shape
 * (`uri`, `fileName`, `mimeType`, `base64`, `width`, `height`).
 */
export type ImagePickerAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  base64?: string | null;
};

export type ImagePickerResult = {
  canceled: boolean;
  assets: ImagePickerAsset[] | null;
};

export type MediaType = "images" | "videos" | "livePhotos";

type Options = {
  mediaTypes?: MediaType | MediaType[];
  allowsEditing?: boolean;
  quality?: number;
  base64?: boolean;
  allowsMultipleSelection?: boolean;
  [key: string]: unknown;
};

function pickFile(accept: string, multiple: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.onchange = () => finish(input.files?.[0] ?? null);
    // If the dialog is dismissed we never get a change event; clean up lazily.
    window.addEventListener(
      "focus",
      () => setTimeout(() => finish(null), 1000),
      { once: true }
    );

    input.click();
  });
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export async function launchImageLibraryAsync(
  options: Options = {}
): Promise<ImagePickerResult> {
  const file = await pickFile("image/*", Boolean(options.allowsMultipleSelection));
  if (!file) return { canceled: true, assets: null };

  const asset: ImagePickerAsset = {
    uri: URL.createObjectURL(file),
    fileName: file.name,
    mimeType: file.type || "image/jpeg",
    fileSize: file.size,
  };

  if (options.base64) {
    asset.base64 = await toBase64(file);
  }

  return { canceled: false, assets: [asset] };
}

export const launchCameraAsync = launchImageLibraryAsync;

export async function requestMediaLibraryPermissionsAsync() {
  return { status: "granted" as const, granted: true };
}

export async function requestCameraPermissionsAsync() {
  return { status: "granted" as const, granted: true };
}

export const MediaTypeOptions = {
  All: "images",
  Images: "images",
  Videos: "videos",
} as const;

export default {
  launchImageLibraryAsync,
  launchCameraAsync,
  requestMediaLibraryPermissionsAsync,
  requestCameraPermissionsAsync,
  MediaTypeOptions,
};
