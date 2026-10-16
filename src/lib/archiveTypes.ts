export type EntryCategory = "Poem" | "Prose" | "Note";
export type ArchiveEntry = {
  number: string;
  title: string;
  excerpt: string;
  category: EntryCategory;
  date: string;
  created_at?: string;
  updated_at?: string;
  tone: string;
  author?: string;
  collection?: string;
  is_public: boolean;
  likes: number;
  image_url?: string | null;
  theme_background?: string;
  theme_ink?: string;
  theme_accent?: string;
  font_family?: string;
  shadow_overlay?: string;
  poem_text_size?: number;
};

