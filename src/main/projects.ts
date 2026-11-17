/** The saved Projects after the user picked `folder`. A folder is saved once, however often it is picked. */
export function withProject(projects: string[] | undefined, folder: string): string[] {
  const saved = projects ?? []
  return saved.includes(folder) ? saved : [...saved, folder]
}
