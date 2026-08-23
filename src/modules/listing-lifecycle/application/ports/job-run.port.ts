/**
 * El registro de cada corrida (tasks.md 7.7).
 *
 * Se escribe SIEMPRE, incluso cuando no había nada que hacer: una fila con
 * ceros dice «corrió y no había nadie», y la ausencia de fila dice «no corrió».
 * Sin esa diferencia, un cron apagado se ve igual que un catálogo tranquilo —
 * y este proyecto ya perdió cuatro días exactamente así, con las migraciones
 * sin aplicar.
 */
export interface JobRunRecord {
  readonly job: "expiry-reminders" | "photo-purge";
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly selected: number;
  readonly succeeded: number;
  readonly skipped: number;
  readonly failed: number;
  /** Las razones, ya recortadas. `null` cuando no hubo fallas. */
  readonly failureDetail: string | null;
}

export interface JobRunPort {
  record(run: JobRunRecord): Promise<void>;
}
