/**
 * **La semilla determinista del arnés de e2e** (tasks.md 11.22).
 *
 * No es `src/shared/db/seed.ts`, y la separación es deliberada por dos razones.
 * Aquélla corre en cada despliegue de vista previa, así que **no puede tener
 * fotos**: sembraría imágenes rotas en el único entorno que alguien mira. Y
 * genera el árbol territorial entero —5.705 lugares— que una suite de navegador
 * no necesita y paga en segundos por corrida.
 *
 * Esto es lo contrario: **poco, fijo y con fotos**. Dos ciudades, dos zonas cada
 * una, avisos con portada, y un aviso vencido en una de las zonas para que la
 * pantalla de la 11.8 también se pueda caminar con un navegador de verdad.
 *
 * **Las dos ciudades tienen avisos, y ésa es toda la razón por la que hay dos.**
 * El aislamiento del D5 falla en silencio: un aviso de la otra ciudad se ve como
 * un resultado, no como un error. Con una sola ciudad cargada, la prueba pasaría
 * por no tener nada que traerse de más.
 *
 * Habla `pg` directo contra `TEST_DATABASE_URL`, como el resto de la capa de
 * integración: es una fixture, no la aplicación. Quien corre la aplicación
 * contra este mismo Postgres es `scripts/neon-http-proxy.mjs`.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  cities,
  listingPhotoDerivatives,
  listingPhotos,
  listings,
  users,
  zones,
} from "../src/shared/db/schema";

export const DISTRITO = { id: "e2e-ciudad-dc", name: "Distrito Capital" };
export const MARACAIBO = { id: "e2e-ciudad-mcbo", name: "Maracaibo" };

export const ZONE_ROWS = [
  { id: "e2e-zona-chacao", cityId: DISTRITO.id, name: "Chacao" },
  { id: "e2e-zona-altamira", cityId: DISTRITO.id, name: "Altamira" },
  { id: "e2e-zona-tierra-negra", cityId: MARACAIBO.id, name: "Tierra Negra" },
  { id: "e2e-zona-bella-vista", cityId: MARACAIBO.id, name: "Bella Vista" },
] as const;

const PUBLISHER = {
  id: "e2e-publicante",
  name: "Publicante de prueba",
  // TLD reservado (RFC 2606): nunca puede ser un buzón real, así que nadie
  // entra con Google y hereda estos avisos. Misma regla que la siembra de
  // producción.
  email: "e2e-owner@rentas.invalid",
} as const;

/**
 * **Los ids son UUID por obligación y no por estilo.** `listingIdFromSlug` sólo
 * reconoce esa forma al final del segmento, y su resultado se convierte en un
 * `WHERE id = $1`: un id con otra forma no se rechaza en la base, se rechaza
 * antes, y la ficha contesta 404. Se descubrió sembrando `e2e-mcbo-1` y viendo
 * la ficha vencida devolver un 404 — la guarda funcionando exactamente como
 * está escrita.
 *
 * Fijos y legibles a propósito: las pruebas de navegador arman la dirección de
 * la ficha con estos mismos valores, importados desde acá y no copiados.
 *
 * Y cada título nombra su zona: un aviso de Chacao dentro de una página de
 * Maracaibo se ve como un resultado más, y el título es lo único que lo delata.
 */
export const ID = {
  dcChacao: "e2e00001-0000-4000-8000-000000000001",
  dcAltamira: "e2e00002-0000-4000-8000-000000000002",
  mcboTierraNegra1: "e2e00003-0000-4000-8000-000000000003",
  mcboTierraNegra2: "e2e00004-0000-4000-8000-000000000004",
  mcboBellaVista: "e2e00005-0000-4000-8000-000000000005",
  mcboVencido: "e2e00006-0000-4000-8000-000000000006",
} as const;

export const LISTING_ROWS = [
  {
    id: ID.dcChacao,
    zoneId: "e2e-zona-chacao",
    cityId: DISTRITO.id,
    title: "Apartamento 2 habitaciones en Chacao",
    priceUsd: 520,
    status: "active",
  },
  {
    id: ID.dcAltamira,
    zoneId: "e2e-zona-altamira",
    cityId: DISTRITO.id,
    title: "Estudio en Altamira con vigilancia",
    priceUsd: 320,
    status: "active",
    // **El único sin puesto, y está para que el conteo se pueda medir** (14.45
    // rebanada C). «Puesto de estacionamiento» es una opción DERIVADA de
    // `parking_spots > 0`: con los seis avisos en uno, su número sería igual al
    // total y `> 0` no se distinguiría de `count(*)` — la faceta pasaría en
    // verde sin aplicar el umbral. Con éste en cero, Distrito Capital dice «1
    // de 2» y el filtro tiene algo que separar.
    parkingSpots: 0,
  },
  {
    id: ID.mcboTierraNegra1,
    zoneId: "e2e-zona-tierra-negra",
    cityId: MARACAIBO.id,
    title: "Apartamento 3 habitaciones en Tierra Negra",
    priceUsd: 480,
    status: "active",
  },
  {
    id: ID.mcboTierraNegra2,
    zoneId: "e2e-zona-tierra-negra",
    cityId: MARACAIBO.id,
    title: "Casa amoblada en Tierra Negra",
    priceUsd: 900,
    status: "active",
  },
  {
    id: ID.mcboBellaVista,
    zoneId: "e2e-zona-bella-vista",
    cityId: MARACAIBO.id,
    title: "Estudio amoblado en Bella Vista",
    priceUsd: 250,
    status: "active",
  },
  // El vencido: la pantalla de la 11.8, con avisos activos de su misma zona
  // esperándolo del otro lado.
  {
    id: ID.mcboVencido,
    zoneId: "e2e-zona-tierra-negra",
    cityId: MARACAIBO.id,
    title: "Apartamento vencido en Tierra Negra",
    priceUsd: 390,
    status: "expired",
  },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Las dos derivadas que la regla F9 exige para que una tarjeta se dibuje, más
 * las de la ficha. **Las claves apuntan a objetos que no existen**, y está
 * bien: lo que estas pruebas miden es que los avisos estén en el cuerpo servido
 * con el script apagado, y para eso hace falta que el aviso PASE la regla F9,
 * no que la imagen cargue. Servir bytes de imagen desde acá sería un segundo
 * almacenamiento de mentira que nadie pidió.
 */
const DERIVATIVES = [
  { name: "thumb", bytes: 4_096 },
  { name: "card", bytes: 8_192 },
  { name: "strip", bytes: 6_144 },
  { name: "detail", bytes: 32_768 },
  { name: "full", bytes: 65_536 },
] as const;

export async function seedE2e(): Promise<void> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "seed-e2e: TEST_DATABASE_URL no está puesta. Levantá la base desechable con " +
        "`pnpm db:test:up && pnpm db:test:migrate`.",
    );
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema: { cities, zones, users, listings } });

  try {
    // **Se borra antes de sembrar, y por eso es determinista.** Un `upsert`
    // sobre una base que acumula deja una suite que pasa por lo que corrió
    // antes. Esta base es desechable por diseño (`docker-compose.yml`).
    await pool.query("delete from listing_photo_derivative");
    await pool.query("delete from listing_photo");
    await pool.query("delete from listing");
    await pool.query("delete from zone");
    await pool.query('delete from "user"');
    await pool.query("delete from city");

    await db.insert(cities).values([DISTRITO, MARACAIBO]);
    await db.insert(zones).values(
      ZONE_ROWS.map((zone) => ({
        ...zone,
        parentId: null,
        kind: "elemento" as const,
        category: "urbanizacion" as const,
        source: "INE" as const,
      })),
    );
    await db.insert(users).values([PUBLISHER]);

    const now = new Date();
    await db.insert(listings).values(
      LISTING_ROWS.map((listing) => ({
        id: listing.id,
        publisherId: PUBLISHER.id,
        publisherType: "owner" as const,
        propertyType: "apartamento" as const,
        cityId: listing.cityId,
        zoneId: listing.zoneId,
        title: listing.title,
        description:
          "Planta eléctrica, vigilancia 24 horas y agua regular. Puesto de estacionamiento " +
          "techado. Depósito de dos meses. Aviso sembrado para la suite de navegador.",
        priceUsd: listing.priceUsd,
        rooms: 2,
        areaM2: 80,
        bathrooms: 2,
        parkingSpots: "parkingSpots" in listing ? listing.parkingSpots : 1,
        contactMethod: "whatsapp" as const,
        // Inutilizable a propósito, igual que en la siembra de producción: un
        // número plausible metería en el producto un contacto de nadie.
        contactValue: "sin-contacto",
        status: listing.status,
        publishedAt: new Date(now.getTime() - 40 * DAY_MS),
        // El vencido venció de verdad: su fecha ya pasó, no sólo su estado.
        expiresAt:
          listing.status === "expired"
            ? new Date(now.getTime() - 5 * DAY_MS)
            : new Date(now.getTime() + 25 * DAY_MS),
      })),
    );

    await db.insert(listingPhotos).values(
      LISTING_ROWS.map((listing) => ({
        id: `${listing.id}-foto`,
        listingId: listing.id,
        position: 0,
        createdAt: now,
      })),
    );
    await db.insert(listingPhotoDerivatives).values(
      LISTING_ROWS.flatMap((listing) =>
        DERIVATIVES.map((derivative) => ({
          photoId: `${listing.id}-foto`,
          name: derivative.name,
          key: `e2e/${listing.id}/${derivative.name}.webp`,
          bytes: derivative.bytes,
        })),
      ),
    );

    console.log(
      `seed-e2e: ${LISTING_ROWS.length} avisos en ${ZONE_ROWS.length} zonas de dos ciudades, ` +
        "con portada.",
    );
  } finally {
    await pool.end();
  }
}

// Sólo al invocarlo directamente (`pnpm db:test:seed:e2e`), nunca al importarlo:
// las pruebas de navegador leen de acá los ids y los títulos que van a buscar en
// la pantalla, y no pueden pagar una conexión por hacerlo.
if (import.meta.url === `file://${process.argv[1]}`) {
  await seedE2e();
}
