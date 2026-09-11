export type DownloadState = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type DownloadItem = {
  id: number;
  url: string;
  file_name: string;
  local_uri: string | null;
  state: DownloadState;
  progress: number;
  total_bytes: number | null;
  written_bytes: number;
  speed_bps: number;
  eta_seconds: number | null;
  resume_data: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
};
