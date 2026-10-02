# ai-commissioner edge function (v1861)
Deployed to Supabase project ojclesuwxhtzvrymqrwg (verify_jwt on).
Turns the commissioner's words + an event snapshot into structured actions; never writes data.
TO TURN ON REAL AI: Supabase dashboard -> Edge Functions -> Secrets -> add ANTHROPIC_API_KEY (from console.anthropic.com).
Optional: AI_COMMISSIONER_MODEL (default claude-haiku-4-5-20251001).
Without the key it returns {error:'no_key'} and the app uses its built-in phrase reader.
