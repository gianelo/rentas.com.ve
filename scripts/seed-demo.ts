/**
 * Avisos de demostración, con fotos reales subidas a R2.
 *
 * **Existe porque el sitio se veía vacío y no estaba roto.** La base tenía diez
 * avisos activos y CERO fotos, y la regla F9 —«un aviso sin foto no entra en la
 * cuadrícula»— los descartaba a los diez. Las tiras del inicio quedaban vacías,
 * y una tira vacía desaparece: la pantalla no mostraba nada en lo que hacer
 * clic. La regla es correcta; lo que faltaba era el dato.
 *
 * **Pasa por el pipeline real de publicación, no por uno paralelo.** Las mismas
 * `deriveListingPhoto` y `R2PhotoStorage` que corren cuando alguien publica de
 * verdad, y la misma convención de clave (`photos/<publisher>/<token>/<n>.webp`).
 * Un camino de siembra propio se separa del real en el primer cambio, y después
 * la demo se ve bien mientras la publicación real está rota.
 *
 * **Contacto por correo a un dominio `.invalid`** (RFC 2606, que no resuelve
 * nunca). Un WhatsApp inventado en producción manda a un desconocido los
 * mensajes de quien crea que el aviso es real, y eso no se arregla con un
 * cartel de «demo».
 *
 * Idempotente: los ids salen de un hash del propio aviso, así que correrlo dos
 * veces actualiza en vez de duplicar.
 *
 *     pnpm tsx scripts/seed-demo.ts            # crea o actualiza
 *     pnpm tsx scripts/seed-demo.ts --purge    # los borra a todos
 */

import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import sharp from "sharp";
import { deriveListingPhoto } from "../src/modules/listing-publication/infrastructure/photo-derivatives";
import {
  createR2PhotoStorage,
  DERIVATIVE_CONTENT_TYPE,
} from "../src/modules/listing-publication/infrastructure/r2-photo-storage";

process.loadEnvFile(".env");

const sql = neon(requireEnv("DATABASE_URL"));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`seed-demo: falta ${name}.`);
  return value;
}

/**
 * El mismo prefijo que usa `process-uploaded-photo`. Está repetido acá y no
 * importado porque allá es privado del módulo, y exportarlo sólo para esto
 * ensancharía una API pública para una herramienta.
 */
const PROMOTED_PREFIX = "photos";

/** Marca de agua en los ids, para poder borrarlos todos sin adivinar. */
const DEMO_TAG = "demo-2026-08";

function demoId(seed: string): string {
  const hex = createHash("sha256").update(`${DEMO_TAG}:${seed}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

interface Demo {
  readonly zone: string;
  readonly city: string;
  readonly title: string;
  readonly propertyType: "apartamento" | "casa" | "quinta" | "anexo" | "habitacion";
  readonly publisherType: "owner" | "broker";
  readonly priceUsd: number;
  readonly rooms: number;
  readonly bathrooms: number;
  readonly areaM2: number;
  readonly parkingSpots: number;
  readonly hasPowerPlant: boolean;
  readonly hasRegularWater: boolean;
  readonly isFurnished: boolean;
  readonly hasSecurity: boolean;
  readonly hasAppliances: boolean;
  /** Hace cuántos días se publicó. Escalonado para que «recientes» signifique algo. */
  readonly daysAgo: number;
  /** Tono de las fotos, para distinguir un aviso de otro de un vistazo. */
  readonly hue: number;
}

/**
 * Doce avisos, elegidos para que **las cuatro tiras del inicio se llenen**:
 * recientes, cada ciudad, y hasta $400. Sin avisos baratos la cuarta tira
 * desaparece y parecería un error de la consulta.
 */
const DEMOS: readonly Demo[] = [
  {
    zone: "Chacao",
    city: "Distrito Capital",
    title: "Apartamento 2 habitaciones con puesto de estacionamiento",
    propertyType: "apartamento",
    publisherType: "owner",
    priceUsd: 450,
    rooms: 2,
    bathrooms: 2,
    areaM2: 78,
    parkingSpots: 1,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: false,
    hasSecurity: true,
    hasAppliances: true,
    daysAgo: 1,
    hue: 205,
  },
  {
    zone: "Altamira",
    city: "Distrito Capital",
    title: "Apartamento amoblado con vista abierta",
    propertyType: "apartamento",
    publisherType: "broker",
    priceUsd: 720,
    rooms: 3,
    bathrooms: 2,
    areaM2: 110,
    parkingSpots: 2,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: true,
    hasSecurity: true,
    hasAppliances: true,
    daysAgo: 2,
    hue: 25,
  },
  {
    zone: "Los Palos Grandes",
    city: "Distrito Capital",
    title: "Anexo independiente con entrada propia",
    propertyType: "anexo",
    publisherType: "owner",
    priceUsd: 320,
    rooms: 1,
    bathrooms: 1,
    areaM2: 42,
    parkingSpots: 0,
    hasPowerPlant: false,
    hasRegularWater: true,
    isFurnished: true,
    hasSecurity: false,
    hasAppliances: false,
    daysAgo: 3,
    hue: 140,
  },
  {
    zone: "La Castellana",
    city: "Distrito Capital",
    title: "Quinta con jardín y planta eléctrica",
    propertyType: "quinta",
    publisherType: "owner",
    priceUsd: 1200,
    rooms: 4,
    bathrooms: 3,
    areaM2: 260,
    parkingSpots: 3,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: false,
    hasSecurity: true,
    hasAppliances: false,
    daysAgo: 5,
    hue: 95,
  },
  {
    zone: "Las Mercedes",
    city: "Distrito Capital",
    title: "Habitación en apartamento compartido",
    propertyType: "habitacion",
    publisherType: "owner",
    priceUsd: 180,
    rooms: 1,
    bathrooms: 1,
    areaM2: 18,
    parkingSpots: 0,
    hasPowerPlant: false,
    hasRegularWater: true,
    isFurnished: true,
    hasSecurity: true,
    hasAppliances: true,
    daysAgo: 6,
    hue: 320,
  },
  {
    zone: "El Rosal",
    city: "Distrito Capital",
    title: "Apartamento reformado cerca del metro",
    propertyType: "apartamento",
    publisherType: "broker",
    priceUsd: 390,
    rooms: 2,
    bathrooms: 1,
    areaM2: 65,
    parkingSpots: 1,
    hasPowerPlant: false,
    hasRegularWater: true,
    isFurnished: false,
    hasSecurity: true,
    hasAppliances: false,
    daysAgo: 8,
    hue: 260,
  },
  {
    zone: "Bella Vista",
    city: "Maracaibo",
    title: "Apartamento con planta eléctrica y tanque propio",
    propertyType: "apartamento",
    publisherType: "owner",
    priceUsd: 350,
    rooms: 3,
    bathrooms: 2,
    areaM2: 95,
    parkingSpots: 1,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: false,
    hasSecurity: true,
    hasAppliances: true,
    daysAgo: 1,
    hue: 190,
  },
  {
    zone: "Tierra Negra",
    city: "Maracaibo",
    title: "Casa familiar de una planta con patio",
    propertyType: "casa",
    publisherType: "owner",
    priceUsd: 480,
    rooms: 3,
    bathrooms: 2,
    areaM2: 140,
    parkingSpots: 2,
    hasPowerPlant: true,
    hasRegularWater: false,
    isFurnished: false,
    hasSecurity: false,
    hasAppliances: false,
    daysAgo: 4,
    hue: 40,
  },
  {
    zone: "La Lago",
    city: "Maracaibo",
    title: "Apartamento amoblado frente al lago",
    propertyType: "apartamento",
    publisherType: "broker",
    priceUsd: 600,
    rooms: 2,
    bathrooms: 2,
    areaM2: 88,
    parkingSpots: 1,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: true,
    hasSecurity: true,
    hasAppliances: true,
    daysAgo: 7,
    hue: 220,
  },
  {
    zone: "Indio Mara",
    city: "Maracaibo",
    title: "Anexo económico para una persona",
    propertyType: "anexo",
    publisherType: "owner",
    priceUsd: 220,
    rooms: 1,
    bathrooms: 1,
    areaM2: 35,
    parkingSpots: 0,
    hasPowerPlant: false,
    hasRegularWater: false,
    isFurnished: false,
    hasSecurity: false,
    hasAppliances: false,
    daysAgo: 9,
    hue: 15,
  },
  {
    zone: "Bella Vista",
    city: "Maracaibo",
    title: "Apartamento de dos habitaciones con vigilancia",
    propertyType: "apartamento",
    publisherType: "broker",
    priceUsd: 400,
    rooms: 2,
    bathrooms: 2,
    areaM2: 72,
    parkingSpots: 1,
    hasPowerPlant: true,
    hasRegularWater: true,
    isFurnished: false,
    hasSecurity: true,
    hasAppliances: false,
    daysAgo: 11,
    hue: 170,
  },
  {
    zone: "Chacao",
    city: "Distrito Capital",
    title: "Estudio luminoso en edificio con ascensor",
    propertyType: "apartamento",
    publisherType: "owner",
    priceUsd: 280,
    rooms: 1,
    bathrooms: 1,
    areaM2: 38,
    parkingSpots: 0,
    hasPowerPlant: false,
    hasRegularWater: true,
    isFurnished: true,
    hasSecurity: true,
    hasAppliances: true,
    daysAgo: 13,
    hue: 285,
  },
];

/** Los tres ambientes que se fotografían, en el orden en que se miran. */
const ROOM_LABELS = ["Sala comedor", "Habitación principal", "Cocina"] as const;

/**
 * Genera una foto de prueba **reconocible**. No es relleno gris: cada aviso
 * tiene su tono y cada foto dice qué ambiente es, para que al mirar la
 * cuadrícula se distinga un aviso de otro y se note cuál portada salió mal.
 *
 * 1.600 px de borde mayor, que es lo que el formulario real acepta antes de
 * comprimir — así la derivación trabaja sobre el mismo tamaño que en producción.
 */
async function makePhoto(hue: number, index: number, title: string): Promise<Buffer> {
  const width = 1600;
  const height = 1067;
  const label = ROOM_LABELS[index] ?? `Ambiente ${index + 1}`;
  const light = `hsl(${hue}, 42%, ${62 - index * 6}%)`;
  const dark = `hsl(${(hue + 24) % 360}, 38%, ${34 - index * 4}%)`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${light}"/><stop offset="100%" stop-color="${dark}"/>
  </linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <rect x="0" y="${height - 260}" width="${width}" height="260" fill="rgba(0,0,0,.34)"/>
  <text x="72" y="${height - 152}" font-family="Helvetica,Arial,sans-serif" font-size="72" font-weight="700" fill="#ffffff">${escapeXml(label)}</text>
  <text x="72" y="${height - 74}" font-family="Helvetica,Arial,sans-serif" font-size="40" fill="rgba(255,255,255,.82)">${escapeXml(title.slice(0, 52))}</text>
</svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

async function purge(): Promise<void> {
  const ids = DEMOS.map((demo) => demoId(`${demo.city}/${demo.zone}/${demo.title}`));
  // Las fotos y las derivadas caen solas: las dos claves foráneas son
  // ON DELETE CASCADE. Los objetos de R2 quedan huérfanos a propósito —
  // borrarlos es la tarea 19.4 y no la escribo a mano acá.
  const deleted = await sql`delete from "listing" where id = any(${ids}) returning id`;
  console.log(`seed-demo: ${deleted.length} aviso(s) de demostración borrados.`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--purge")) return purge();

  const storage = createR2PhotoStorage();

  const cities = await sql`select id, name from "city"`;
  const zones = await sql`select id, name, city_id from "zone"`;
  const [publisher] = await sql`
    select id from "user" where email = 'seed-owner@rentas.invalid' limit 1`;
  if (!publisher) throw new Error("seed-demo: falta el publicante de ejemplo. Corré pnpm db:seed.");

  const cityByName = new Map(cities.map((c) => [c.name as string, c.id as string]));
  const zoneByKey = new Map(zones.map((z) => [`${z.city_id}/${z.name}`, z.id as string]));

  let done = 0;
  for (const demo of DEMOS) {
    const cityId = cityByName.get(demo.city);
    const zoneId = cityId ? zoneByKey.get(`${cityId}/${demo.zone}`) : undefined;
    if (!cityId || !zoneId) {
      console.warn(`seed-demo: sin catálogo para ${demo.city} / ${demo.zone} — se omite.`);
      continue;
    }

    const listingId = demoId(`${demo.city}/${demo.zone}/${demo.title}`);
    const publishedAt = new Date(Date.now() - demo.daysAgo * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    const description =
      `${demo.title}. Ubicado en ${demo.zone}, ${demo.city}. ` +
      `Son ${demo.areaM2} metros cuadrados con ${demo.rooms} ${demo.rooms === 1 ? "habitación" : "habitaciones"} ` +
      `y ${demo.bathrooms} ${demo.bathrooms === 1 ? "baño" : "baños"}. ` +
      `${demo.parkingSpots > 0 ? `Incluye ${demo.parkingSpots} puesto${demo.parkingSpots > 1 ? "s" : ""} de estacionamiento. ` : "Sin puesto de estacionamiento. "}` +
      `${demo.hasPowerPlant ? "El edificio tiene planta eléctrica. " : ""}` +
      `${demo.hasRegularWater ? "El agua llega todos los días. " : ""}` +
      "Este es un aviso de demostración: el contacto no corresponde a ninguna persona real.";

    await sql`
      insert into "listing" (
        id, publisher_id, publisher_type, property_type, city_id, zone_id, title, description,
        price_usd, rooms, area_m2, bathrooms, parking_spots,
        has_power_plant, has_regular_water, is_furnished, has_security, has_appliances,
        contact_method, contact_value, status, published_at, expires_at)
      values (
        ${listingId}, ${publisher.id}, ${demo.publisherType}, ${demo.propertyType}, ${cityId}, ${zoneId},
        ${demo.title}, ${description},
        ${demo.priceUsd}, ${demo.rooms}, ${demo.areaM2}, ${demo.bathrooms}, ${demo.parkingSpots},
        ${demo.hasPowerPlant}, ${demo.hasRegularWater}, ${demo.isFurnished}, ${demo.hasSecurity}, ${demo.hasAppliances},
        'email', ${`demo-${listingId.slice(0, 8)}@rentas.invalid`}, 'active', ${publishedAt}, ${expiresAt})
      on conflict (id) do update set
        title = excluded.title, description = excluded.description, price_usd = excluded.price_usd,
        published_at = excluded.published_at, expires_at = excluded.expires_at, status = 'active'`;

    // Se rehacen enteras en cada corrida: media foto vieja mezclada con una
    // nueva es exactamente el estado que la cuadrícula descarta en silencio.
    await sql`delete from "listing_photo" where listing_id = ${listingId}`;

    for (let position = 0; position < 3; position += 1) {
      const photoId = demoId(`${listingId}/foto/${position}`);
      const token = photoId.replace(/-/g, "").slice(0, 24);
      const source = await makePhoto(demo.hue, position, demo.title);
      const derivatives = await deriveListingPhoto(source);

      // `created_at` es NOT NULL y **sin default**, a propósito: el esquema no
      // quiere que una fila de foto exista sin saber cuándo llegó. Se le da la
      // fecha del aviso y no `now()`, para que una demo publicada «hace 9 días»
      // tenga fotos de hace nueve días y no de hace un minuto.
      await sql`
        insert into "listing_photo" (id, listing_id, position, created_at)
        values (${photoId}, ${listingId}, ${position}, ${publishedAt})`;

      // Las cinco en paralelo, igual que el pipeline real: son cinco PUT
      // independientes y encadenarlos multiplica por cinco la latencia.
      const names = ["thumb", "card", "strip", "detail", "full"] as const;
      const stored = await Promise.all(
        names.map(async (name) => {
          const put = await storage.put(
            `${PROMOTED_PREFIX}/${publisher.id}/${token}/${name}.webp`,
            derivatives[name].bytes,
            DERIVATIVE_CONTENT_TYPE,
          );
          return { name, key: put.key, bytes: put.byteLength };
        }),
      );

      for (const d of stored) {
        await sql`
          insert into "listing_photo_derivative" (photo_id, name, key, bytes)
          values (${photoId}, ${d.name}, ${d.key}, ${d.bytes})`;
      }
    }

    done += 1;
    console.log(`seed-demo: ${done}/${DEMOS.length}  ${demo.title.slice(0, 46)}`);
  }

  console.log(`seed-demo: listo. ${done} avisos con 3 fotos cada uno, 5 tamaños por foto.`);
}

await main();
