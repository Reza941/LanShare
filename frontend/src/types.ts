export interface Session {
  userId: string;
  token: string;
  displayName: string;
}

export interface ShareFile {
  id: string;
  originalFileName: string;
  sizeBytes: number;
  contentType: string;
  relativePath?: string;
}

export interface ShareBundle {
  id: string;
  title: string;
  authorName: string;
  authorId: string;
  createdAt: string;
  fileCount: number;
  totalSizeBytes: number;
  files: ShareFile[];
}
