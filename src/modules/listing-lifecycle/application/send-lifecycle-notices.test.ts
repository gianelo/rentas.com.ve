import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRunPort, JobRunRecord } from "./ports/job-run.port";
import type {
  LifecycleListing,
  LifecycleListingsPort,
  RenewRequest,
} from "./ports/lifecycle-listings.port";
import type { LifecycleMailerPort, LifecycleMessage } from "./ports/lifecycle-mailer.port";
import type { ReminderClaim, ReminderLedgerPort } from "./ports/reminder-ledger.port";
import { sendLifecycleNotices } from "./send-lifecycle-notices";

const NOW = new Date("2026-08-28T10:00:00.000Z");
const EXPIRES_AT = new Date("2026-08-31T10:00:00.000Z");
const SECRET = "secreto";
const BASE_URL = "https://rentas.com.ve";

function listing(overrides: Partial<LifecycleListing> = {}): LifecycleListing {
  return {
    id: "aviso-1",
    title: "Apartamento 2 habitaciones",
    expiresAt: EXPIRES_AT,
    publisherEmail: "maria@example.com",
    ...overrides,
  };
}

/**
 * Un libro de reservas con la MISMA garantía que Postgres: la clave de tres
 * columnas. Un doble llamado con la misma clave pierde, igual que el índice
 * único — que es lo que hace que esta prueba diga algo sobre el sistema real
 * en vez de sobre un fake escrito para pasar.
 */
function ledger(): ReminderLedgerPort & { readonly claimed: Set<string> } {
  const claimed = new Set<string>();
  const key = (c: { listingId: string; kind: string; expiresAt: Date }) =>
    `${c.listingId}|${c.kind}|${c.expiresAt.toISOString()}`;
  return {
    claimed,
    async claim(c: ReminderClaim) {
      if (claimed.has(key(c))) return false;
      claimed.add(key(c));
      return true;
    },
    async release(c) {
      claimed.delete(key(c));
    },
  };
}

function listings(rows: readonly LifecycleListing[]): LifecycleListingsPort {
  return {
    markExpired: vi.fn(async () => 0),
    noticeCandidates: vi.fn(async () => rows),
    findRenewable: vi.fn(async () => null),
    renew: vi.fn(async (_request: RenewRequest) => false),
  };
}

let sent: LifecycleMessage[];
let runs: JobRunRecord[];
let mailer: LifecycleMailerPort;
let jobRuns: JobRunPort;

beforeEach(() => {
  sent = [];
  runs = [];
  mailer = {
    send: vi.fn(async (message: LifecycleMessage) => {
      sent.push(message);
    }),
  };
  jobRuns = {
    record: vi.fn(async (run: JobRunRecord) => {
      runs.push(run);
    }),
  };
});

function dependencies(rows: readonly LifecycleListing[], book = ledger()) {
  return {
    listings: listings(rows),
    ledger: book,
    mailer,
    jobRuns,
    renewalSecret: SECRET,
    baseUrl: BASE_URL,
    now: () => NOW,
  };
}

describe("sendLifecycleNotices", () => {
  it("manda el aviso de vencimiento con un enlace de renovación", async () => {
    const result = await sendLifecycleNotices(dependencies([listing()]));

    expect(result.remindersSent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("maria@example.com");
    expect(sent[0]?.body).toContain(`${BASE_URL}/renovar/`);
  });

  // **La mutación que carga el peso.** Dos corridas seguidas sobre el mismo
  // aviso mandan UN correo. Lo que lo garantiza es la reserva, no un `if`
  // sobre una lectura: si el caso de uso preguntara antes de escribir, este
  // mismo libro dejaría pasar las dos.
  it("una segunda corrida no vuelve a mandar el mismo correo", async () => {
    const book = ledger();
    const deps = dependencies([listing()], book);

    const first = await sendLifecycleNotices(deps);
    const second = await sendLifecycleNotices(deps);

    expect(first.remindersSent).toBe(1);
    expect(second.remindersSent).toBe(0);
    expect(second.skipped).toBe(1);
    expect(sent).toHaveLength(1);
  });

  // Los DOS correos, y por qué la clave lleva `kind`: el mismo aviso, el mismo
  // ciclo, dos momentos distintos, dos correos distintos. Con una clave de dos
  // columnas el segundo chocaría con el primero y no saldría nunca.
  it("el aviso de purga sale aunque el de vencimiento ya se haya mandado", async () => {
    const book = ledger();

    await sendLifecycleNotices(dependencies([listing()], book));
    const purgeRun = await sendLifecycleNotices({
      ...dependencies([listing()], book),
      now: () => new Date("2026-09-10T10:00:00.000Z"),
    });

    expect(purgeRun.remindersSent).toBe(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.subject.toLowerCase()).toContain("foto");
  });

  it("marca vencidos antes de mirar a quién avisar", async () => {
    const deps = dependencies([]);
    await sendLifecycleNotices(deps);

    expect(deps.listings.markExpired).toHaveBeenCalledWith(NOW);
  });

  it("no le escribe a quien no tiene correo, y lo cuenta como falla", async () => {
    const result = await sendLifecycleNotices(dependencies([listing({ publisherEmail: null })]));

    expect(sent).toHaveLength(0);
    expect(result.failed).toBe(1);
  });

  // Un proveedor caído no puede dejar sin avisar al resto de la tanda, y
  // tampoco puede consumir el único envío del ciclo: la reserva se devuelve.
  it("una falla del correo devuelve la reserva y no detiene los demás", async () => {
    const book = ledger();
    mailer.send = vi.fn(async (message: LifecycleMessage) => {
      if (message.to === "roto@example.com") throw new Error("proveedor caído");
      sent.push(message);
    });

    const result = await sendLifecycleNotices(
      dependencies(
        [listing({ id: "roto", publisherEmail: "roto@example.com" }), listing({ id: "bueno" })],
        book,
      ),
    );

    expect(result.failed).toBe(1);
    expect(result.remindersSent).toBe(1);
    expect(book.claimed.size).toBe(1);
    expect(runs[0]?.failureDetail).toContain("proveedor caído");
  });

  // Una fila con ceros dice «corrió y no había nadie». La ausencia de fila
  // dice «no corrió». Sin esa diferencia un cron apagado se ve igual que un
  // catálogo tranquilo.
  it("registra la corrida aunque no haya nada que hacer", async () => {
    await sendLifecycleNotices(dependencies([]));

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      job: "expiry-reminders",
      selected: 0,
      succeeded: 0,
      failed: 0,
      failureDetail: null,
    });
  });

  it("ignora un candidato al que hoy no le toca ningún correo", async () => {
    const result = await sendLifecycleNotices(
      dependencies([listing({ expiresAt: new Date("2026-12-31T10:00:00.000Z") })]),
    );

    expect(result.remindersSent).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
