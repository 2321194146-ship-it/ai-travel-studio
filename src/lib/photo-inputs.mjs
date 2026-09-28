// A preview alone (including a demo image) is never a submitted user photo.
export function hasPhotoInput(photo) {
  return Boolean(photo?.file || photo?.archiveUrl);
}

export async function resolvePhotoInputs(photos, upload) {
  return Promise.all(
    photos.map(async (photo, index) => {
      if (!hasPhotoInput(photo)) return null;
      const url = photo.archiveUrl || await upload(photo.file, index);
      return { url, index };
    }),
  ).then((items) => items.filter(Boolean));
}
