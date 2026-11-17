import * as DocumentPicker from "expo-document-picker";

const imageTypes = ["image/jpeg", "image/png", "image/webp"];

export async function pickRestaurantImage(): Promise<FormData | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: imageTypes, copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets[0]) return null;
  const { uri, name, mimeType } = result.assets[0];
  const form = new FormData();
  // React Native's multipart implementation resolves the file from its URI.
  form.append("file", { uri, name, type: mimeType ?? "application/octet-stream" } as unknown as Blob);
  return form;
}
