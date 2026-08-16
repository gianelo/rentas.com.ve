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
 */
export function CityZoneSelect({
  cities,
  zones,
  selectedCityId,
  selectedZoneId,
}: CityZoneSelectProps) {
  const zonesForSelectedCity = selectedCityId
    ? zones.filter((zone) => zone.cityId === selectedCityId)
    : [];

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
