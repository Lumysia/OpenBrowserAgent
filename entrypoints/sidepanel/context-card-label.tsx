// Title and detail of a composer context card. Both truncate to one line, so
// each carries its full text as a tooltip.
export function ContextCardLabel({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <span>
      <strong title={title}>{title}</strong>
      <small title={detail}>{detail}</small>
    </span>
  );
}
