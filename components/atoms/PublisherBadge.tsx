import styles from "./PublisherBadge.module.css";

/**
 * publisher_type badge (tasks.md 1b.7, SISTEMA.md "Distinción dueño /
 * inmobiliaria"). The distinction is fill vs border, never the accent
 * colour — that is what survives a greyscale render.
 */
export function PublisherBadge({ publisherType }: { publisherType: "owner" | "broker" }) {
  const isOwner = publisherType === "owner";
  return (
    <span className={`${styles.badge} ${isOwner ? styles.owner : styles.broker}`}>
      {isOwner ? "Dueño" : "Inmobiliaria"}
    </span>
  );
}
