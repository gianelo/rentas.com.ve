import { zonesForCity } from "../../src/modules/listing-catalogue/domain/catalogue";
import { AppLink } from "../atoms/AppLink";
import { ActionButton } from "../atoms/buttons";
import { Label } from "../atoms/Label";
import styles from "./CityZoneSelect.module.css";

export interface City {
  id: string;
  name: string;
}

export interface Zone {
  id: string;
  name: string;
  cityId: string;
}

export interface CityZoneSelectProps {
  cities: readonly City[];
  zones: readonly Zone[];
  selectedCityId?: string;
  selectedZoneId?: string;
}

/**
 * Server-rendered cascading city -> zone filter (tasks.md 2.4/2.5,
 * design.md D13, D5). A native `<form method="get">` with two `<select>`
 * elements and a visible submit button — no `onChange` handler, and this
 * stays a plain server component. Changing the city resubmits as a GET;
 * the browser navigates to the same URL with a new `city` query
 * parameter, the server re-renders, and this component rebuilds the zone
 * `<select>` already filtered. Zero runtime JS ships for this control.
 *
 * The filter lives inside this component, not its caller (design.md D5's
 * "guarantees live in the narrowest API" applied to the read path): a
 * caller passes every curated zone plus the selected city id, and cannot
 * leak a mismatched pair by forgetting to filter, because there is
 * nothing left for it to filter.
 *
 * KNOWN GAP, and it belongs to whoever reads these query parameters, not
 * here: a GET form submits whatever the controls currently hold. Pick a new
 * city without touching the zone and the browser sends the previous city's
 * zone — `?city=<maracaibo>&zone=<AppLink caracas zone>` — because the page has
 * not re-rendered yet. Nothing is written, so D5's database constraint is
 * not involved and cannot help. **The server MUST ignore a zone that does
 * not belong to the submitted city** rather than returning empty results or,
 * worse, treating the pair as meaningful. This component cannot prevent it:
 * it does not control what the browser posts. Search (PR5) is where that
 * rule has to live.
 */
export function CityZoneSelect({
  cities,
  zones,
  selectedCityId,
  selectedZoneId,
}: CityZoneSelectProps) {
  // The narrowing rule lives in listing-catalogue's domain, not here. It read
  // `zones.filter(...)` inline until 2026-08-21; it is the same D5 rule the
  // search filters need, and two components each holding their own copy is
  // how the two screens start disagreeing.
  const zonesForSelectedCity = zonesForCity(zones, selectedCityId);

  return (
    <form method="get" className={styles.form}>
      <div className={styles.field}>
        <Label htmlFor="city">Ciudad</Label>
        <select id="city" name="city" defaultValue={selectedCityId ?? ""} className={styles.select}>
          <option value="">Todas las ciudades</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <Label htmlFor="zone">Zona</Label>
        <select id="zone" name="zone" defaultValue={selectedZoneId ?? ""} className={styles.select}>
          <option value="">Todas las zonas</option>
          {zonesForSelectedCity.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </div>

      <ActionButton type="submit">Filtrar</ActionButton>
    </form>
  );
}
