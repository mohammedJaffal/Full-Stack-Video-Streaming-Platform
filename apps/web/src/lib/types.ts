export type Category = {
  id: number;
  name: string;
  slug: string;
};

export type ContentSummary = {
  id: number;
  title: string;
  slug: string;
  description: string;
  release_year: number;
  duration_seconds: number;
  poster_url: string;
  backdrop_url: string;
  category_id: number;
  category_name: string;
  playback_type: string;
  is_active: boolean;
  created_at: string;
};

export type Subtitle = {
  id: number;
  content_id: number;
  language_code: string;
  label: string;
  file_url: string;
  format: string;
  is_default: boolean;
};

export type ContentDetails = {
  content: ContentSummary;
  subtitles: Subtitle[];
  related: ContentSummary[];
};
