import { createClient } from "@supabase/supabase-js";
import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";

export type Database = {
  public: {
    Tables: {
      shared_drafts: {
        Row: {
          id: string;
          title: string;
          script: string;
          scenes: { title: string; content: string; imagePrompt?: string }[];
          key_phrase: string;
          character_description: string;
          moods: string[];
          expires_at: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["shared_drafts"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["shared_drafts"]["Insert"]>;
      };
      videos: {
        Row: {
          id: string;
          user_id: string | null;
          topic: string;
          script: string | null;
          scenes: { title: string; content: string }[] | null;
          audio_url: string | null;
          image_urls: string[] | null;
          video_url: string | null;
          subtitled_video_url: string | null;
          status:
            | "pending"
            | "generating_script"
            | "generating_voice"
            | "generating_images"
            | "rendering"
            | "adding_subtitles"
            | "completed"
            | "failed";
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["videos"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["videos"]["Insert"]>;
      };
    };
  };
};

export function createBrowserClient() {
  return createSSRBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
