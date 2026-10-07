import { Platform } from "react-native";

import * as FileSystem from "expo-file-system/legacy";

import { api } from "./client";



export type UploadResult = { id: number; url: string };



type UploadOptions = {

  uri: string;

  fileName?: string;

  mimeType?: string;

  purpose?: string;

  /** When ImagePicker is used with `base64: true`, pass asset.base64 here. */

  base64Data?: string | null;

};



function guessMimeType(fileName: string, mimeType?: string): string {

  if (mimeType) return mimeType;

  const lower = fileName.toLowerCase();

  if (lower.endsWith(".png")) return "image/png";

  if (lower.endsWith(".webp")) return "image/webp";

  if (lower.endsWith(".heic")) return "image/heic";

  return "image/jpeg";

}



function normalizeFileName(fileName: string, mimeType: string): string {

  let name = fileName.includes(".") ? fileName : `${fileName}.jpg`;

  if (mimeType === "image/png" && !name.toLowerCase().endsWith(".png")) {

    name = name.replace(/\.[^.]+$/, "") + ".png";

  }

  return name;

}



function blobToBase64(blob: Blob): Promise<string> {

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onloadend = () => {

      const result = reader.result;

      if (typeof result !== "string") {

        reject(new Error("Could not read image data."));

        return;

      }

      const comma = result.indexOf(",");

      resolve(comma >= 0 ? result.slice(comma + 1) : result);

    };

    reader.onerror = () => reject(new Error("Could not read image from device."));

    reader.readAsDataURL(blob);

  });

}



async function uriToBase64(uri: string, existing?: string | null): Promise<string> {

  if (existing && existing.length > 100) {

    return existing;

  }



  if (uri.startsWith("data:")) {

    const comma = uri.indexOf(",");

    if (comma >= 0) return uri.slice(comma + 1);

  }



  if (Platform.OS === "web" || uri.startsWith("blob:")) {

    const response = await fetch(uri);

    const blob = await response.blob();

    return blobToBase64(blob);

  }



  let readUri = uri;

  if (Platform.OS === "android" && !uri.startsWith("file://")) {

    const dest = `${FileSystem.cacheDirectory}upload-${Date.now()}.jpg`;

    await FileSystem.copyAsync({ from: uri, to: dest });

    readUri = dest;

  }



  return FileSystem.readAsStringAsync(readUri, {

    encoding: FileSystem.EncodingType.Base64,

  });

}



/**

 * Upload via base64 JSON — reliable for Expo ImagePicker on iOS, Android, and web.

 */

export async function uploadFile({

  uri,

  fileName = "photo.jpg",

  mimeType,

  purpose = "service",

  base64Data,

}: UploadOptions): Promise<UploadResult> {

  const type = guessMimeType(fileName, mimeType);

  const name = normalizeFileName(fileName, type);



  let base64: string;

  try {

    base64 = await uriToBase64(uri, base64Data);

  } catch {

    throw new Error(

      "Could not read the image from your device. Try picking the photo again."

    );

  }



  if (!base64 || base64.length < 100) {

    throw new Error("Selected image appears empty. Please choose another photo.");

  }



  const res = await api.post<UploadResult>("api/media/upload-base64/", {

    image_base64: base64,

    file_name: name,

    mime_type: type,

    purpose,

  });



  return res.data;

}



export async function uploadImage(

  uri: string,

  fileName = "photo.jpg",

  mimeType?: string,

  purpose = "service",

  base64Data?: string | null

): Promise<UploadResult> {

  return uploadFile({ uri, fileName, mimeType, purpose, base64Data });

}



export const mediaApi = { uploadImage, uploadFile };


