export interface AnalysisResponse {
  image: string; // URL ou base64
  description: string;
  description_en?: string;
  created_at: string;
}

export interface AnalysisError {
  error: string;
}

export interface HistoryItem {
  id: string;
  image: string;
  fileName: string;
  fileSize: string;
  mimeType: string;
  description: string;
  description_en?: string;
  created_at: string;
}

