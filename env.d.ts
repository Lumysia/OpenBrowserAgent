declare function defineBackground(callback: () => void): void;
declare function defineUnlistedScript(callback: () => void): void;

declare module "*.css";
declare module "*.css?inline" {
  const css: string;
  export default css;
}
