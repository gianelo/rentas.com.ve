import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveContactVerification } from "../../src/modules/identity/application/resolve-contact-verification";
import {
  DrizzleContactVerificationEvidence,
  DrizzleVerifiedContacts,
  type VerifiedContactDatabase,
} from "../../src/modules/identity/infrastructure/drizzle-verified-contact";
import * as schema from "../../src/shared/db/schema";

/**
 * tasks.md 19.9 / 19.10 / 19.13 — contra Postgres de verdad, porque lo que
 * está bajo prueba **es la base y no el código**:
 *
 * 1. La clave primaria `(user_id, method, value)` es la que hace que una
 *    inmobiliaria con cincuenta avisos verifique una vez. Un puerto falso
 *    sólo probaría que el falso está bien escrito.
 * 2. El `LEFT JOIN` del puerto de lectura tiene que devolver la cuenta cuando
 *    NO hay fila de verificación, y la fila cuando la hay — y sólo la del
 *    triple exacto, no la de cualquier otro valor de la misma cuenta.
 * 3. El `ON CONFLICT DO UPDATE` mueve el instante en la misma fila en vez de
 *    escribir una segunda.
 */
function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start the disposable database with " +
        "`pnpm db:test:up && pnpm db:test:migrate`.",
    );
  }
  return url;
}

const pool = new Pool({ connectionString: getTestDatabaseUrl() });
const db = drizzle(pool, { schema }) as unknown as VerifiedContactDatabase;

const evidence = new DrizzleContactVerificationEvidence(db);
const verifiedContacts = new DrizzleVerifiedContacts(db);

const MARIA = randomUUID();
const AGENCIA = randomUUID();
const SIN_CORREO_PROBADO = randomUUID();
const DOS_NUMEROS = randomUUID();

const CORREO_DE_MARIA = `maria-${MARIA}@example.com`;
const CORREO_DE_LA_AGENCIA = `contacto-${AGENCIA}@example.com`;

/**
 * **Sembrado contra el reloj de la base, nunca contra una fecha escrita.**
 * Este proyecto ya se comió dos veces el defecto de una fija que el
 * calendario alcanza y cambia el sujeto de la prueba en silencio.
 */
async function insertUser(
  id: string,
  email: string,
  verifiedDaysAgo: number | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL
                              ELSE now() - make_interval(days => $4::int) END)`,
    [id, `Cuenta ${id}`, email, verifiedDaysAgo],
  );
}

async function countVerifiedRows(userId: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM "verified_contact" WHERE user_id = $1',
    [userId],
  );
  return rows[0].n as number;
}

async function readVerifiedAt(userId: string, method: string, value: string): Promise<Date | null> {
  const { rows } = await pool.query(
    'SELECT verified_at FROM "verified_contact" WHERE user_id = $1 AND method = $2 AND value = $3',
    [userId, method, value],
  );
  return (rows[0]?.verified_at as Date | undefined) ?? null;
}

async function databaseNow(): Promise<Date> {
  const { rows } = await pool.query("SELECT now() AS ahora");
  return rows[0].ahora as Date;
}

beforeAll(async () => {
  await insertUser(MARIA, CORREO_DE_MARIA, 40);
  await insertUser(AGENCIA, CORREO_DE_LA_AGENCIA, 200);
  await insertUser(SIN_CORREO_PROBADO, `sin-probar-${SIN_CORREO_PROBADO}@example.com`, null);
  await insertUser(DOS_NUMEROS, `dos-numeros-${DOS_NUMEROS}@example.com`, 10);
});

afterAll(async () => {
  // `verified_contact` es `ON DELETE cascade` (a diferencia de
  // `listing_report`, que es evidencia y es `restrict`), así que borrar las
  // cuentas se lleva las filas. La base de prueba se comparte entre archivos
  // dentro de una corrida: dejar cuentas atrás es cómo otra suite se
  // encuentra con un correo que no esperaba.
  await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [
    [MARIA, AGENCIA, SIN_CORREO_PROBADO, DOS_NUMEROS],
  ]);
  await pool.end();
});

describe("verified_contact contra Postgres real", () => {
  it("la agencia que sube cincuenta avisos verifica una vez: una escritura, una fila, y cuarenta y nueve que no piden nada", async () => {
    const contact = { method: "email", value: CORREO_DE_LA_AGENCIA } as const;

    const decisiones = [];
    for (let aviso = 0; aviso < 50; aviso += 1) {
      decisiones.push(
        await resolveContactVerification(
          { userId: AGENCIA, contact },
          { evidence, verifiedContacts },
        ),
      );
    }

    // El primero verifica y registra; del segundo en adelante la fila viva ya
    // contesta, que es literalmente la frase de la 19.9.
    expect(decisiones[0]?.kind).toBe("verified-by-account-email");
    expect(decisiones.slice(1).map((decision) => decision.kind)).toEqual(
      Array.from({ length: 49 }, () => "already-verified"),
    );
    expect(await countVerifiedRows(AGENCIA)).toBe(1);
  });

  it("la clave es el triple: otro valor de la misma cuenta es otra fila, y el mismo valor en otra cuenta también", async () => {
    // Lo que esto descarta es la tabla que NO se construyó: una con
    // `user_id` de clave, donde verificar un número dejaría verificado
    // cualquier otro que esa persona escriba después.
    await verifiedContacts.record({
      userId: AGENCIA,
      contact: { method: "whatsapp", value: "+58 261 555 0199" },
      verifiedAt: await databaseNow(),
    });

    expect(await countVerifiedRows(AGENCIA)).toBe(2);

    const suPropioCorreo = await evidence.findEvidence({
      userId: AGENCIA,
      contact: { method: "email", value: CORREO_DE_LA_AGENCIA },
    });
    const elMismoNumeroEnOtraCuenta = await evidence.findEvidence({
      userId: MARIA,
      contact: { method: "whatsapp", value: "+58 261 555 0199" },
    });

    expect(suPropioCorreo?.verifiedAt).toBeInstanceOf(Date);
    expect(elMismoNumeroEnOtraCuenta?.verifiedAt).toBeNull();
    expect(await countVerifiedRows(MARIA)).toBe(0);
  });

  it("verificar un número no verifica el otro número de la misma cuenta, ni el mismo valor por otro método", async () => {
    // **El corazón de la 19d, y la prueba que faltaba.** Sin esto la suite
    // pasaba igual con un `JOIN` que ignorara `value`: quien verifica un
    // número quedaría verificado publicando cualquier otro, que es
    // exactamente lo que hace que la verificación deje de significar nada.
    const verificado = "+58 261 555 0199";
    const otroNumero = "+58 424 111 2233";

    await verifiedContacts.record({
      userId: DOS_NUMEROS,
      contact: { method: "whatsapp", value: verificado },
      verifiedAt: await databaseNow(),
    });

    const elVerificado = await evidence.findEvidence({
      userId: DOS_NUMEROS,
      contact: { method: "whatsapp", value: verificado },
    });
    const elOtro = await evidence.findEvidence({
      userId: DOS_NUMEROS,
      contact: { method: "whatsapp", value: otroNumero },
    });
    // Mismo valor, otro método: un número verificado por WhatsApp no es un
    // teléfono verificado, y el producto los distingue porque el botón dice
    // cuál canal (schema.ts, `ContactMethod`).
    const elMismoValorPorTelefono = await evidence.findEvidence({
      userId: DOS_NUMEROS,
      contact: { method: "telefono", value: verificado },
    });

    expect(elVerificado?.verifiedAt).toBeInstanceOf(Date);
    expect(elOtro?.verifiedAt).toBeNull();
    expect(elMismoValorPorTelefono?.verifiedAt).toBeNull();
  });

  it("un teléfono sin fila viva no escribe nada: la ficha se queda sin fecha que dibujar", async () => {
    // El canal de WhatsApp está diferido al final del proyecto (fundador,
    // 2026-08-29). Esto es lo que impide que su ausencia se lea como
    // verificación: no hay fila, y sin fila no hay «verificado el …».
    const decision = await resolveContactVerification(
      { userId: MARIA, contact: { method: "whatsapp", value: "+58 412 555 0134" } },
      { evidence, verifiedContacts },
    );

    expect(decision).toEqual({ kind: "unverified" });
    expect(await countVerifiedRows(MARIA)).toBe(0);
  });

  it("una cuenta cuyo correo Auth.js nunca marcó no queda verificada por escribir su propia dirección", async () => {
    const { rows } = await pool.query('SELECT email FROM "user" WHERE id = $1', [
      SIN_CORREO_PROBADO,
    ]);

    const decision = await resolveContactVerification(
      { userId: SIN_CORREO_PROBADO, contact: { method: "email", value: rows[0].email as string } },
      { evidence, verifiedContacts },
    );

    expect(decision).toEqual({ kind: "unverified" });
    expect(await countVerifiedRows(SIN_CORREO_PROBADO)).toBe(0);
  });

  it("volver a verificar mueve el instante en la misma fila en vez de dejar dos", async () => {
    // La decisión de que la tabla guarda ESTADO y no una bitácora, comprobada
    // donde vive: en el `ON CONFLICT DO UPDATE`. Si fuese append-only, ésta
    // sería la prueba de que quedan dos filas y la ficha tendría que agrupar
    // por `max(verified_at)` en cada visita.
    const contact = { method: "email", value: CORREO_DE_MARIA } as const;
    const ahora = await databaseNow();
    const hace30Dias = new Date(ahora.getTime() - 30 * 86_400_000);

    await verifiedContacts.record({ userId: MARIA, contact, verifiedAt: hace30Dias });
    expect(await readVerifiedAt(MARIA, "email", CORREO_DE_MARIA)).toEqual(hace30Dias);

    await verifiedContacts.record({ userId: MARIA, contact, verifiedAt: ahora });

    expect(await countVerifiedRows(MARIA)).toBe(1);
    expect(await readVerifiedAt(MARIA, "email", CORREO_DE_MARIA)).toEqual(ahora);
  });

  /**
   * **De quién es la garantía de la 19.13, preguntándoselo a Postgres.**
   * «Una inmobiliaria que sube cincuenta avisos verifica una vez» se lee
   * arriba como una consecuencia del código —`resolveContactVerification` no
   * llega a escribir—, y eso es cierto pero no es lo que la tarea afirma. La
   * tarea afirma que **la clave primaria no deja escribir una segunda fila**,
   * y eso sólo se comprueba intentándolo: una escritura desnuda, sin el
   * `ON CONFLICT` del adaptador, que es justamente el que hoy absorbe el
   * choque y por lo tanto lo esconde.
   *
   * Lo que esto descarta es el día en que alguien mueva la primaria —a la
   * cuenta sola, o agregándole `verified_at` para «guardar el historial»— y
   * la suite siga verde porque nadie escribió nunca dos veces el mismo triple
   * sin red.
   */
  it("la segunda fila del mismo triple la rechaza Postgres, no un `if` de la aplicación", async () => {
    const numero = "+58 414 555 0001";
    const ahora = await databaseNow();
    const antes = await countVerifiedRows(DOS_NUMEROS);

    const escribir = (valor: string, instante: Date) =>
      pool.query(
        `INSERT INTO "verified_contact" (user_id, method, value, verified_at)
         VALUES ($1, $2, $3, $4)`,
        [DOS_NUMEROS, "whatsapp", valor, instante],
      );

    await escribir(numero, ahora);

    // El segundo aviso, con el mismo contacto y otro instante: la base lo
    // rechaza por su nombre, y no queda a medio escribir.
    const rechazo: { code?: string; constraint?: string } | null = await escribir(
      numero,
      new Date(ahora.getTime() + 1000),
    ).then(
      () => null,
      (error: { code?: string; constraint?: string }) => error,
    );

    expect(rechazo?.code).toBe("23505");
    expect(rechazo?.constraint).toBe("verified_contact_user_id_method_value_pk");

    // **La pareja positiva, para que la negativa signifique algo**: otro valor
    // de la misma cuenta entra sin pelear, así que lo que la primaria frena es
    // el duplicado del triple y no la escritura.
    await escribir("+58 414 555 0002", ahora);

    expect(await countVerifiedRows(DOS_NUMEROS)).toBe(antes + 2);
  });
});
