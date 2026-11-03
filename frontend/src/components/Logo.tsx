export function Logo({ size = 44 }: { size?: number }) {
  return <img src="/logo.svg" width={size} height={size} alt="" className="logo" />;
}
