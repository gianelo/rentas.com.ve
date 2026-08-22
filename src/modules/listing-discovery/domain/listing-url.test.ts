import { describe, expect, it } from "vitest";
import { buildListingPath, listingIdFromSlug, MAX_SLUG_LENGTH, slugify } from "./listing-url";

/**
 * A seeded listing id (`src/shared/db/seed.ts` `stableId`) — 8-4-4-4-12 hex,
 * deliberately NOT an RFC 4122 UUID, since the version and variant bits are
 * never set. Real listings use `crypto.randomUUID()`, which is the same
 * layout with those bits set. Both have to parse, so the fixtures cover one
 * of each rather than assuming the two are interchangeable.
 */
const SEED_ID = "3f2a91cb-04d7-b8e0-1a55-9c7e2d4f6b03";
const RANDOM_UUID = "018f4c2a-9b71-4d3e-8a20-5c6d7e8f9a0b";

describe("slugify", () => {
  it("lowercases and joins words with a single hyphen", () => {
    expect(slugify("Apartamento 2 habitaciones")).toBe("apartamento-2-habitaciones");
  });

  it("strips the accents Spanish titles actually carry", () => {
    // Every one of these appears in the design's own content registry
    // (SISTEMA.md, "Contenido real usado") or in a seeded title.
    expect(slugify("Habitación con línea blanca")).toBe("habitacion-con-linea-blanca");
    expect(slugify("Añejo")).toBe("anejo");
  });

  it("drops punctuation instead of encoding it", () => {
    // A percent-escaped comma in a path is legal and unreadable, and this
    // URL is meant to survive being pasted into a WhatsApp message.
    expect(slugify("Apto amoblado cerca del metro, edificio con vigilancia")).toBe(
      "apto-amoblado-cerca-del-metro-edificio-con-vigilancia",
    );
    expect(slugify("Piso 6 — ¡con ascensor!")).toBe("piso-6-con-ascensor");
  });

  it("collapses runs of separators and trims the ends", () => {
    expect(slugify("  ///Chacao   ---  Centro//  ")).toBe("chacao-centro");
  });

  it("returns an empty string when nothing survives", () => {
    // Not a thrown error: a publisher is allowed to write a title made
    // entirely of punctuation, and the id still has to reach a page.
    expect(slugify("¿¡—…!?")).toBe("");
    expect(slugify("   ")).toBe("");
  });

  it("caps the slug at a whole word rather than mid-word", () => {
    const long = "Apartamento amplio con vigilancia veinticuatro horas y planta electrica propia";
    const slug = slugify(long);

    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
    // The cut lands on a separator in the original, so no fragment word.
    expect(long.toLowerCase().replace(/[^a-z0-9]+/g, "-")).toContain(slug);
  });

  it("cuts mid-word when there is no word boundary to cut on", () => {
    // A single word longer than the cap has no better answer. Emitting the
    // whole 70 characters would be worse than a shortened one, because the
    // id after it is what actually resolves the page.
    expect(slugify("a".repeat(70))).toBe("a".repeat(MAX_SLUG_LENGTH));
  });
});

describe("buildListingPath (task 11.1)", () => {
  it("produces the canonical scheme /alquiler/<ciudad>/<zona>/<slug>-<id>", () => {
    expect(
      buildListingPath({
        cityName: "Distrito Capital",
        zoneName: "Los Palos Grandes",
        title: "Apto amoblado cerca del metro, edificio con vigilancia",
        id: SEED_ID,
      }),
    ).toBe(
      `/alquiler/distrito-capital/los-palos-grandes/apto-amoblado-cerca-del-metro-edificio-con-vigilancia-${SEED_ID}`,
    );
  });

  it("falls back to the bare id when the title slugifies to nothing", () => {
    expect(
      buildListingPath({ cityName: "Maracaibo", zoneName: "La Lago", title: "¿?", id: SEED_ID }),
    ).toBe(`/alquiler/maracaibo/la-lago/${SEED_ID}`);
  });

  it("never emits a segment needing percent-encoding", () => {
    const path = buildListingPath({
      cityName: "Distrito Capital",
      zoneName: "El Rosal",
      title: "Piso 6 — ¡con ascensor!",
      id: RANDOM_UUID,
    });

    expect(path).toBe(encodeURI(path));
    expect(path).toMatch(/^\/alquiler\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/);
  });
});

describe("listingIdFromSlug (task 11.1)", () => {
  it("reads the id back out of a path built by buildListingPath", () => {
    for (const id of [SEED_ID, RANDOM_UUID]) {
      const path = buildListingPath({
        cityName: "Distrito Capital",
        zoneName: "Chacao",
        title: "Apartamento 2 habitaciones con puesto de estacionamiento",
        id,
      });
      const segment = path.split("/").at(-1) ?? "";

      expect(listingIdFromSlug(segment)).toBe(id);
    }
  });

  it("accepts a bare id, which is what an empty title produces", () => {
    expect(listingIdFromSlug(SEED_ID)).toBe(SEED_ID);
  });

  it("takes the LAST id-shaped block, not the first", () => {
    // A title can contain something id-shaped. The id is always the tail.
    expect(listingIdFromSlug(`ref-${RANDOM_UUID}-${SEED_ID}`)).toBe(SEED_ID);
  });

  it("refuses anything that is not id-shaped", () => {
    // **This is the load-bearing case.** The return value goes straight into
    // a `WHERE id = $1`, so a segment that merely looks plausible must not
    // reach the database as a lookup key.
    for (const segment of [
      "",
      "chacao",
      "apartamento-2-habitaciones",
      SEED_ID.slice(0, -1), // one hex digit short
      `${SEED_ID}0`, // one too many
      SEED_ID.replace("3f2a91cb", "3f2a91cg"), // 'g' is not hex
      SEED_ID.replaceAll("-", ""), // right characters, wrong shape
      "../../etc/passwd",
      "3f2a91cb-04d7-b8e0-1a55-9c7e2d4f6b03 OR 1=1",
    ]) {
      expect(listingIdFromSlug(segment)).toBeNull();
    }
  });

  it("is case-insensitive on the hex but returns the id as written", () => {
    // Postgres compares `text` exactly, so an uppercased URL must not be
    // handed back as an id that will never match a row. The canonical form
    // is what gets returned; the page redirects the rest.
    expect(listingIdFromSlug(SEED_ID.toUpperCase())).toBe(SEED_ID);
  });
});
