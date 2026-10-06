/// <reference types="vite/client" />

// Individual entries keep development startup from importing the entire icon barrel.
declare module "lucide-react/dist/esm/icons/*.mjs" {
  import type { LucideIcon } from "lucide-react";
  const icon: LucideIcon;
  export default icon;
}

interface ImportMetaEnv {
	readonly VITE_UNSPLASH_ACCESS_KEY?: string;
	readonly VITE_UNSPLASH_APP_NAME?: string;
	readonly VITE_GEMITAV_V0?: string;
	readonly VITE_CONTEXT_ENGINE_V1?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
