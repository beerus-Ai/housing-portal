/** Phosphor duotone icon font glyph, e.g. <Icon name="house" />. */
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <i className={`ph-duotone ph-${name} ${className}`.trim()} aria-hidden="true" />;
}
