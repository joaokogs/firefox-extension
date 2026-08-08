declare module '*.css' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_PRO_PRICE_AMOUNT: string;
  readonly VITE_PRO_PRICE_CURRENCY: string;
  readonly VITE_PRO_PRICE_INTERVAL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
