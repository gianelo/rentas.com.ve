import {
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// Auth.js v5 core tables (design.md, Data Model: "user, account, session
// (Auth.js)"). Column shapes mirror @auth/drizzle-adapter's own
// `defineTables()` default Postgres schema exactly, so `DrizzleAdapter(db, {
// usersTable, accountsTable, sessionsTable, verificationTokensTable })` in
// src/modules/identity/infrastructure/auth.ts type-checks against it without
// a cast. Still no `authenticator` table: WebAuthn/passkeys have no caller.
// `verificationToken` DOES now have one (tasks.md 15.1) — Phase 15 added the
// magic-link email door beside Google, and Auth.js's Email provider needs
// somewhere to hold the token between "sent" and "clicked". This comment
// used to say that table would never exist; it was true until it wasn't, and
// the wrong half was worse than no comment at all — a stale "why not" reads
// as a decision nobody actually holds anymore.

/**
 * How a publisher wants to be reached, and the value itself.
 *
 * **The design draws this and never asks for it.** Artboard 2b renders "Ver
 * WhatsApp del dueño" and "El contacto se muestra a usuarios registrados",
 * and no form in the whole system collects a contact — the same shape of gap
 * as `habitaciones`/`metros²` and `baños`/`puesto` before it. Recorded here
 * rather than discovered when the reveal button has nothing to reveal.
 *
 * It is a METHOD plus a VALUE, not a phone number (founder, 2026-08-18):
 * "el valor que quiera mostrar la persona. Sea email, WhatsApp o número de
 * teléfono." A column called `whatsapp` would have forced every publisher who
 * prefers email to lie in it.
 *
 * The button's label must therefore come from the method. "Ver WhatsApp del
 * dueño" is wrong for someone who chose email, and a label that names the
 * wrong channel is a promise the product does not keep.
 */
export type ContactMethod = "whatsapp" | "telefono" | "email";

/**
 * Qué se alquila. Lista cerrada de cinco, decidida por el fundador
 * (2026-08-22). Residencial entero: `local comercial` se evaluó y se descartó.
 */
export type PropertyType = "apartamento" | "casa" | "quinta" | "anexo" | "habitacion";

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  // Present only because the adapter's default schema defines it. It stays
  // NULL by construction: `toMinimalGoogleProfile` drops Google's `picture`
  // before the adapter ever sees the profile, per the account-identity spec's
  // Minimal Identity Data requirement. Do NOT start populating it because the
  // column happens to exist — capturing an avatar is a product decision about
  // holding third-party personal data, not a schema convenience.
  image: text("image"),
  // The publisher's DEFAULT contact, nullable because a fresh Google account
  // has none and publishing is where it is first asked for. `/mi-cuenta`,
  // where this would be edited, does not exist yet and is owed a design — it
  // is a convenience, never a precondition for publishing.
  contactMethod: text("contact_method").$type<ContactMethod>(),
  contactValue: text("contact_value"),
  // Operator-set, never self-service (broker-bulk-import spec, Requirement:
  // Operator-Granted Access; design.md D9 — "an operator-set
  // bulk_import_enabled flag caps blast radius"). NOT NULL with a `false`
  // default so `isBulkImportAuthorized` never has to treat a missing value
  // as anything but refused — the same "no default that turns a gap into a
  // grant" reasoning `publisher_type` and `property_type` already state on
  // `listing`.
  bulkImportEnabled: boolean("bulk_import_enabled").notNull().default(false),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// The magic-link door (tasks.md 15.1, F17). Column shapes and the composite
// primary key mirror @auth/drizzle-adapter's own default `verificationToken`
// table exactly — @auth/core's callback handler calls
// `adapter.useVerificationToken({identifier, token})`, which DELETES the
// matching row and returns it (single use, tasks.md 15.4: a second call
// finds nothing). No `userId` foreign key here on purpose: a token is minted
// before Auth.js knows whether the identifier belongs to an existing user or
// a brand-new one — see next-auth/providers/nodemailer's default
// `sendVerificationRequest` and @auth/core/lib/actions/callback/index.js,
// which only looks the user up AFTER the token round-trips successfully.
export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({ columns: [verificationToken.identifier, verificationToken.token] }),
  ],
);

/**
 * verified_contact (tasks.md 19.9). Qué valores de contacto de una cuenta
 * están verificados, y desde cuándo.
 *
 * **La clave es el triple `(user_id, method, value)` y no la cuenta**, porque
 * la verificación pertenece al VALOR y no a la persona (19d): quien verifica
 * un número y después publica con otro no publicó un número verificado. La
 * clave primaria natural también le sirve sin inventar nada a una
 * inmobiliaria con dos números.
 *
 * **Estado, no bitácora — y por eso NO es append-only**, a diferencia de
 * `contact_reveal_event`, `listing_report` y `moderation_action`. Aquellas
 * registran que algo OCURRIÓ y una fila borrada sería evidencia perdida; ésta
 * contesta una pregunta con una sola respuesta útil («¿está verificado este
 * valor, y desde cuándo?»). Volver a verificar mueve el instante con un
 * `ON CONFLICT DO UPDATE`. Como bitácora, esa misma pregunta sería un
 * `max(verified_at)` agrupado en cada dibujo de ficha, y el propio enunciado
 * de la 19.9 nombra cuatro columnas sin id de evento ni nada que registrar
 * sobre el acto.
 *
 * **De esa clave cae sola la 19.13** —«una inmobiliaria que sube cincuenta
 * avisos verifica una vez, no cincuenta»—: un segundo aviso con el mismo
 * contacto no puede crear una segunda fila, y eso lo garantiza Postgres y no
 * un `if` de la aplicación que alguien recuerde escribir. Mismo razonamiento
 * que `listing_report_listing_reporter_unique`.
 *
 * **La ausencia de fila ES «no verificado» (AGENTS.md §7).** No hay columna
 * `verified` con un default, no hay `NOT VALID` que rellenar y no hay estado
 * intermedio: nada puede hacer que un contacto se lea como verificado sin que
 * alguien haya escrito su instante. Con el canal de WhatsApp diferido al
 * final del proyecto (fundador, 2026-08-29), ésa es la única razón por la que
 * su ausencia no deja un agujero.
 *
 * **`verified_at` con zona horaria y sin ventana escrita en el esquema**: los
 * doce meses de la 19.11 son un `WHERE verified_at > $1` del puerto de
 * lectura, así que expiran sin tocar la base — un cambio de consulta, nunca
 * una migración. La 19.12 tampoco pide nada acá: el aviso ya copia
 * `contact_method`/`contact_value` al publicar, y la ficha escribe la FECHA
 * («verificado por WhatsApp el 19 ago») en vez de un estado, que es lo que la
 * mantiene honesta cuando los dos relojes se cruzan.
 *
 * **`ON DELETE cascade`, y es deliberadamente lo contrario de
 * `listing_report`.** Esto no es evidencia de nada que alguien pudiera querer
 * hacer desaparecer: es una propiedad de una cuenta que ya no existe. Un
 * `restrict` acá haría imposible borrar una cuenta para proteger una fila que
 * sin esa cuenta no significa nada.
 */
export const verifiedContacts = pgTable(
  "verified_contact",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    method: text("method").$type<ContactMethod>().notNull(),
    value: text("value").notNull(),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }).notNull(),
  },
  // Sin índice extra: la ficha entra por la clave entera y «qué tiene
  // verificado esta cuenta» entra por su prefijo `user_id`. La primaria sirve
  // a las dos, y un índice que nadie usa se paga en cada escritura.
  (verified) => [primaryKey({ columns: [verified.userId, verified.method, verified.value] })],
);

// city / zone (design.md D5, tasks.md 2.1). City isolation is enforced by
// schema, not a runtime filter a caller could forget. `zone` carries an
// explicit UNIQUE(id, city_id) alongside its own primary key: a plain
// primary key on `id` is already unique on its own, but a composite foreign
// key must reference a unique (or primary-key) constraint that covers
// exactly its referencing columns, and `id` alone does not cover `city_id`.
// This is the constraint that makes `listing`'s future composite foreign
// key `(zone_id, city_id) -> zone(id, city_id)` (tasks.md 3.1) possible at
// all — without it, a listing could reference a zone that belongs to the
// wrong city, and no application-level check could be trusted to catch
// every case (see the integration test in tests/integration/zone.test.ts).
//
// Zones are a curated table, no free text — see src/shared/db/seed.ts.
//
// **`zone` is now a TREE, and the name stayed on purpose.** It holds the whole
// official hierarchy — estado → municipio → parroquia → elemento — imported
// from `docs/territorio/`: 5,705 places under 81 parroquias and 10 municipios.
// The table was not renamed to `territory` because `listing.zone_id` and the
// composite foreign key above are what D5 rests on, and renaming a table under
// a live foreign key buys a better word at the cost of a data migration.
//
// **`city` is the ÁREA, and it is the product's invention rather than an
// official level.** Caracas metropolitana crosses two federal entities —
// Distrito Capital plus four Miranda municipalities, per Gaceta Oficial 36.906
// and its repeal in 41.308 — so no level of the INE hierarchy can express it.
// Keeping it separate is what lets the official data be re-imported later
// without overwriting a product decision.
//
// **Every row carries `city_id`, denormalised, at every depth.** That is not
// redundancy: it is what keeps `UNIQUE(id, city_id)` meaningful for a
// parroquia six levels down, and therefore what keeps D5 a database guarantee
// instead of a query someone has to remember to write.
//
// **`UNIQUE(city_id, name)` is GONE, and the data killed it.** In the real
// taxonomy `Buena Vista` appears 12 times, `San José` 11, `El Carmen` 10,
// `Los Pinos` and `Santa Ana` 9 each. A barrio is unique inside its parroquia,
// never inside a city — the constraint was not merely tight, it was
// unsatisfiable.

export const cities = pgTable("city", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
});

/**
 * Where a place sits in the official hierarchy. `estado`, `municipio` and
 * `parroquia` come from the INE's DPT; `elemento` is everything below a
 * parroquia, which no official register enumerates completely.
 */
export type ZoneKind = "estado" | "municipio" | "parroquia" | "elemento";

/**
 * What an `elemento` is, **as its source declared it** — never anything
 * inferred from its name. `docs/territorio/` states the rule and this column
 * carries it: "La categoría nunca se dedujo. Un nombre sin prefijo declarado
 * por la fuente va a Otros." NULL for the three official levels, which have no
 * category to declare.
 */
export type ZoneCategory =
  | "barrio"
  | "sector"
  | "urbanizacion"
  | "conjunto"
  | "parcelamiento"
  | "caserio"
  | "comunidad"
  | "localidad"
  | "edificacion"
  | "otro";

/** Provenance, kept so a future INE update can be re-imported. */
export type ZoneSource = "INE" | "IPOSTEL" | "OSM" | "IPOSTEL+OSM";

export const zones = pgTable(
  "zone",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" }),
    /**
     * The official parent. NULL at the top of a city's tree — an `estado` has
     * no parent inside this table.
     *
     * **Self-referencing rather than four tables**, and real data decided it:
     * the searchable unit is not one level. *Chacao* is a municipio AND a
     * parroquia; *Altamira* is an urbanización inside that parroquia; *Sabana
     * Grande* sits in parroquia El Recreo and nobody names the parroquia.
     * People name places ACROSS levels, so one table per level would force
     * search to UNION four queries and force `listing` to carry four nullable
     * foreign keys.
     */
    parentId: text("parent_id"),
    kind: text("kind").$type<ZoneKind>().notNull(),
    /** NULL for estado/municipio/parroquia. See `ZoneCategory`. */
    category: text("category").$type<ZoneCategory>(),
    name: text("name").notNull(),
    /** INE code. Present for the three official levels, absent below them. */
    ubigeo: text("ubigeo"),
    /** IPOSTEL postal code, where the source declared one. */
    postalCode: text("postal_code"),
    source: text("source").$type<ZoneSource>().notNull(),
  },
  (zone) => [
    // The constraint D5 rests on. Untouched by the new depth, and that is the
    // whole reason this table was evolved rather than replaced.
    unique("zone_id_city_id_unique").on(zone.id, zone.cityId),
    foreignKey({
      columns: [zone.parentId],
      foreignColumns: [zone.id],
      name: "zone_parent_fk",
    }),
    // **Uniqueness moved down a level, because the data moved it.** The old
    // UNIQUE(city_id, name) is gone: `Buena Vista` appears 12 times in the real
    // taxonomy, `San José` 11, `El Carmen` 10, `Los Pinos` and `Santa Ana` 9
    // each. A barrio is unique inside its parroquia, never inside a city — the
    // old constraint was not merely tight, it was unsatisfiable. This one still
    // keeps the seed idempotent (tasks.md 2.3), which is what it was for.
    // **`city_id` va PRIMERO, y omitirlo fue un defecto real.** Las filas de
    // nivel superior tienen `parent_id` NULL, asi que sin la ciudad adentro dos
    // zonas homonimas en ciudades distintas chocaban: "Centro" no podia existir
    // en Maracaibo Y en Caracas a la vez. Lo encontro el CI, no la corrida
    // local -- que ademas leyo la linea equivocada del resumen y canto verde.
    unique("zone_city_parent_category_name_unique")
      .on(zone.cityId, zone.parentId, zone.category, zone.name)
      // NULLS NOT DISTINCT, porque sin eso la restricción no diría nada en los
      // tres niveles oficiales: su categoría es NULL, y Postgres considera dos
      // NULL como distintos por omisión. Dos parroquias homónimas bajo un mismo
      // municipio entrarían sin que nada se queje.
      .nullsNotDistinct(),
    index("zone_city_kind_idx").on(zone.cityId, zone.kind),
    index("zone_parent_idx").on(zone.parentId),
  ],
);

/**
 * Cómo se BUSCA una zona, cuando su nombre no es como la gente la nombra.
 *
 * **Existe porque IPOSTEL entierra topónimos dentro de nombres compuestos.** En
 * alcance hay 32 «Oficina Postal Telegráfica X», 90 «X del Sector Y», 8 «Casco
 * Central de X», 33 «Centro X» y 16 «Zona Industrial X». `zone.name` guarda el
 * nombre completo, que es lo correcto — es lo que la fuente publica — pero
 * nadie escribe «Oficina Postal Telegráfica Bella Vista» en una caja de
 * búsqueda. Sin esta tabla, «Bella Vista» encuentra dos de sus siete
 * apariciones reales.
 *
 * **Un alias no crea una zona.** Cada fila apunta a una que ya existe, y sale
 * del «Índice de topónimos» que los propios archivos de `docs/territorio/`
 * publican después de la taxonomía. Inventar un lugar está prohibido por la
 * regla del proyecto; darle un segundo nombre por el cual encontrarlo, no.
 *
 * **No se guarda el alias que repite `zone.name`.** Buscar por el nombre
 * completo ya funciona contra la columna; una copia idéntica acá sería un
 * segundo lugar donde el mismo dato puede quedar viejo.
 *
 * ON DELETE cascade porque un alias sin su zona no significa nada — al revés
 * que `contact_reveal_event`, donde la fila sobrevive a propósito.
 */
export const zoneAliases = pgTable(
  "zone_alias",
  {
    zoneId: text("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
  },
  (row) => [
    primaryKey({ columns: [row.zoneId, row.alias] }),
    // El índice que la caja de sugerencias va a recorrer. Sin él, cada tecla
    // escrita es un recorrido secuencial sobre 3.547 filas.
    index("zone_alias_alias_idx").on(row.alias),
  ],
);

// listing (design.md D5, tasks.md 3.1). The rental advert itself.
//
// Two decisions here are load-bearing, and both are constraints rather than
// application checks — the difference matters, because an application check
// protects only the paths that remember to call it.
//
// 1. `publisher_type` is NOT NULL with NO DEFAULT. A default would be the
//    quiet failure mode: every listing whose publisher type was never
//    resolved would silently become an "owner", and the owner/broker
//    distinction is a trust guarantee the whole product rests on
//    (SISTEMA.md "Distinción dueño / inmobiliaria" — it must survive even
//    the removal of colour). With no default, a caller that forgets the
//    field gets a database error at insert time, not a wrong badge in
//    production.
//
// 2. `(zone_id, city_id)` is a COMPOSITE foreign key into
//    `zone(id, city_id)`, not two independent references. That is D5: "a
//    Maracaibo listing physically cannot hold a Distrito Capital zone."
//    Two separate FKs would each pass on their own while the pair remains
//    nonsense. This is the constraint `zone_id_city_id_unique` exists to
//    make possible, and tests/integration/zone.test.ts proves Postgres
//    actually refuses the cross-city row.
export const listings = pgTable(
  "listing",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    publisherId: text("publisher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // No .default() — see note 2 above. Adding one later is a silent
    // behaviour change, not a convenience.
    publisherType: text("publisher_type").$type<"owner" | "broker">().notNull(),
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    zoneId: text("zone_id").notNull(),
    /**
     * El punto de referencia del paso 2 — «a dos calles de la plaza Altamira»
     * (tasks.md 18.7, especificación de Publicar §3).
     *
     * **Es el campo que reemplaza a Google Places, y la razón por la que la
     * zona sigue siendo lista cerrada.** Google devuelve una dirección
     * formateada, no la taxonomía del producto, y cuatro cosas ya construidas
     * dependen de que la zona sea una lista cerrada: el filtro de búsqueda,
     * los conteos por zona, la URL `/alquiler/<ciudad>/<zona>/…` y las páginas
     * de zona. Si la ubicación pasara a ser texto libre, el filtro se vuelve
     * infinito, los conteos desaparecen y no hay página de zona que indexar.
     *
     * **Nunca se filtra y nunca se indexa, y eso es una garantía y no una
     * nota.** Esta columna tiene exactamente un lector: la consulta de la
     * ficha (`DrizzleListingDetail`). No está en `SearchCriteria`, ni en
     * `SEARCH_QUERY_NAMES`, ni en la consulta facetada, ni en el sitemap, ni
     * en el JSON-LD — emitirla ahí sería indexar por texto libre exactamente
     * lo que se rechazó a Google Places para evitar.
     *
     * **Nulable, y ése es el estado final, no un paso intermedio.** El patrón
     * de tres pasos de la 14.2 —nulable, rellenar, exigir— es para columnas
     * que TIENEN que terminar en NOT NULL sobre filas vivas. Ésta no: el campo
     * es opcional por decisión del fundador, «sin referencia» es un hecho
     * verdadero de todo aviso publicado hasta hoy, y rellenarla inventaría una
     * seña que nadie escribió. Por eso la migración que la agrega es un
     * `ADD COLUMN` nulable y ahí termina.
     *
     * **No es `external_reference`, que está más abajo en esta misma tabla.**
     * Aquélla es la llave de idempotencia de la importación en lote, la genera
     * un archivo y la protege un índice único; ésta la teclea una persona y no
     * la lee ningún índice. Dos columnas con «reference» en el nombre es el
     * riesgo que este párrafo existe para cerrar.
     */
    reference: text("reference"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    // Every price in this product is monthly USD (SISTEMA.md screen 3:
    // "Precio: solo el número; todos los precios están en dólares"), stored
    // as whole dollars. No currency column, because a second currency is a
    // product decision that would also change the search filters and the
    // row layout — not something to leave a nullable column open for.
    priceUsd: integer("price_usd").notNull(),
    rooms: integer("rooms").notNull(),
    areaM2: integer("area_m2").notNull(),
    // Artboard 2b's stat strip: `2 HAB | 2 BAÑOS | 78 M² | 1 PUESTO`. Both
    // are NOT NULL because the strip draws four identical cells and has no
    // empty state for one of them.
    bathrooms: integer("bathrooms").notNull(),
    // **Defaulted to 0 in the database as well as the form**, and the two
    // serve different callers: the form so a publisher never has to type a
    // zero to say "no parking", the column so the broker bulk import
    // (Phase 9) cannot produce a row the detail page renders blank.
    //
    // Zero is a FACT here, not a missing value -- an anexo with no puesto is
    // an ordinary listing, and saying so is something a tenant filters on.
    parkingSpots: integer("parking_spots").notNull().default(0),
    /**
     * Qué es la propiedad. Lista cerrada de cinco, decidida por el fundador
     * (2026-08-22): apartamento · casa · quinta · anexo · habitación.
     *
     * **`local comercial` se propuso y se retiró**, y la retirada es lo que
     * mantiene limpio el modelo: deja el producto residencial entero, deja
     * `rooms` NOT NULL sin obligar a nadie a escribir un número que no
     * significa nada, y deja viva la tira de cuatro celdas de la ficha, cuyo
     * propio comentario dice que "dibuja cuatro celdas iguales y no tiene
     * estado vacío para ninguna". No volver a agregarlo sin reabrir las tres.
     *
     * **NOT NULL y sin valor por defecto**, igual que `publisher_type` y por
     * la misma razón: un default convierte "al que se le olvidó" en "todos son
     * apartamentos", y el tipo es lo que separa un anexo de $150 de un
     * apartamento de $150 — sin él, el filtro de precio miente.
     *
     * Es la tercera vez que este proyecto se topa con el mismo hueco:
     * `habitaciones`/`metros²`, después `baños`/`puesto` (3.15), ahora
     * esto. La primera que se agarró ANTES de construir la pantalla.
     */
    propertyType: text("property_type").$type<PropertyType>().notNull(),
    /**
     * Los cinco atributos de la F6, como columnas y no como tabla.
     *
     * **La razón está en la propia F6**: los atributos se combinan con AND
     * ("piden todos, no cualquiera") y cada uno tiene que informar cuántos de
     * los resultados actuales lo cumplen. Con columnas eso es
     * `COUNT(*) FILTER (WHERE amoblado)` — una pasada, indexable. Con una
     * tabla de atributos es un `GROUP BY … HAVING COUNT(*) = N` en cada
     * búsqueda: complejidad pagada en cada consulta para ahorrar una migración
     * que se hace una vez al año.
     *
     * **Registran una DECLARACIÓN, no un hecho sobre la propiedad.** `false`
     * significa "no lo declaró", nunca "no lo tiene" — la ficha lista sólo lo
     * declarado y jamás afirma una ausencia (F25/R5). Esa asimetría es del
     * producto y no de la base, y por eso vive escrita acá: quien lea la
     * columna sin este comentario va a renderizar "No amoblado" y va a estar
     * diciendo algo que el sistema no sabe.
     */
    hasPowerPlant: boolean("has_power_plant").notNull().default(false),
    hasRegularWater: boolean("has_regular_water").notNull().default(false),
    isFurnished: boolean("is_furnished").notNull().default(false),
    hasSecurity: boolean("has_security").notNull().default(false),
    hasAppliances: boolean("has_appliances").notNull().default(false),
    // active | expired | hidden | draft. Search shows `active` only (tasks.md
    // 5.5/5.6); `hidden` is the auto-hide state from reports (Phase 8);
    // `draft` is the broker bulk import's landing state (Phase 9, tasks.md
    // 9.1) — excluded from search, from contact reveal, and from the expiry
    // clock (design.md, Data Model) until it is activated. This slice only
    // widens the type; which module treats `draft` as what is 9.18/9.19's
    // job, not this one's. Two independent narrower unions read this same
    // column and were widened alongside it rather than left to fail
    // silently: `ListingModerationStatus`
    // (listing-trust/domain/report-threshold.ts) and `RenewableListing`
    // (listing-lifecycle/application/ports/lifecycle-listings.port.ts) — see
    // their own comments for why adding `draft` there is safe without any
    // new branch.
    status: text("status").$type<"active" | "expired" | "hidden" | "draft">().notNull(),
    // Broker bulk import spec, Requirement: Idempotent Import by External
    // Reference (tasks.md 9.1/9.17). Nullable: only rows created by import
    // carry one: the single-listing flow (`NewListing.status: "active"`)
    // never sets it. The uniqueness that makes re-importing the same file a
    // no-op is the index below, not an application-level lookup-then-insert
    // — same reasoning as `listing_report_listing_reporter_unique` and
    // `listing_reminder_cycle_unique`: the guarantee is the constraint.
    externalReference: text("external_reference"),
    // **Copied at publish time, not referenced.** Editing the account default
    // later must not rewrite adverts somebody has already seen: a tenant who
    // wrote to a number needs that advert to keep saying the number they
    // wrote to. NOT NULL, because a listing whose contact cannot be revealed
    // is a listing the product has no purpose for.
    //
    // **Y eso NO prohíbe editar el contacto de un aviso** (tasks.md 18.14,
    // decisión del fundador del 2026-08-29). La copia protege contra un
    // cambio de cuenta que reescribe avisos ajenos al acto; editar ESTE aviso
    // es un acto deliberado sobre ESTE aviso, y quien vuelve ve el número
    // vigente en vez de uno viejo. `contact_reveal_event` no guarda el valor
    // del contacto, así que ninguna fila de evidencia se reescribe.
    contactMethod: text("contact_method").$type<ContactMethod>().notNull(),
    contactValue: text("contact_value").notNull(),
    publishedAt: timestamp("published_at", { mode: "date", withTimezone: true }).notNull(),
    // 30 days from publication (SISTEMA.md screen 3: "Tu aviso queda activo
    // 30 días"). Stored rather than derived so the reminder job (Phase 7)
    // can index it and a renewal can move it.
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    /**
     * Cuándo se renovó por última vez, o `NULL` mientras nadie lo haya hecho
     * (tasks.md 7.2).
     *
     * **Nulable a propósito, y no es la excepción a «tres pasos» de la 0008.**
     * Aquel patrón —nulable, rellenar, exigir— existe para columnas que TIENEN
     * que terminar en NOT NULL sobre filas vivas. Ésta no: «nunca se renovó» es
     * un hecho verdadero de todo aviso publicado hasta hoy, y rellenarla con
     * `published_at` inventaría una renovación que no ocurrió. `expiryFor` ya
     * toma el más tardío entre publicación y renovación, así que `NULL` se lee
     * exactamente como corresponde sin ninguna rama extra.
     *
     * `expires_at` no se deriva de acá: se guarda, porque la renovación la
     * mueve con un `UPDATE` condicionado que es lo que quema el token del
     * enlace (ver `renewal-token.ts`).
     */
    lastRenewedAt: timestamp("last_renewed_at", { mode: "date", withTimezone: true }),
  },
  (listing) => [
    foreignKey({
      columns: [listing.zoneId, listing.cityId],
      foreignColumns: [zones.id, zones.cityId],
      name: "listing_zone_city_fk",
    }),
    // Search always filters by city first and city is non-nullable in the
    // search port (tasks.md 5.1/5.2), so this is the access path every
    // query takes.
    index("listing_city_status_idx").on(listing.cityId, listing.status),
    // The idempotency guarantee for re-importing the same file (tasks.md
    // 9.1/9.17, design.md D9), enforced by Postgres and never by an
    // application read-then-insert. `NULL <> NULL` in a unique index, so
    // every single-listing publish (`external_reference` always `NULL`)
    // coexists freely — only two rows that BOTH carry the same non-null
    // reference for the same publisher collide.
    unique("listing_publisher_external_reference_unique").on(
      listing.publisherId,
      listing.externalReference,
    ),
    // Los dos trabajos del ciclo de vida barren por fecha y NO por ciudad —
    // son los únicos lectores del catálogo que no arrancan con `city_id`, así
    // que `listing_city_status_idx` no les sirve de nada. Sin este índice cada
    // corrida es un recorrido completo de la tabla.
    index("listing_expires_at_idx").on(listing.expiresAt),
  ],
);

// listing_photo (tasks.md 3.8, design.md D12). Una foto, y sus derivadas en
// `listing_photo_derivative`.
//
// **Este comentario decia "dos derivadas por foto y nada mas", y esa frase
// prohibia lo que el disenio nuevo pide.** Son cinco: tarjeta de 158 en movil,
// de 254 en escritorio, tira de la ficha de 328x180, foto principal de 640x360
// y el visor. Las dos que habia se dimensionaron para el layout viejo, cuando
// la miniatura de una fila medía 44x34.
//
// Lo que la frase protegia sigue en pie y no cambio: **no hay columna para el
// archivo original**, porque D12 los descarta despues de hashear.
//
// **There is deliberately no column for the original file.** D12: "Originals
// are discarded after hashing and normalization." A phone photo is 3–8 MB
// and six per listing is ~30 MB, which against R2's 10 GB free tier caps the
// catalogue at ~330 listings; storing only derivatives puts the same tier at
// ~7,000. A nullable `original_key` would be a standing invitation to start
// keeping them, so the column does not exist — the schema refuses what the
// design decided rather than merely not doing it.
//
// **No `alt_text` column either, and that is a decision rather than an
// omission.** The listing-search spec requires alternative text on every
// photo; it does not require a publisher to type it. Asking someone
// filling this form on a phone, one-handed, to describe six photographs
// produces empty fields, not accessible ones. Alt text is composed at
// render time from the listing's own title, zone, and this row's
// `position`. The honest tradeoff, recorded rather than glossed: derived
// alt text is weaker than a real description, and it is chosen because the
// realistic alternative is not better text but no text.
export const listingPhotos = pgTable(
  "listing_photo",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    // Display order, zero-based. The detail screen shows one large photo
    // plus a strip of thumbnails (SISTEMA.md screen 2), so which photo is
    // first is a publisher's choice and has to survive a reload.
    position: integer("position").notNull(),
    // R2 object keys, not URLs. The public base URL is environment
    // configuration (`R2_BUCKET_PUBLIC_URL`) and changes when the bucket
    // moves behind a custom domain — baking it into every row would make
    // that migration a data rewrite instead of a config change.

    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (photo) => [
    // Two photos cannot claim the same slot in one listing's order.
    unique("listing_photo_position_unique").on(photo.listingId, photo.position),
    index("listing_photo_listing_idx").on(photo.listingId),
  ],
);

/**
 * Una derivada de una foto: su clave en R2 y su tamaño medido.
 *
 * **Una tabla y no cinco pares de columnas.** Congelar el número de derivadas
 * en la forma de `listing_photo` es lo que obligó a este cambio: eran dos, el
 * diseño pidió cinco, y agregar una sexta mañana no debería volver a tocar el
 * esquema de la foto.
 *
 * **Los bytes se guardan por derivada, no se derivan.** El presupuesto de D12
 * tiene que ser auditable contra filas reales de producción —
 * `SELECT name, max(bytes) FROM listing_photo_derivative GROUP BY name` es una
 * pregunta que la suite de tests no puede contestar, porque sólo ve fixtures.
 * Un presupuesto verificado únicamente contra imágenes de prueba es un
 * presupuesto que nunca conoció una fotografía real.
 *
 * Guarda claves de R2, nunca URLs, por la misma razón que `listing_photo`
 * antes: la URL pública es configuración de entorno y cambia cuando el bucket
 * se mueve detrás de un dominio propio.
 */
export const listingPhotoDerivatives = pgTable(
  "listing_photo_derivative",
  {
    photoId: text("photo_id")
      .notNull()
      .references(() => listingPhotos.id, { onDelete: "cascade" }),
    /** thumb | card | strip | detail | full. */
    name: text("name").notNull(),
    key: text("key").notNull(),
    bytes: integer("bytes").notNull(),
  },
  (row) => [
    // Una foto no puede tener dos derivadas del mismo tamaño: cuál gana
    // dependería de cuál alcanzó primero un escaneo.
    primaryKey({ columns: [row.photoId, row.name] }),
  ],
);

/**
 * A 64-bit dHash of one photo, as Postgres `bit(64)` (design.md D4).
 *
 * **Not `bigint`, and not `text`.** The similarity query is
 * `bit_count(hash # $1) <= $2` — Postgres's own population count over an XOR
 * — and that operator pair only exists for bit strings. Storing this as a
 * number would force every comparison into application code, which is
 * exactly the sequential-scan-in-TypeScript this design avoids; storing it
 * as text would make the same query a lie that happens to parse.
 *
 * Drizzle has no first-class `bit`, so the type is declared here rather than
 * approximated with one that ships. `customType` keeps the SQL honest while
 * the TypeScript side stays a plain string of 64 ones and zeroes.
 */
const bit64 = customType<{ data: string; driverData: string }>({
  dataType: () => "bit(64)",
});

// listing_photo_hash (tasks.md 4.1, design.md D4). One hash per photo, and
// the primary key says so: a photo with two hashes would make "is this a
// duplicate" depend on which row a scan reached first.
//
// **There is deliberately no `publisher_id` column here**, even though the
// duplicate query filters on it. It is reachable by joining `listing_photo`
// to `listing`, and a copy kept in this table would be a second source of
// truth for who owns a listing — the exact fact D4's same-publisher
// exemption depends on. A denormalised copy that drifts turns "this is your
// own photo, republish freely" into a false accusation of duplication, which
// is the worst failure this feature has.
export const listingPhotoHashes = pgTable("listing_photo_hash", {
  photoId: text("photo_id")
    .primaryKey()
    .references(() => listingPhotos.id, { onDelete: "cascade" }),
  hash: bit64("hash").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
});

// contact_reveal_event (tasks.md 6.1, design.md D6) — the north-star metric's
// single source of truth. Append-only: one row per reveal ACTION, repeats
// included. The unique `(tenant, listing)` figure is not a second table, it is
// `contact_reveal_unique_pair`, a VIEW created by hand in the same migration
// (drizzle has no schema-level view builder in this version, so the CREATE
// VIEW lives in the .sql file; see drizzle-contact-reveal.ts for the drift
// risk that creates).
//
// **`city_id` is copied here, not joined.** A listing can be edited, expired,
// hidden or removed; a metric a JOIN can erase is not a metric. Same reason
// `publisher_id` is stored rather than reached through `listing`.
//
// **No ON DELETE CASCADE anywhere in this table, and that is the decision
// most likely to be "fixed" by mistake.** Cascading from `listing` or `user`
// would silently delete the go/pivot evidence exactly when a listing is taken
// down or an account is closed — the deletions most correlated with the
// months a reveal happened. `restrict` makes the conflict loud instead: an
// account erasure request will fail here until someone decides between
// anonymising these rows and dropping them, which is the open question
// design.md already records under "Retention for contact_reveal_event".
export const contactRevealEvents = pgTable(
  "contact_reveal_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    publisherId: text("publisher_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tenantUserId: text("tenant_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    revealedAt: timestamp("revealed_at", { mode: "date", withTimezone: true }).notNull(),
    // Task 6.11 — nullable on PURPOSE, enforced by a `NOT VALID` CHECK
    // constraint in the migration instead of `NOT NULL`. Rows already exist
    // from PR #81 with no message; `NULL` means "this reveal predates the
    // requirement" and nothing else. Every new insert is enforced — see the
    // migration file for the constraint, which must never be VALIDATEd.
    message: text("message"),
  },
  (event) => [
    // Supplies the view's `DISTINCT ON` ordering and its window partition in
    // one index, so the unique-pair count needs no sort step (design.md D6,
    // query table). There is deliberately NO unique constraint on
    // (tenant_user_id, listing_id): a repeat reveal must insert, not conflict.
    index("contact_reveal_pair_idx").on(
      event.tenantUserId,
      event.listingId,
      event.revealedAt,
      event.id,
    ),
    index("contact_reveal_city_idx").on(event.cityId, event.revealedAt),
    index("contact_reveal_listing_idx").on(event.listingId, event.revealedAt),
  ],
);

/**
 * Un correo del ciclo de vida que YA SALIÓ, para un aviso y un ciclo
 * (tasks.md 7.1).
 *
 * **La garantía de «no lo mandes dos veces» es esta restricción, no un `if`
 * en el trabajo.** La diferencia se ve cuando dos corridas se superponen: un
 * cron atrasado que arranca junto al siguiente, un reintento de Vercel sobre
 * una función que todavía corría. Un `if` sobre una lectura previa deja una
 * ventana entre leer y escribir en la que las dos corridas leen «todavía no» y
 * las dos mandan. Postgres no tiene esa ventana: el segundo `INSERT` choca
 * contra el índice único y el trabajo lo lee como «de éste ya se encargó
 * alguien» en lugar de mandar.
 *
 * **La clave lleva `kind`, y ahí se corre de la letra de 7.1.** La tarea
 * escribía `UNIQUE (listing_id, expires_at)`, de cuando el plan tenía UN
 * correo. 19.5 agregó el segundo — el de la purga — y con dos columnas el
 * aviso de purga chocaría contra la fila del aviso de vencimiento del mismo
 * ciclo y NO SALDRÍA. Es justamente el correo cuya ausencia no se deshace:
 * quien ignoró el primero perdería sus fotos sin segunda advertencia. La
 * garantía no se debilita — sigue siendo la restricción, no un `if` — pero su
 * unidad pasa a ser «este aviso, este ciclo, este correo», que es lo que de
 * verdad tiene que salir una sola vez.
 *
 * **`expires_at` es parte de la clave, y por eso renovar rehabilita los
 * avisos.** Al renovar, `listing.expires_at` se mueve 30 días: el ciclo nuevo
 * tiene otra clave y se gana sus dos correos. Sin esa columna, un aviso
 * avisado una vez quedaría mudo para siempre.
 */
export const listingReminders = pgTable(
  "listing_reminder",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // `cascade` y no `restrict`: el registro de que se mandó un correo no es
    // evidencia de nada, a diferencia de `contact_reveal_event`, que es la
    // métrica del producto y por eso bloquea cualquier borrado.
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** `expiry` (antes de vencer) | `purge` (antes de borrar las fotos). */
    kind: text("kind").$type<"expiry" | "purge">().notNull(),
    /** El `expires_at` del aviso al enviarse: es lo que identifica el ciclo. */
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (reminder) => [
    unique("listing_reminder_cycle_unique").on(
      reminder.listingId,
      reminder.kind,
      reminder.expiresAt,
    ),
  ],
);

/**
 * Una corrida de un trabajo, con sus conteos y sus fallas (tasks.md 7.7).
 *
 * **Existe porque un trabajo que corre solo y no deja rastro es
 * indistinguible de uno que no corrió**, y este proyecto ya pagó esa lección
 * entera: cuatro migraciones sin aplicar durante cuatro días, encontradas por
 * el fundador intentando entrar a su propio producto. El error se escribía;
 * nadie leía. Una fila por corrida se consulta.
 *
 * `failure_detail` es texto y no una tabla de fallas: lo que hace falta es
 * poder mirar por qué se cayeron tres de doscientos, no consultarlo por
 * columna. Una tabla más sería estructura pagada por adelantado.
 */
export const jobRuns = pgTable(
  "job_run",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** `expiry-reminders` | `photo-purge`. */
    job: text("job").notNull(),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true }).notNull(),
    /** Cuántos candidatos trajo la consulta. */
    selected: integer("selected").notNull(),
    /** Cuántos se procesaron de punta a punta. */
    succeeded: integer("succeeded").notNull(),
    /** Cuántos ya había hecho una corrida anterior — la restricción única. */
    skipped: integer("skipped").notNull().default(0),
    failed: integer("failed").notNull(),
    failureDetail: text("failure_detail"),
  },
  (run) => [index("job_run_job_started_idx").on(run.job, run.startedAt)],
);

// listing_report (tasks.md 8.1, listing-trust spec, "Auto-Hide After Three
// Distinct Reports"). One row per (listing, reporter) pair — the UNIQUE
// constraint below IS the "at most one report per account" guarantee, the
// same way `listing_reminder_cycle_unique` is the "never send it twice"
// guarantee: a repeat report from the same account collides with the index
// instead of relying on an `if` in the use case remembering to check first.
// `count(*) WHERE listing_id = $1` is therefore already a count of DISTINCT
// accounts, by construction — there is no second COUNT DISTINCT query
// anywhere in this feature.
//
// **`ON DELETE restrict` on both foreign keys, same reasoning as
// `contact_reveal_event` (design.md D6).** A report is evidence — of what a
// reader flagged and who flagged it — and evidence a `CASCADE` could erase is
// not evidence. It would also erase it at exactly the correlated moment: an
// account or listing getting deleted is disproportionately likely to be one
// somebody was trying to make disappear.
export const listingReports = pgTable(
  "listing_report",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reportedAt: timestamp("reported_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (report) => [
    // The guarantee, not an application check — see the file comment above.
    // Leading with `listing_id` also makes this the index the distinct-count
    // query runs on.
    unique("listing_report_listing_reporter_unique").on(report.listingId, report.reporterId),
  ],
);

// moderation_action (tasks.md 8.1/8.6, listing-trust spec, "Operator
// Restore"). An append-only log of what an operator did to a listing —
// today, only `restore`.
//
// **No `actor` column.** This project has no operator account model: the
// route that writes this row is gated by a shared bearer secret
// (`operator-authorization.ts`, mirroring `cron-authorization.ts`), not by a
// signed-in `user` row, so there is no identity here to reference without
// inventing an operator-account concept nothing else in this schema needs
// yet. What the row proves — a listing was restored, and when — does not
// depend on who was holding the secret.
//
// **`ON DELETE restrict`, same reasoning as `listing_report` above and
// `contact_reveal_event` (design.md D6).** A moderation log is evidence too:
// it is the record that a hidden listing was reviewed and cleared. `CASCADE`
// would let a listing's own deletion quietly erase the fact that it had ever
// been moderated.
export const moderationActions = pgTable(
  "moderation_action",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    /** Closed list of one today; typed rather than left as bare `text` so a
     * second kind of action fails to compile at every switch that reads it,
     * instead of falling through silently. */
    action: text("action").$type<"restore">().notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (row) => [index("moderation_action_listing_idx").on(row.listingId, row.createdAt)],
);

// bulk_import_batch (tasks.md 9.1, broker-bulk-import spec). One row per
// upload attempt — the audit trail of who imported what, when, and with what
// outcome, same reasoning `job_run` already states for a scheduled job: "a
// [process] that runs alone and leaves no trace is indistinguishable from one
// that did not run".
//
// **Scaffold, not the full design.** `tasks.md` 9.1 asks only for this table
// to exist; the columns a real preview/confirm needs (per-row errors, which
// rows became drafts) are `ValidateImportUseCase`/`ConfirmImportUseCase`'s
// decision (9.13-9.17), not this schema-only slice's. Recorded here rather
// than left unwritten, per AGENTS.md §5's rule that a deviation from the
// task text needs its reason on the page: this shape may grow columns in a
// later migration once that use case is designed, and that is expected, not
// a sign this one was wrong.
//
// **`ON DELETE restrict` on `publisher_id`**, same reasoning as
// `listing_report`/`moderation_action`: an import batch is evidence of what
// an account did, and a `CASCADE` would let deleting the account erase it.
export const bulkImportBatches = pgTable(
  "bulk_import_batch",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    publisherId: text("publisher_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    uploadedAt: timestamp("uploaded_at", { mode: "date", withTimezone: true }).notNull(),
    totalRows: integer("total_rows").notNull(),
    validRows: integer("valid_rows").notNull(),
    /** How many of the valid rows actually became a draft after confirmation. */
    createdDrafts: integer("created_drafts").notNull().default(0),
  },
  (batch) => [index("bulk_import_batch_publisher_idx").on(batch.publisherId, batch.uploadedAt)],
);

/**
 * publish_draft (tasks.md 18.29). Los nueve pasos a medio contestar, del lado del
 * servidor, con la sesión como llave.
 *
 * **Existe porque el borrador vivía en dos cookies de treinta minutos**, y una cookie
 * es lo que un trabajo programado no puede ver. El costo se mide en objetos: una
 * publicación abandonada deja hasta seis fotos ya promovidas a cinco derivadas WebP
 * **que nada puede volver a nombrar**, porque el único registro de esas claves se
 * murió en el navegador de quien se fue.
 *
 * **La primaria es `publisher_id` sola, y ahí está la decisión.** «Empezar una
 * publicación nueva descarta la anterior» (fundador, 2026-09-01) lo garantiza
 * Postgres y no un `if` que un llamador posterior puede olvidar. Mismo criterio que
 * la clave natural de `verified_contact`.
 *
 * **Dos `jsonb`, pero tampoco uno solo.** Una columna por campo sería una migración
 * por campo; lo que NO puede quedar enterrado es lo que el barrido de las 24 horas
 * lee, así que `expires_at` es columna de verdad y `photos` es su propio `jsonb`:
 * «cuáles vencieron y qué claves borro» se contesta sin traer `answers`, donde vive
 * la descripción de 1.200 caracteres.
 *
 * **`expires_at` es un instante absoluto y no `updated_at + 24h`**; la ventana vive
 * en `domain/draft-expiry.ts`, y no hay `updated_at` porque sería esa resta. **Sin
 * índice**: nada lo consulta todavía y lo agrega el barrido con su llamador. **`ON
 * DELETE cascade`**, como `verified_contact` — con un cabo suelto anotado: borrar la
 * cuenta se lleva las únicas claves que nombraban sus fotos de R2.
 */
export const publishDrafts = pgTable(
  "publish_draft",
  {
    publisherId: text("publisher_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `StoredPublicationDraft` sin las fotos; `photos` va aparte porque el barrido lo lee solo. */
    answers: jsonb("answers").notNull(),
    photos: jsonb("photos").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (draft) => [
    // tasks.md 18.32 — **el índice llega con su llamador**, que es lo que la
    // 18.29 dejó dicho al no ponerlo. `sweepExpiredDrafts` pregunta
    // `expires_at <= $ahora` sobre la tabla entera una vez por día; sin él eso
    // es un recorrido completo que crece con cada publicación abandonada.
    index("publish_draft_expires_at_idx").on(draft.expiresAt),
  ],
);
