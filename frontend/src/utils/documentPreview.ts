export function isImageFile(path?: string | null) {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(path ?? '')
}

export function isPdfFile(path?: string | null) {
  return /\.pdf$/i.test(path ?? '')
}

export function openDocumentPreview(documentId: number, filePath?: string | null) {
  window.dispatchEvent(
    new CustomEvent('open-preview', {
      detail: {
        documentId,
        type: isPdfFile(filePath) ? 'pdf' : 'image',
      },
    })
  )
}
