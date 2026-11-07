/** Propose un fichier au téléchargement (fonctionne aussi sur iPad : app Fichiers). */
export function downloadFile(data: BlobPart, filename: string, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Nom de fichier sûr à partir d'un titre et d'une date. */
export function safeFilename(title: string, date: Date, ext: string): string {
  const d = date.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const base = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-]+/g, '_').slice(0, 40);
  return `${d}_${base}.${ext}`;
}
