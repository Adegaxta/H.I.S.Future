/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_UNSPLASH_ACCESS_KEY?: string;
	readonly VITE_UNSPLASH_APP_NAME?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
