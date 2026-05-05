/// <reference types="vite/client" />

declare module "*.glsl?raw" {
  const src: string;
  export default src;
}

interface VoidSignalPerfDetail {
  frameMs: number;
  renderScale: number;
}

export {};

declare global {
  interface WindowEventMap {
    "voidsignal:perf": CustomEvent<VoidSignalPerfDetail>;
  }

  interface Window {
    __voidSignalGlInjected?: boolean;
  }
}
